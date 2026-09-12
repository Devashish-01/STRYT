import { describe, it, expect } from "vitest";
import { getGoogleCalendarUrl, generateIcsContent } from "./calendarExport";

describe("calendarExport", () => {
  const sampleEvent = {
    title: "Haircut with Style Studio",
    description: "Appointment confirmed via STRYT. In-Store visit.",
    location: "Koregaon Park, Pune",
    startTime: new Date("2026-09-12T10:30:00Z"),
    endTime: new Date("2026-09-12T11:30:00Z"),
  };

  it("generates a valid Google Calendar URL with encoded parameters", () => {
    const url = getGoogleCalendarUrl(sampleEvent);
    expect(url).toContain("https://calendar.google.com/calendar/render");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=Haircut+with+Style+Studio");
    expect(url).toContain("location=Koregaon+Park%2C+Pune");
    expect(url).toContain("20260912T103000Z%2F20260912T113000Z");
  });

  it("generates standard RFC 5545 iCalendar content", () => {
    const ics = generateIcsContent(sampleEvent);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Haircut with Style Studio");
    expect(ics).toContain("DTSTART:20260912T103000Z");
    expect(ics).toContain("DTEND:20260912T113000Z");
    expect(ics).toContain("LOCATION:Koregaon Park\\, Pune");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("keeps the UID stable across exports so calendars update instead of duplicating", () => {
    const uidLine = (ics: string) => ics.split("\r\n").find((l) => l.startsWith("UID:"));

    const withId = uidLine(generateIcsContent({ ...sampleEvent, uid: "apt_123" }));
    expect(withId).toBe("UID:stryt-apt-apt_123@stryt.in");
    expect(uidLine(generateIcsContent({ ...sampleEvent, uid: "apt_123" }))).toBe(withId);

    const derived = uidLine(generateIcsContent(sampleEvent));
    expect(uidLine(generateIcsContent(sampleEvent))).toBe(derived);
    expect(uidLine(generateIcsContent({ ...sampleEvent, startTime: new Date("2026-09-13T10:30:00Z") }))).not.toBe(derived);
  });

  it("defaults end time to 1 hour after start time if not provided", () => {
    const ics = generateIcsContent({
      title: "Quick Consult",
      startTime: new Date("2026-09-12T14:00:00Z"),
    });
    expect(ics).toContain("DTSTART:20260912T140000Z");
    expect(ics).toContain("DTEND:20260912T150000Z");
  });
});
