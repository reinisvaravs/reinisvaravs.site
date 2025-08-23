import { google } from "googleapis";

/**
 * Email Service using Gmail API with service account impersonation
 * Sends HTML event summary emails to attendees
 */
export class EmailService {
  constructor(serviceAccountKey) {
    this.serviceAccountKey = serviceAccountKey;
  }

  /**
   * Create Gmail client with impersonation
   * @param {string} impersonateEmail - Email to impersonate (e.g., hello@setinbound.com)
   * @returns {Object} Gmail client instance
   */
  createGmailClient(impersonateEmail) {
    const auth = new google.auth.JWT({
      email: this.serviceAccountKey.client_email,
      key: this.serviceAccountKey.private_key,
      scopes: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.compose",
      ],
      subject: impersonateEmail, // Impersonate the calendar owner
    });

    return google.gmail({ version: "v1", auth });
  }

  /**
   * Generate HTML email template for event summary
   * @param {Object} eventData - Event details
   * @returns {string} HTML email content
   */
  generateEventEmailHTML(eventData) {
    const {
      event_title,
      event_description,
      start_time,
      end_time,
      timezone,
      meet_link,
      event_link,
      organizer_name,
      organizer_email,

      // Template customization variables
      company_name = "Setinbound Calendar Service",
      email_header_title = "Event Confirmation",
      email_header_subtitle = "Event scheduled successfully",
      footer_company_name = "",
      footer_message = "Auto-generated confirmation",
      sender_name = "",
    } = eventData;

    // Format date and time
    const startDate = new Date(start_time);
    const endDate = new Date(end_time);
    const formattedDate = startDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const formattedStartTime = startDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });
    const formattedEndTime = endDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });

    // Calculate duration
    const durationMs = endDate - startDate;
    const durationHours = Math.round((durationMs / (1000 * 60 * 60)) * 10) / 10;

    return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Event Confirmation</title>
  </head>
  <body style="margin:0; padding:0; background-color:#F6F7F9;">
    <!-- Outer wrapper -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F6F7F9;">
      <tr>
        <td align="center" style="padding:24px;">
          <!-- Card -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:500px; background-color:#FFFFFF; border-collapse:separate; border-radius:8px; box-shadow:0 1px 3px rgba(16,24,40,0.06);">
            <!-- Header -->
            <tr>
              <td style="padding:20px 20px 8px 20px; font-family:Arial, Helvetica, sans-serif; color:#0F172A;">
                <div style="font-size:11px; line-height:16px; letter-spacing:.2px; color:#64748B; text-transform:uppercase;">
                  ${email_header_title}
                </div>
                <h1 style="margin:4px 0 0 0; font-size:18px; line-height:24px; font-weight:bold; color:#0F172A;">
                  ${event_title}
                </h1>
                ${
                  email_header_subtitle
                    ? `
                <p style="margin:2px 0 0 0; font-size:12px; line-height:16px; color:#64748B;">
                  ${email_header_subtitle}
                </p>
                `
                    : ""
                }
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding:0 20px;">
                <hr style="border:none; border-top:1px solid #E5E7EB; margin:0;">
              </td>
            </tr>

            <!-- Event details -->
            <tr>
              <td style="padding:16px 20px 8px 20px; font-family:Arial, Helvetica, sans-serif; color:#0F172A;">
                <!-- Date -->
                <p style="margin:0 0 6px 0; font-size:13px; line-height:18px;">
                  <strong>Date:</strong> ${formattedDate}
                </p>
                <!-- Time range -->
                <p style="margin:0 0 6px 0; font-size:13px; line-height:18px;">
                  <strong>Time:</strong> ${formattedStartTime} - ${formattedEndTime}${
      timezone ? ` <span style="color:#64748B;">(${timezone})</span>` : ""
    }
                </p>
                <!-- Duration -->
                <p style="margin:0 0 0 0; font-size:13px; line-height:18px;">
                  <strong>Duration:</strong> ${durationHours} hour${
      durationHours !== 1 ? "s" : ""
    }
                </p>
              </td>
            </tr>

            ${
              event_description
                ? `
            <!-- Description -->
            <tr>
              <td style="padding:12px 20px 0 20px;">
                <hr style="border:none; border-top:1px solid #E5E7EB; margin:0;">
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px 8px 20px; font-family:Arial, Helvetica, sans-serif;">
                <h2 style="margin:0 0 8px 0; font-size:13px; line-height:18px; color:#0F172A; font-weight:bold;">Description</h2>
                <p style="margin:0; font-size:13px; line-height:18px; color:#334155;">
                  ${event_description}
                </p>
              </td>
            </tr>
            `
                : ""
            }

            ${
              organizer_name || organizer_email
                ? `
            <!-- Organizer -->
            <tr>
              <td style="padding:12px 20px 0 20px;">
                <hr style="border:none; border-top:1px solid #E5E7EB; margin:0;">
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px 8px 20px; font-family:Arial, Helvetica, sans-serif;">
                <h2 style="margin:0 0 8px 0; font-size:13px; line-height:18px; color:#0F172A; font-weight:bold;">Organizer</h2>
                <p style="margin:0; font-size:13px; line-height:18px; color:#334155;">
                  ${organizer_name ? organizer_name : ""}${
                    organizer_name && organizer_email ? " • " : ""
                  }${
                    organizer_email
                      ? `<a href="mailto:${organizer_email}" style="color:#2563EB; text-decoration:none;">${organizer_email}</a>`
                      : ""
                  }
                </p>
              </td>
            </tr>
            `
                : ""
            }

            ${
              meet_link || event_link
                ? `
            <!-- Action buttons -->
            <tr>
              <td style="padding:12px 20px 0 20px;">
                <hr style="border:none; border-top:1px solid #E5E7EB; margin:0;">
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:16px 20px;">
                ${
                  meet_link
                    ? `
                <a href="${meet_link}" target="_blank"
                   style="background-color:#2563EB; border-radius:4px; color:#FFFFFF; display:inline-block; font-family:Arial, Helvetica, sans-serif; font-size:13px; font-weight:bold; line-height:36px; text-align:center; text-decoration:none; width:180px; margin:0 6px 8px 6px;">
                  Join Meeting
                </a>
                `
                    : ""
                }
                ${
                  event_link
                    ? `
                <a href="${event_link}" target="_blank"
                   style="background-color:#FFFFFF; border:1px solid #CBD5E1; border-radius:4px; color:#0F172A; display:inline-block; font-family:Arial, Helvetica, sans-serif; font-size:13px; font-weight:bold; line-height:36px; text-align:center; text-decoration:none; width:180px; margin:0 6px 8px 6px;">
                  View Calendar
                </a>
                `
                    : ""
                }
              </td>
            </tr>
            `
                : ""
            }

            <!-- Footer -->
            <tr>
              <td style="padding:12px 20px 20px 20px;">
                <hr style="border:none; border-top:1px solid #E5E7EB; margin:0 0 12px 0;">
                <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:11px; line-height:16px; color:#94A3B8; text-align:center;">
                  <strong>${footer_company_name || company_name}</strong><br>
                  ${footer_message}
                </p>
              </td>
            </tr>
          </table>
          <!-- /Card -->
        </td>
      </tr>
    </table>
  </body>
