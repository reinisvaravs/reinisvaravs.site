import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

// Checks Google Calendar for free/busy times and returns free intervals between timeMin and timeMax
export async function checkCalendarAvailability(
  timeMin,
  timeMax,
  google_service_account_key,
  google_calendar_email
) {
  try {
    // Initialize Google Calendar API with service account credentials
    const credentials = google_service_account_key;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });

    const calendar = google.calendar({ version: "v3", auth });

    const calendarId = google_calendar_email;

    // Get busy times from calendar
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin || new Date().toISOString(),
        timeMax:
          timeMax || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
        items: [{ id: calendarId }],
      },
    });

    // Check if we can access this calendar
    if (!response.data.calendars[calendarId]) {
      throw new Error(`Calendar not found or access denied: ${calendarId}`);
    }

    // Check for API errors in the response (this is the key fix!)
    if (response.data.calendars[calendarId].errors) {
      const errorDetails = response.data.calendars[calendarId].errors;
      console.log(
        `[ERROR] Calendar access errors for ${calendarId}:`,
        errorDetails
      );

      // Check for specific error types
      if (
        errorDetails.some(
          (error) => error.domain === "global" && error.reason === "notFound"
        )
      ) {
        throw new Error(`Calendar not found: ${calendarId}`);
      }
      if (
        errorDetails.some(
          (error) => error.domain === "global" && error.reason === "forbidden"
        )
      ) {
        throw new Error(`Access denied to calendar: ${calendarId}`);
      }
      if (
        errorDetails.some(
          (error) => error.domain === "global" && error.reason === "badRequest"
        )
      ) {
        throw new Error(`Invalid calendar ID: ${calendarId}`);
      }

      // Generic error for any other access issues
      throw new Error(
        `Cannot access calendar ${calendarId}: ${
          errorDetails[0]?.reason || "Unknown error"
        }`
      );
    }

    // Log the API response summary
    console.log(`[DEBUG] Google API response for ${calendarId}:`, {
      hasCalendar: !!response.data.calendars[calendarId],
      busyTimes: response.data.calendars[calendarId]?.busy || [],
    });

    const busyTimes = response.data.calendars[calendarId].busy || [];

    // Now we know the calendar is accessible, so empty busy times means truly free
    if (busyTimes.length === 0) {
      console.log(
        `[INFO] Calendar ${calendarId} is accessible but has no busy times (completely free)`
      );
    }

    // Find free time slots (simplified logic)
    const freeSlots = [];
    let currentTime = new Date(timeMin || new Date());
    const endTime = new Date(
      timeMax || new Date(Date.now() + 24 * 60 * 60 * 1000)
    );

    for (const busy of busyTimes) {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);

      // If there's a gap before this busy period, it's free
      if (currentTime < busyStart) {
        freeSlots.push({
          start: currentTime.toISOString(),
          end: busyStart.toISOString(),
        });
      }

      currentTime = busyEnd;
    }

    // Add remaining time after last busy period
    if (currentTime < endTime) {
      freeSlots.push({
        start: currentTime.toISOString(),
        end: endTime.toISOString(),
      });
    }

    return {
      busy: busyTimes,
      free: freeSlots,
    };
  } catch (error) {
    console.error("Error checking calendar availability:", error);
    return { error: error.message };
  }
}

// Helper to get local parts in a specific IANA time zone
function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const weekdayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday?.toLowerCase()] ?? undefined,
  };
}

// Splits each free interval into 1-hour slots aligned to the top of the hour in the specified time zone
function generateHourlySlots(slots, timeZone, work_start_hour, work_end_hour) {
  const WORK_START_HOUR = parseInt(work_start_hour, 10);
  const WORK_END_HOUR = parseInt(work_end_hour, 10);

  const hourlySlots = [];

  slots.forEach(({ start, end }) => {
    let current = new Date(start);
    const endDate = new Date(end);

    // Align to the next top-of-hour in the target time zone
    let parts = getZonedParts(current, timeZone);
    while (parts.minute !== 0) {
      current = new Date(current.getTime() + 60 * 1000);
      parts = getZonedParts(current, timeZone);
    }

    // Only include slots that fit fully within the interval
    while (current.getTime() + 60 * 60 * 1000 <= endDate.getTime()) {
      const slotStart = new Date(current);
      const slotEnd = new Date(current.getTime() + 60 * 60 * 1000);

      const startParts = getZonedParts(slotStart, timeZone);
      const isWeekday = startParts.weekday >= 1 && startParts.weekday <= 5; // Mon-Fri
      const withinHours =
        startParts.hour >= WORK_START_HOUR && startParts.hour < WORK_END_HOUR;

      if (isWeekday && withinHours) {
        hourlySlots.push({ start: slotStart, end: slotEnd });
      }

      current = new Date(current.getTime() + 60 * 60 * 1000);
    }
  });

  return hourlySlots;
}

// Groups consecutive hourly slots into intervals
function groupSlotsIntoIntervals(slots) {
  if (slots.length === 0) return [];

  const intervals = [];
  let currentInterval = {
    start: new Date(slots[0].start),
    end: new Date(slots[0].end),
  };

  for (let i = 1; i < slots.length; i++) {
    const currentSlot = slots[i];
    const previousEnd = new Date(currentInterval.end);

    // Check if this slot is consecutive (starts exactly when the previous ends)
    if (currentSlot.start.getTime() === previousEnd.getTime()) {
      // Extend the current interval
      currentInterval.end = new Date(currentSlot.end);
    } else {
      // End the current interval and start a new one
      intervals.push(currentInterval);
      currentInterval = {
        start: new Date(currentSlot.start),
        end: new Date(currentSlot.end),
      };
    }
  }

  // Add the last interval
  intervals.push(currentInterval);

  return intervals;
}

