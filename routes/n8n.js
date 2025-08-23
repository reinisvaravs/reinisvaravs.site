import express from "express";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();
import {
  formattedCalendarAvailability,
  bookCalendarEvent,
} from "../gCalendar.js";
import EmailService from "../emailService.js";

const router = express.Router();

// Multer configuration for file uploads
const upload = multer({
  dest: "uploads/",
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      // Create uploads directory if it doesn't exist
      const uploadDir = "uploads/";
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname);
    },
  }),
});

// __dirname replacement for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  const auth = new GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
  return google.drive({ version: "v3", auth });
}

// .docx to Google Doc
router.post("/convert-docx", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const config = JSON.parse(process.env.ALL_CONFIGS)[apiKey];
  const drive_id = config.drive_id;

  const { from, to, file_id } = req.body;
  if (!from || !to || !file_id) {
    return res
      .status(400)
      .send('Missing "from", "to", or "file_id" in request body');
  }
  try {
    const drive = await getDriveClient();
    // Check that the file exists in the source folder and is a .docx
    const fileRes = await drive.files.get({
      fileId: file_id,
      fields: "id, name, mimeType, parents",
      supportsAllDrives: true,
    });
    const file = fileRes.data;
    if (
      !file.parents ||
      !file.parents.includes(from) ||
      file.mimeType !==
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return res.status(400).send("File is not a .docx in the source folder");
    }
    const baseName = file.name.replace(/\.docx$/, "");

    // Convert/copy the file as Google Doc into the "from" folder
    const copyRes = await drive.files.copy({
      fileId: file_id,
      requestBody: {
        name: baseName,
        parents: [from],
        mimeType: "application/vnd.google-apps.document",
        driveId: drive_id,
      },
      supportsAllDrives: true,
    });
    const newFile = copyRes.data;

    // Move the original file to the "to" folder
    await drive.files.update({
      fileId: file_id,
      addParents: to,
      removeParents: from,
      supportsAllDrives: true,
    });

    // Build metadata with url
    let url = `https://docs.google.com/document/d/${newFile.id}/edit`;
    const metadata = {
      id: newFile.id,
      name: newFile.name,
      mimeType: newFile.mimeType,
      parents: newFile.parents,
      url,
    };
    res.status(200).json(metadata);
  } catch (err) {
    console.error("[API] Error in /convert-single-docx:", err.stack || err);
    res.status(500).send("Error: " + (err.stack || err.message || err));
  }
});