</html>
    `;
  }

  /**
   * Generate plain text version of the email
   * @param {Object} eventData - Event details
   * @returns {string} Plain text email content
   */
  generateEventEmailText(eventData) {
    const {
      event_title,
      event_description,
      start_time,
      end_time,
      timezone,
      meet_link,
      event_link,
      organizer_name,
      organizer_email,

      // Template customization variables
      company_name = "Setinbound Calendar Service",
      email_header_title = "Event Confirmation",
      footer_company_name = "",
      footer_message = "Auto-generated confirmation",
    } = eventData;

    const startDate = new Date(start_time);
    const endDate = new Date(end_time);
    const formattedDate = startDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const formattedStartTime = startDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });
    const formattedEndTime = endDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });

    // Calculate duration
    const durationMs = endDate - startDate;
    const durationHours = Math.round((durationMs / (1000 * 60 * 60)) * 10) / 10;

    return `
${email_header_title.toUpperCase()}: ${event_title}

Your event has been successfully scheduled!

EVENT DETAILS:
Date: ${formattedDate}
Time: ${formattedStartTime} - ${formattedEndTime}
Duration: ${durationHours} hour${durationHours !== 1 ? "s" : ""}
${timezone ? `Timezone: ${timezone}\n` : ""}

${event_description ? `DESCRIPTION:\n${event_description}\n` : ""}

${
  organizer_name || organizer_email
    ? `ORGANIZER:\n${organizer_name ? `Name: ${organizer_name}\n` : ""}${
        organizer_email ? `Email: ${organizer_email}\n` : ""
      }`
    : ""
}

${meet_link ? `Google Meet: ${meet_link}\n` : ""}
${event_link ? `Calendar Link: ${event_link}\n` : ""}

---
${footer_company_name || company_name}
${footer_message}
    `.trim();
  }

  /**
   * Send event summary email to attendees
   * @param {Object} eventData - Event details
   * @param {Array} attendees - List of attendee emails
   * @param {string} impersonateEmail - Email to impersonate (organizer)
   * @returns {Object} Email sending results
   */
  async sendEventEmail(eventData, attendees, impersonateEmail) {
    try {
      const gmail = this.createGmailClient(impersonateEmail);

      // Generate email content
      const htmlContent = this.generateEventEmailHTML(eventData);
      const textContent = this.generateEventEmailText(eventData);

      // Create email message
      const subjectLine = eventData.email_subject_prefix
        ? `${eventData.email_subject_prefix}: ${eventData.event_title}`
        : `Event Invitation: ${eventData.event_title}`;

      const emailLines = [
        `From: ${impersonateEmail}`,
        `To: ${attendees.join(", ")}`,
        `Subject: ${subjectLine}`,
        "MIME-Version: 1.0",
        'Content-Type: multipart/alternative; boundary="boundary123"',
        "",
        "--boundary123",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        textContent,
        "",
        "--boundary123",
        "Content-Type: text/html; charset=UTF-8",
        "",
        htmlContent,
        "",
        "--boundary123--",
      ];

      const email = emailLines.join("\r\n");
      const encodedEmail = Buffer.from(email)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

      // Send email
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedEmail,
        },
      });

      console.log("[EmailService] Email sent successfully:", {
        messageId: response.data.id,
        threadId: response.data.threadId,
        attendees: attendees.length,
      });

      return {
        success: true,
        messageId: response.data.id,
        threadId: response.data.threadId,
        sentTo: attendees,
        sentCount: attendees.length,
      };
    } catch (error) {
      console.error("[EmailService] Error sending email:", error);

      if (error.code === 403) {
        throw new Error(
          "Access denied - check domain-wide delegation and Gmail API scopes"
        );
      }
      if (error.code === 400) {
        throw new Error("Invalid email format or Gmail API error");
      }

      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}

export default EmailService;