// Returns an object with available time intervals grouped by date for the next N days, weekdays only, in UTC+0 or requested UTC offset
export async function formattedCalendarAvailability(
  timeZone,
  days,
  google_service_account_key,
  google_calendar_email,
  work_start_hour,
  work_end_hour
) {
  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const result = await checkCalendarAvailability(
    now.toISOString(),
    sevenDaysLater.toISOString(),
    google_service_account_key,
    google_calendar_email
  );

  // Check if there was an error accessing the calendar
  if (result.error) {
    throw new Error(result.error);
  }

  // Log calendar result summary
  console.log(`[INFO] Calendar result for ${google_calendar_email}:`, {
    freeSlots: result.free ? result.free.length : 0,
    busyTimes: result.busy ? result.busy.length : 0,
  });

  // Split into 1-hour slots and group into intervals
  const hourlySlots = generateHourlySlots(
    result.free,
    timeZone || "Europe/Riga",
    work_start_hour,
    work_end_hour
  );
  if (hourlySlots.length === 0) {
    return [];
  }

  // Group consecutive slots into intervals
  const intervals = groupSlotsIntoIntervals(hourlySlots);
  if (intervals.length === 0) {
    return [];
  }

  // Format each interval as a JSON object with requested UTC offset
  const intervalObjects = intervals.map(({ start, end }) => {
    const day = start
      .toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: timeZone || "Europe/Riga",
      })
      .toLowerCase();
    const month = start.toLocaleDateString("en-US", {
      month: "long",
      timeZone: timeZone || "Europe/Riga",
    });
    const date = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      timeZone: timeZone || "Europe/Riga",
    }).format(start);
    const year = new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      timeZone: timeZone || "Europe/Riga",
    }).format(start);
    const monthNum = new Intl.DateTimeFormat("en-GB", {
      month: "2-digit",
      timeZone: timeZone || "Europe/Riga",
    })
      .format(start)
      .toString()
      .padStart(2, "0");
    const dateNum = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      timeZone: timeZone || "Europe/Riga",
    })
      .format(start)
      .toString()
      .padStart(2, "0");
    const dateStr = `${year}-${monthNum}-${dateNum}`;

    // Format start and end time in the specified time zone
    const startTime = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timeZone || "Europe/Riga",
    }).format(start);
    const endTime = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timeZone || "Europe/Riga",
    }).format(end);

    const interval = `${startTime}-${endTime} ${timeZone || "Europe/Riga"}`;

    return { day, month, date, dateStr, interval };
  });

  // Group intervals by dateStr
  const grouped = {};
  for (const intervalObj of intervalObjects) {
    if (!grouped[intervalObj.dateStr]) {
      grouped[intervalObj.dateStr] = {
        day: intervalObj.day,
        month: intervalObj.month,
        date: intervalObj.date,
        intervals: [],
      };
    }
    grouped[intervalObj.dateStr].intervals.push(intervalObj.interval);
  }

  return grouped;
}

// Book an event in Google Calendar (with Meet) using DWD impersonation
export async function bookCalendarEvent(
  google_service_account_key,
  google_calendar_email, // e.g., "hello@setinbound.com"
  eventDetails
) {
  try {
    const credentials = google_service_account_key;

    // IMPORTANT: use JWT + subject to impersonate the organizer
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar"],
      subject: google_calendar_email, // impersonate the Meet-licensed user
    });

    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = google_calendar_email;

    // Debug attendees
    console.log("[gCalendar] Event details:", {
      title: eventDetails.title,
      attendees: eventDetails.attendees,
      attendeesType: typeof eventDetails.attendees,
      attendeesIsArray: Array.isArray(eventDetails.attendees),
    });

    // Validate and format attendees for Google Calendar
    let formattedAttendees = [];
    if (eventDetails.attendees && Array.isArray(eventDetails.attendees)) {
      formattedAttendees = eventDetails.attendees
        .map((email) => {
          if (typeof email === "string") {
            return { email: email };
          } else if (email && typeof email === "object" && email.email) {
            return email;
          }
          return null;
        })
        .filter(Boolean); // Remove any null entries
    }

    console.log("[gCalendar] Formatted attendees:", formattedAttendees);

    // Prepare event data
    const event = {
      summary: eventDetails.title,
      description: eventDetails.description || "",
      start: {
        dateTime: eventDetails.startTime.toISOString(),
        timeZone: "Europe/Riga",
      },
      end: {
        dateTime: eventDetails.endTime.toISOString(),
        timeZone: "Europe/Riga",
      },
      location: eventDetails.location || "",
      attendees: formattedAttendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 }, // 24 hours before
          { method: "popup", minutes: 30 }, // 30 minutes before
        ],
      },
      // Disable default Google Calendar features
      guestsCanModify: false,
      guestsCanInviteOthers: false,
      guestsCanSeeOtherGuests: true,
      guestsCanAddSelf: false,
      // Enable Google Meet link generation
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      },
    };

    console.log("[gCalendar] Event object being sent to Google:", {
      attendees: event.attendees,
      attendeesLength: event.attendees.length,
    });

    const res = await calendar.events.insert({
      calendarId,
      resource: event,
      conferenceDataVersion: 1, // <-- required to process conferenceData
      sendUpdates: eventDetails.sendNotifications ? "all" : "none",
    });

    // Extract Meet link from response
    const meetLink =
      res.data.hangoutLink ||
      res.data?.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === "video"
      )?.uri ||
      null;

    return { ...res.data, meetLink };
  } catch (error) {
    if (error.code === 403)
      throw new Error("Access denied (check DWD scopes + subject user)");
    if (error.code === 404) throw new Error("Calendar not found");
    if (error.code === 409) throw new Error("Time conflict");
    throw new Error(error.message || "Failed to book event");
  }
}