// Convert audio file to specified format
router.post("/convert-audio", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  // Ensure converted folder exists (only when this route is called)
  const convertedDir = path.join(__dirname, "..", "converted");
  if (!fs.existsSync(convertedDir)) {
    fs.mkdirSync(convertedDir, { recursive: true });
  }

  // Get output format from query parameter or default to mp3
  const outputFormat = req.query.format || "mp3";

  // Validate output format
  const supportedFormats = [
    "flac",
    "m4a",
    "mp3",
    "mp4",
    "mpeg",
    "mpga",
    "oga",
    "ogg",
    "wav",
    "webm",
  ];
  if (!supportedFormats.includes(outputFormat)) {
    return res.status(400).json({
      error: `Unsupported format: ${outputFormat}. Supported formats: ${supportedFormats.join(
        ", "
      )}`,
    });
  }

  const inputPath = req.file.path;
  const outputPath = path.join(convertedDir, `${Date.now()}.${outputFormat}`);

  ffmpeg(inputPath)
    .toFormat(outputFormat)
    .on("end", () => {
      const fileStream = fs.createReadStream(outputPath);

      // Set appropriate content type based on format
      const contentTypes = {
        flac: "audio/flac",
        m4a: "audio/mp4",
        mp3: "audio/mpeg",
        mp4: "video/mp4",
        mpeg: "audio/mpeg",
        mpga: "audio/mpeg",
        oga: "audio/ogg",
        ogg: "audio/ogg",
        wav: "audio/wav",
        webm: "audio/webm",
      };

      res.setHeader("Content-Type", contentTypes[outputFormat] || "audio/mpeg");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=converted.${outputFormat}`
      );
      fileStream.pipe(res);

      fileStream.on("end", () => {
        // Clean up temporary files
        try {
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
        } catch (err) {
          console.error("Error cleaning up files:", err);
        }
      });
    })
    .on("error", (err) => {
      console.error("FFmpeg error:", err.message);
      // Clean up input file on error
      try {
        fs.unlinkSync(inputPath);
      } catch (cleanupErr) {
        console.error("Error cleaning up input file:", cleanupErr);
      }
      res.status(500).json({ error: "Audio conversion failed" });
    })
    .save(outputPath);
});

router.post("/get_calendar_availability", async (req, res) => {
  try {
    // Validate request body exists
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        error: "Request body is required and must be an object",
      });
    }

    // Get API key for authentication
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({
        error: "Missing x-api-key header",
      });
    }

    // Helper function to compute Riga UTC offset (DST-aware)
    const computeRigaOffsetHours = (date = new Date()) => {
      const riga = new Date(
        date.toLocaleString("en-US", { timeZone: "Europe/Riga" })
      );
      const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
      return (riga.getTime() - utc.getTime()) / (60 * 60 * 1000);
    };

    // Extract variables from request body (non-secret variables come from body)
    const {
      google_calendar_email,
      timezone = "Europe/Riga",
      days = 7,
      work_start_hour = 9,
      work_end_hour = 17,
      utc_offset = computeRigaOffsetHours(),
      include_weekends = false,
      slot_duration_minutes = 60,
      buffer_before_minutes = 0,
      buffer_after_minutes = 0,
    } = req.body;

    // Get service account key from environment (secret - not from body)
    const google_service_account_key = process.env.GOOGLE_CREDENTIALS;

    // Validate required variables
    if (!google_calendar_email) {
      return res.status(400).json({
        error: "google_calendar_email is required in request body",
      });
    }

    if (!google_service_account_key) {
      return res.status(500).json({
        error: "Service account credentials not configured",
        message: "GOOGLE_CREDENTIALS environment variable is missing",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(google_calendar_email)) {
      return res.status(400).json({
        error: "google_calendar_email must be a valid email format",
      });
    }

    // Parse service account key from environment
    let serviceAccountKeyObject;
    try {
      serviceAccountKeyObject = JSON.parse(google_service_account_key);
    } catch (e) {
      return res.status(500).json({
        error: "Invalid service account credentials format",
        message:
          "GOOGLE_CREDENTIALS environment variable contains invalid JSON",
      });
    }

    // Validate service account key structure
    if (
      !serviceAccountKeyObject.client_email ||
      !serviceAccountKeyObject.private_key ||
      !serviceAccountKeyObject.project_id
    ) {
      return res.status(400).json({
        error: "Invalid service account key structure",
        message:
          "Service account key must contain client_email, private_key, and project_id fields",
      });
    }

    // Validate numeric variables with reasonable bounds
    const validatedDays = Math.max(1, Math.min(365, Number(days)));
    const validatedWorkStartHour = Math.max(
      0,
      Math.min(23, Number(work_start_hour))
    );
    const validatedWorkEndHour = Math.max(
      0,
      Math.min(23, Number(work_end_hour))
    );
    const validatedSlotDuration = Math.max(
      15,
      Math.min(480, Number(slot_duration_minutes))
    );
    const validatedBufferBefore = Math.max(
      0,
      Math.min(120, Number(buffer_before_minutes))
    );
    const validatedBufferAfter = Math.max(
      0,
      Math.min(120, Number(buffer_after_minutes))
    );

    // Validate work hours logic
    if (validatedWorkStartHour >= validatedWorkEndHour) {
      return res.status(400).json({
        error: "work_start_hour must be less than work_end_hour",
      });
    }

    // Validate timezone format
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch (e) {
      return res.status(400).json({
        error: `Invalid timezone: ${timezone}`,
      });
    }

    // Log the validated parameters for debugging
    console.log("[API] Calendar availability request:", {
      email: google_calendar_email,
      timezone,
      days: validatedDays,
    });

    // Call the calendar availability function with validated parameters
    try {
      const availability = await formattedCalendarAvailability(
        timezone,
        validatedDays,
        serviceAccountKeyObject,
        google_calendar_email,
        validatedWorkStartHour,
        validatedWorkEndHour
      );

      return res.status(200).json({
        success: true,
        data: availability,
        params: {
          timezone,
          days: validatedDays,
          work_start_hour: validatedWorkStartHour,
          work_end_hour: validatedWorkEndHour,
          utc_offset: Number(utc_offset),
          include_weekends: Boolean(include_weekends),
          slot_duration_minutes: validatedSlotDuration,
          buffer_before_minutes: validatedBufferBefore,
          buffer_after_minutes: validatedBufferAfter,
        },
      });
    } catch (calendarError) {
      // Handle specific Google Calendar API errors
      console.error("[API] Calendar API error:", calendarError.message);

      if (calendarError.message.includes("client_email")) {
        return res.status(400).json({
          error: "Invalid service account credentials",
          message:
            "The service account key is missing required fields or is invalid",
        });
      }

      if (calendarError.message.includes("forEach")) {
        return res.status(400).json({
          error: "Calendar access error",
          message:
            "Unable to access the specified calendar. Check if the service account has permission to access this calendar.",
        });
      }

      if (
        calendarError.message.includes("Not Found") ||
        calendarError.message.includes("not found")
      ) {
        return res.status(404).json({
          error: "Calendar not found",
          message: "The specified calendar could not be found or accessed",
        });
      }

      if (
        calendarError.message.includes("Forbidden") ||
        calendarError.message.includes("access")
      ) {
        return res.status(403).json({
          error: "Access denied",
          message:
            "The service account does not have permission to access this calendar",
        });
      }

      // Generic calendar error
      return res.status(400).json({
        error: "Calendar error",
        message:
          calendarError.message ||
          "An error occurred while accessing the calendar",
      });
    }
  } catch (err) {
    console.error(
      "[API] Error in /get_calendar_availability:",
      err.stack || err
    );
    return res.status(500).json({
      error: "Internal server error",
      message: err.message || String(err),
    });
  }
});

// Book an event in Google Calendar
router.post("/book_calendar_event", async (req, res) => {
  try {
    // Validate request body exists
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        error: "Request body is required and must be an object",
      });
    }

    // Get API key for authentication
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({
        error: "Missing x-api-key header",
      });
    }

    // Extract variables from request body
    const {
      google_calendar_email,
      event_title,
      event_description = "",
      start_time,
      end_time,
      timezone = "Europe/Riga",
      attendees: rawAttendees = [],
      location = "",
      send_notifications = true,
    } = req.body;

    // Ensure attendees is always an array
    let attendees = rawAttendees;
    if (typeof rawAttendees === "string") {
      try {
        attendees = JSON.parse(rawAttendees);
      } catch (e) {
        attendees = [rawAttendees]; // Fallback to single email
      }
    }
    if (!Array.isArray(attendees)) {
      attendees = [];
    }

    // Get service account key from environment (secret - not from body)
    const google_service_account_key = process.env.GOOGLE_CREDENTIALS;

    // Validate required variables
    if (!google_calendar_email) {
      return res.status(400).json({
        error: "google_calendar_email is required in request body",
      });
    }

    if (!event_title) {
      return res.status(400).json({
        error: "event_title is required in request body",
      });
    }

    if (!start_time) {
      return res.status(400).json({
        error: "start_time is required in request body",
      });
    }

    if (!end_time) {
      return res.status(400).json({
        error: "end_time is required in request body",
      });
    }

    if (!google_service_account_key) {
      return res.status(500).json({
        error: "Service account credentials not configured",
        message: "GOOGLE_CREDENTIALS environment variable is missing",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(google_calendar_email)) {
      return res.status(400).json({
        error: "google_calendar_email must be a valid email format",
      });
    }

    // Helper function to convert timezone-aware time to UTC
    const convertToUTC = (timeString, timezone) => {
      // If timeString already has Z (UTC), return as is
      if (timeString.endsWith("Z")) {
        return new Date(timeString);
      }

      // If timeString has timezone offset (+/-), parse it
      if (timeString.includes("+") || timeString.includes("-")) {
        return new Date(timeString);
      }

      // If timeString is just date/time without timezone, treat it as the specified timezone
      const localTime = new Date(timeString);
      if (isNaN(localTime.getTime())) {
        throw new Error(`Invalid time format: ${timeString}`);
      }

      // Convert from specified timezone to UTC
      const utcTime = new Date(
        localTime.toLocaleString("en-US", { timeZone: "UTC" })
      );
      const localTimeInTimezone = new Date(
        localTime.toLocaleString("en-US", { timeZone: timezone })
      );
      const offset = localTimeInTimezone.getTime() - utcTime.getTime();

      return new Date(localTime.getTime() - offset);
    };

    // Convert timezone-aware times to UTC
    let startDate, endDate;
    try {
      startDate = convertToUTC(start_time, timezone);
      endDate = convertToUTC(end_time, timezone);
    } catch (error) {
      return res.status(400).json({
        error: "Invalid time format",
        message: error.message,
      });
    }

    if (isNaN(startDate.getTime())) {
      return res.status(400).json({
        error: "start_time must be a valid date string",
      });
    }

    if (isNaN(endDate.getTime())) {
      return res.status(400).json({
        error: "end_time must be a valid date string",
      });
    }

    if (startDate >= endDate) {
      return res.status(400).json({
        error: "start_time must be before end_time",
      });
    }

    // Validate timezone format
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch (e) {
      return res.status(400).json({
        error: `Invalid timezone: ${timezone}`,
      });
    }

    // Parse service account key from environment
    let serviceAccountKeyObject;
    try {
      serviceAccountKeyObject = JSON.parse(google_service_account_key);
    } catch (e) {
      return res.status(500).json({
        error: "Invalid service account credentials format",
        message:
          "GOOGLE_CREDENTIALS environment variable contains invalid JSON",
      });
    }

    // Validate service account key structure
    if (
      !serviceAccountKeyObject.client_email ||
      !serviceAccountKeyObject.private_key ||
      !serviceAccountKeyObject.project_id
    ) {
      return res.status(500).json({
        error: "Invalid service account credentials format",
        message:
          "Service account key must contain client_email, private_key, and project_id fields",
      });
    }

    // Log the booking request for debugging
    console.log("[API] Calendar booking request:", {
      calendar_email: google_calendar_email,
      event_title,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      attendees: attendees,
      attendees_type: typeof attendees,
      attendees_length: attendees.length,
      attendees_isArray: Array.isArray(attendees),
    });

    // Book the event using the calendar service
    try {
      const bookingResult = await bookCalendarEvent(
        serviceAccountKeyObject,
        google_calendar_email,
        {
          title: event_title,
          description: event_description,
          startTime: startDate,
          endTime: endDate,
          attendees,
          location,
          sendNotifications: send_notifications,
        }
      );

      return res.status(200).json({
        success: true,
        data: {
          event_id: bookingResult.id,
          event_link: bookingResult.htmlLink,
          meet_link: bookingResult.meetLink || "Generating...",
          status: bookingResult.status,
          created: bookingResult.created,
          updated: bookingResult.updated,
        },
        params: {
          calendar_email: google_calendar_email,
          event_title,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          attendees_count: attendees.length,
          attendees_debug: {
            value: attendees,
            type: typeof attendees,
            isArray: Array.isArray(attendees),
            length: attendees.length,
          },
        },
      });
    } catch (bookingError) {
      console.error("[API] Calendar booking error:", bookingError.message);

      // Handle specific booking errors
      if (bookingError.message.includes("not found")) {
        return res.status(404).json({
          error: "Calendar not found",
          message: "The specified calendar could not be found or accessed",
        });
      }

      if (
        bookingError.message.includes("forbidden") ||
        bookingError.message.includes("access")
      ) {
        return res.status(403).json({
          error: "Access denied",
          message:
            "The service account does not have permission to create events in this calendar",
        });
      }

      if (
        bookingError.message.includes("conflict") ||
        bookingError.message.includes("busy")
      ) {
        return res.status(409).json({
          error: "Time conflict",
          message: "The requested time slot conflicts with existing events",
        });
      }

      return res.status(400).json({
        error: "Booking error",
        message:
          bookingError.message || "An error occurred while booking the event",
      });
    }
  } catch (err) {
    console.error("[API] Error in /book_calendar_event:", err.stack || err);
    return res.status(500).json({
      error: "Internal server error",
      message: err.message || String(err),
    });
  }
});

// Send event summary email to attendees
router.post("/send_event_email", async (req, res) => {
  try {
    // Validate request body exists
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        error: "Request body is required and must be an object",
      });
    }

    // Get API key for authentication
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({
        error: "Missing x-api-key header",
      });
    }

    // Extract variables from request body
    const {
      event_title,
      event_description = "",
      start_time,
      end_time,
      timezone = "Europe/Riga",
      attendees = [],
      meet_link = "",
      event_link = "",
      organizer_name = "",
      organizer_email = "",
      impersonate_email, // Email to impersonate (e.g., hello@setinbound.com)

      // Optional monitoring emails (BCC for developers/hosts)
      monitoring_emails = [], // Array of email addresses to BCC for monitoring

      // Email template customization variables
      company_name = "Setinbound Calendar Service",
      email_subject_prefix = "Event Invitation",
      email_header_title = "Event Confirmation",
      email_header_subtitle = "Event scheduled successfully",
      footer_company_name = "",
      footer_message = "Auto-generated confirmation",
      sender_name = "", // Name displayed as sender in email
    } = req.body;

    // Get service account key from environment (secret - not from body)
    const google_service_account_key = process.env.GOOGLE_CREDENTIALS;

    // Validate required variables
    if (!event_title) {
      return res.status(400).json({
        error: "event_title is required in request body",
      });
    }

    if (!start_time) {
      return res.status(400).json({
        error: "start_time is required in request body",
      });
    }

    if (!end_time) {
      return res.status(400).json({
        error: "end_time is required in request body",
      });
    }

    if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
      return res.status(400).json({
        error: "attendees must be a non-empty array of email addresses",
      });
    }

    if (!impersonate_email) {
      return res.status(400).json({
        error: "impersonate_email is required in request body",
      });
    }

    if (!google_service_account_key) {
      return res.status(500).json({
        error: "Service account credentials not configured",
        message: "GOOGLE_CREDENTIALS environment variable is missing",
      });
    }

    // Validate email format for impersonate_email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(impersonate_email)) {
      return res.status(400).json({
        error: "impersonate_email must be a valid email format",
      });
    }

    // Validate attendee emails
    for (const attendee of attendees) {
      if (!emailRegex.test(attendee)) {
        return res.status(400).json({
          error: `Invalid attendee email format: ${attendee}`,
        });
      }
    }

    // Validate monitoring emails (optional)
    if (monitoring_emails && Array.isArray(monitoring_emails)) {
      for (const monitoringEmail of monitoring_emails) {
        if (!emailRegex.test(monitoringEmail)) {
          return res.status(400).json({
            error: `Invalid monitoring email format: ${monitoringEmail}`,
          });
        }
      }
    } else if (monitoring_emails && !Array.isArray(monitoring_emails)) {
      return res.status(400).json({
        error: "monitoring_emails must be an array of email addresses",
      });
    }

    // Parse service account credentials
    let serviceAccountKeyObject;
    try {
      serviceAccountKeyObject = JSON.parse(google_service_account_key);
    } catch (parseError) {
      console.error(
        "[API] Error parsing service account credentials:",
        parseError
      );
      return res.status(500).json({
        error: "Invalid service account credentials format",
        message: "Service account key must be valid JSON",
      });
    }

    // Validate service account structure
    if (
      !serviceAccountKeyObject.client_email ||
      !serviceAccountKeyObject.private_key ||
      !serviceAccountKeyObject.project_id
    ) {
      return res.status(500).json({
        error: "Invalid service account credentials structure",
        message:
          "Service account key must contain client_email, private_key, and project_id fields",
      });
    }

    // Log the email request for debugging
    console.log("[API] Event email request:", {
      event_title,
      start_time,
      end_time,
      attendees_count: attendees.length,
      monitoring_emails_count: monitoring_emails.length,
      impersonate_email,
    });

    // Create email service and send email
    try {
      const emailService = new EmailService(serviceAccountKeyObject);

      const emailResult = await emailService.sendEventEmail(
        {
          event_title,
          event_description,
          start_time,
          end_time,
          timezone,
          meet_link,
          event_link,
          organizer_name,
          organizer_email,

          // Template customization
          company_name,
          email_subject_prefix,
          email_header_title,
          email_header_subtitle,
          footer_company_name: footer_company_name || company_name,
          footer_message,
          sender_name: sender_name || organizer_name || "Calendar Service",
        },
        attendees,
        impersonate_email,
        monitoring_emails // Pass monitoring emails as 4th parameter
      );

      return res.status(200).json({
        success: true,
        data: {
          message_id: emailResult.messageId,
          thread_id: emailResult.threadId,
          sent_to: emailResult.sentTo,
          sent_count: emailResult.sentCount,
          monitoring_emails: emailResult.monitoringEmails,
          total_emails_sent: emailResult.totalEmailsSent,
        },
        params: {
          event_title,
          start_time,
          end_time,
          timezone,
          attendees_count: attendees.length,
          monitoring_emails_count: monitoring_emails.length,
          impersonate_email,
        },
      });
    } catch (emailError) {
      console.error("[API] Email sending error:", emailError.message);

      if (emailError.message.includes("Access denied")) {
        return res.status(403).json({
          error: "Access denied",
          message: "Check domain-wide delegation and Gmail API scopes",
        });
      }

      if (emailError.message.includes("Invalid email format")) {
        return res.status(400).json({
          error: "Invalid email format",
          message: emailError.message,
        });
      }

      return res.status(500).json({
        error: "Email sending failed",
        message:
          emailError.message || "An error occurred while sending the email",
      });
    }
  } catch (err) {
    console.error("[API] Error in /send_event_email:", err.stack || err);
    return res.status(500).json({
      error: "Internal server error",
      message: err.message || String(err),
    });
  }
});

export default router;
