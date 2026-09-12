/**
 * Calendar export utilities for STRYT bookings & appointments.
 * Pure TypeScript, zero external dependencies, works seamlessly on Web, Android, iOS.
 */

export interface CalendarEventDetails {
  title: string;
  description?: string;
  location?: string;
  startTime?: string | Date;
  endTime?: string | Date;
  filename?: string;
  /** Stable id of the thing being exported (e.g. the appointment id). */
  uid?: string;
}

function formatDateToICS(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * RFC 5545 UID. It must be the same every time the same booking is exported,
 * so a second "Add to calendar" updates the existing entry instead of adding
 * a duplicate. Without an id, derive one from the title and start time.
 */
function eventUid(event: CalendarEventDetails, start: Date): string {
  const id = (event.uid || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (id) return `stryt-apt-${id}@stryt.in`;
  let h = 5381;
  for (const ch of `${event.title}|${start.toISOString()}`) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return `stryt-evt-${h.toString(36)}@stryt.in`;
}

/**
 * Generate a direct Google Calendar web event URL.
 */
export function getGoogleCalendarUrl(event: CalendarEventDetails): string {
  const start = event.startTime ? new Date(event.startTime) : new Date();
  const end = event.endTime ? new Date(event.endTime) : new Date(start.getTime() + 60 * 60 * 1000); // 1 hour default

  const dates = `${formatDateToICS(start)}/${formatDateToICS(end)}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates,
    details: event.description || "",
    location: event.location || "",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate standard RFC 5545 iCalendar content (.ics).
 */
export function generateIcsContent(event: CalendarEventDetails): string {
  const start = event.startTime ? new Date(event.startTime) : new Date();
  const end = event.endTime ? new Date(event.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
  const now = new Date();

  const escapeIcs = (str?: string) =>
    (str || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//STRYT//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${eventUid(event, start)}`,
    `DTSTAMP:${formatDateToICS(now)}`,
    `DTSTART:${formatDateToICS(start)}`,
    `DTEND:${formatDateToICS(end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Trigger download of an .ics file in browser/webview.
 */
export function downloadIcsFile(event: CalendarEventDetails): void {
  try {
    const ics = generateIcsContent(event);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = event.filename || `appointment-${Date.now()}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error("Failed to download .ics file:", err);
  }
}

/**
 * Open calendar choice: opens Google Calendar or downloads .ics file.
 */
export function openCalendarEvent(event: CalendarEventDetails): void {
  const gcalUrl = getGoogleCalendarUrl(event);
  // If in browser or Android with browser, opening gcal URL is smoothest.
  // We open the Google Calendar event in a new tab/window, with fallback to ICS download.
  const win = window.open(gcalUrl, "_blank", "noopener,noreferrer");
  if (!win || win.closed || typeof win.closed === "undefined") {
    // Popup was blocked or Webview doesn't support popup -> download ICS file
    downloadIcsFile(event);
  }
}
