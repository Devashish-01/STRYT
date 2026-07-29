import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseTimeToMinutes,
  formatMinutesToTime,
  parseHoursValue,
  serializeHoursValue,
  expandPatternToWeekly,
  getDayWindows,
  isWorkingDay,
  generateWorkingSlots,
  formatWeeklyHoursForDisplay,
  calculateNextStartTime,
  evaluateProviderAvailability,
  calculateNextTurnoffTime,
  DAY_CODES,
  type WeeklyHours,
  type DayCode,
} from "./availability";
import type { AppointmentRecord, BlockedSlot } from "@/types";

// A date far enough in the future that generateWorkingSlots' "already past"
// filter (slotStart > now + 5min) never makes a test flaky depending on when
// the suite happens to run.
const FUTURE_YEAR = new Date().getFullYear() + 2;

function fixture(overrides: Partial<AppointmentRecord> = {}): AppointmentRecord {
  return {
    id: "apt_1",
    targetId: "biz_1",
    targetName: "Test Business",
    targetType: "BUSINESS",
    customerId: "cust_1",
    customerName: "Customer",
    scheduledForISO: new Date(FUTURE_YEAR, 0, 1, 10, 0, 0, 0).toISOString(),
    dateLabel: "Jan 1",
    timeLabel: "10:00 AM",
    status: "ACCEPTED",
    createdAtISO: new Date().toISOString(),
    ...overrides,
  };
}

function everydayHours(from = "09:00 AM", to = "05:00 PM", slotDurationMin = 30): string {
  return serializeHoursValue(expandPatternToWeekly("Everyday", from, to, slotDurationMin));
}

describe("parseTimeToMinutes / formatMinutesToTime", () => {
  it("parses 12-hour AM/PM times", () => {
    expect(parseTimeToMinutes("09:00 AM")).toBe(9 * 60);
    expect(parseTimeToMinutes("09:00 PM")).toBe(21 * 60);
  });

  it("handles the 12 AM / 12 PM edge cases", () => {
    expect(parseTimeToMinutes("12:00 AM")).toBe(0);
    expect(parseTimeToMinutes("12:00 PM")).toBe(12 * 60);
  });

  it("parses bare 24-hour times", () => {
    expect(parseTimeToMinutes("19:30")).toBe(19 * 60 + 30);
  });

  it("round-trips through formatMinutesToTime", () => {
    expect(formatMinutesToTime(parseTimeToMinutes("09:00 AM"))).toBe("9:00 AM");
    expect(formatMinutesToTime(parseTimeToMinutes("09:00 PM"))).toBe("9:00 PM");
    expect(formatMinutesToTime(0)).toBe("12:00 AM");
    expect(formatMinutesToTime(12 * 60)).toBe("12:00 PM");
  });
});

describe("parseHoursValue — legacy format upgrades", () => {
  it("defaults to Mon-Sat 9-7 when raw is empty/undefined", () => {
    const w = parseHoursValue(undefined);
    expect(w.days.Mon.open).toBe(true);
    expect(w.days.Sun.open).toBe(false);
    expect(getDayWindows(w, "Mon")).toEqual([{ fromMin: 9 * 60, toMin: 19 * 60 }]);
  });

  it('upgrades "Open 24×7"', () => {
    const w = parseHoursValue("Open 24×7");
    expect(w.mode).toBe("24x7");
    for (const d of DAY_CODES) expect(w.days[d].open).toBe(true);
  });

  it("upgrades a legacy day-group pattern string", () => {
    const w = parseHoursValue("Mon–Fri from 09:00 AM to 07:00 PM");
    expect(w.days.Mon.open).toBe(true);
    expect(w.days.Fri.open).toBe(true);
    expect(w.days.Sat.open).toBe(false);
    expect(w.days.Sun.open).toBe(false);
    expect(getDayWindows(w, "Mon")).toEqual([{ fromMin: 9 * 60, toMin: 19 * 60 }]);
  });

  it("upgrades the legacy per-day comma list, including a Closed day", () => {
    const w = parseHoursValue("Mon 11:00-23:30, Tue Closed, Wed 09:00-17:00");
    expect(w.days.Mon.open).toBe(true);
    expect(getDayWindows(w, "Mon")).toEqual([{ fromMin: 11 * 60, toMin: 23 * 60 + 30 }]);
    expect(w.days.Tue.open).toBe(false);
    expect(w.days.Wed.open).toBe(true);
    // Days not mentioned in the chunk list default to closed.
    expect(w.days.Thu.open).toBe(false);
  });

  it("parses the current v2 JSON format directly", () => {
    const w: WeeklyHours = {
      v: 2,
      mode: "weekly",
      slotDurationMin: 30,
      days: {
        Mon: { open: true, ranges: [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "18:00" }] },
        Tue: { open: false, ranges: [] },
        Wed: { open: false, ranges: [] },
        Thu: { open: false, ranges: [] },
        Fri: { open: false, ranges: [] },
        Sat: { open: false, ranges: [] },
        Sun: { open: false, ranges: [] },
      },
    };
    const parsed = parseHoursValue(serializeHoursValue(w));
    expect(parsed).toEqual(w);
  });

  it("falls through to legacy parsing instead of throwing on malformed JSON-looking input", () => {
    expect(() => parseHoursValue("{not actually json")).not.toThrow();
    const w = parseHoursValue("{not actually json");
    // Unrecognized text falls back to the day-group parser's "everyday" default.
    expect(w.days.Sun.open).toBe(true);
  });

  it("round-trips serializeHoursValue -> parseHoursValue for a split shift", () => {
    const w = expandPatternToWeekly("Mon–Sat", "09:00 AM", "07:00 PM", 45);
    // Manually add a split shift (lunch break) to one day.
    w.days.Mon.ranges = [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "19:00" }];
    const roundTripped = parseHoursValue(serializeHoursValue(w));
    expect(roundTripped.days.Mon.ranges).toHaveLength(2);
    expect(getDayWindows(roundTripped, "Mon")).toEqual([
      { fromMin: 9 * 60, toMin: 13 * 60 },
      { fromMin: 14 * 60, toMin: 19 * 60 },
    ]);
  });
});

describe("expandPatternToWeekly", () => {
  it.each([
    ["Everyday", DAY_CODES],
    ["Mon–Sat", ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as DayCode[]],
    ["Mon–Fri", ["Mon", "Tue", "Wed", "Thu", "Fri"] as DayCode[]],
    ["Sat–Sun", ["Sat", "Sun"] as DayCode[]],
  ])("opens exactly the right days for %s", (pattern, expectedOpenDays) => {
    const w = expandPatternToWeekly(pattern, "09:00 AM", "06:00 PM", 30);
    for (const d of DAY_CODES) {
      expect(w.days[d].open).toBe(expectedOpenDays.includes(d));
    }
  });
});

describe("getDayWindows", () => {
  it("returns an empty array for a closed day", () => {
    const w = expandPatternToWeekly("Mon–Fri", "09:00 AM", "06:00 PM", 30);
    expect(getDayWindows(w, "Sun")).toEqual([]);
  });

  it("filters out a degenerate range where to <= from", () => {
    const w = expandPatternToWeekly("Everyday", "09:00 AM", "06:00 PM", 30);
    w.days.Mon.ranges.push({ from: "12:00", to: "12:00" }); // zero-length, should be dropped
    const windows = getDayWindows(w, "Mon");
    expect(windows).toHaveLength(1);
  });

  it("sorts multiple ranges by start time regardless of input order", () => {
    const w = expandPatternToWeekly("Everyday", "09:00 AM", "06:00 PM", 30);
    w.days.Mon.ranges = [{ from: "14:00", to: "18:00" }, { from: "09:00", to: "13:00" }];
    expect(getDayWindows(w, "Mon")).toEqual([
      { fromMin: 9 * 60, toMin: 13 * 60 },
      { fromMin: 14 * 60, toMin: 18 * 60 },
    ]);
  });
});

describe("isWorkingDay", () => {
  it("matches getDayWindows presence", () => {
    const hours = "Mon–Fri from 09:00 AM to 07:00 PM";
    const monday = new Date(2025, 0, 6); // a Monday
    const sunday = new Date(2025, 0, 5); // a Sunday
    expect(isWorkingDay(hours, monday)).toBe(true);
    expect(isWorkingDay(hours, sunday)).toBe(false);
  });
});

describe("formatWeeklyHoursForDisplay", () => {
  it("collapses consecutive identical days into one range label", () => {
    const w = expandPatternToWeekly("Mon–Fri", "09:00 AM", "07:00 PM", 30);
    expect(formatWeeklyHoursForDisplay(w)).toBe("Mon–Fri 9:00 AM–7:00 PM · Sat–Sun Closed");
  });

  it("reports Open 24x7 verbatim", () => {
    const w = parseHoursValue("Open 24×7");
    expect(formatWeeklyHoursForDisplay(w)).toBe("Open 24×7");
  });
});

describe("generateWorkingSlots", () => {
  const targetDate = new Date(FUTURE_YEAR, 0, 1); // far-future date, any weekday

  it("generates one slot per slotDuration across the working window", () => {
    const hours = everydayHours("09:00 AM", "11:00 AM", 30);
    const slots = generateWorkingSlots(hours, targetDate);
    // 09:00, 09:30, 10:00, 10:30 — 10:00-11:00 window closes exactly at 11, so
    // the last full slot start is 10:30 (10:30-11:00).
    expect(slots.map((s) => s.timeLabel)).toEqual(["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM"]);
    expect(slots.every((s) => s.isAvailable)).toBe(true);
    expect(slots.every((s) => s.capacity === 1 && s.remaining === 1)).toBe(true);
  });

  it("returns no slots on a day the business is closed", () => {
    const hours = serializeHoursValue(expandPatternToWeekly("Mon–Fri", "09:00 AM", "06:00 PM", 30));
    // Force a definitely-closed day regardless of what FUTURE_YEAR's Jan 1 falls on.
    const w = parseHoursValue(hours);
    for (const d of DAY_CODES) w.days[d] = { open: false, ranges: [] };
    const slots = generateWorkingSlots(serializeHoursValue(w), targetDate);
    expect(slots).toEqual([]);
  });

  it("marks a slot unavailable when an existing appointment occupies it (capacity 1, default)", () => {
    const hours = everydayHours("09:00 AM", "10:00 AM", 30);
    const occupied = fixture({ scheduledForISO: new Date(FUTURE_YEAR, 0, 1, 9, 0, 0, 0).toISOString() });
    const slots = generateWorkingSlots(hours, targetDate, [occupied]);
    const nineAm = slots.find((s) => s.timeLabel === "9:00 AM")!;
    const nineThirty = slots.find((s) => s.timeLabel === "9:30 AM")!;
    expect(nineAm.isAvailable).toBe(false);
    expect(nineAm.remaining).toBe(0);
    expect(nineAm.bookedAppointmentIds).toEqual(["apt_1"]);
    expect(nineThirty.isAvailable).toBe(true);
  });

  it("ignores CANCELLED/REJECTED appointments when computing occupancy", () => {
    const hours = everydayHours("09:00 AM", "10:00 AM", 30);
    const cancelled = fixture({
      scheduledForISO: new Date(FUTURE_YEAR, 0, 1, 9, 0, 0, 0).toISOString(),
      status: "CANCELLED",
    });
    const slots = generateWorkingSlots(hours, targetDate, [cancelled]);
    const nineAm = slots.find((s) => s.timeLabel === "9:00 AM")!;
    expect(nineAm.isAvailable).toBe(true);
    expect(nineAm.remaining).toBe(1);
  });

  it("respects slot capacity > 1, summing party sizes rather than booking count", () => {
    const hours = everydayHours("09:00 AM", "10:00 AM", 30);
    const bookingA = fixture({ id: "a", scheduledForISO: new Date(FUTURE_YEAR, 0, 1, 9, 0, 0, 0).toISOString(), partySize: 2 });
    const slots = generateWorkingSlots(hours, targetDate, [bookingA], [], { capacity: 3 });
    const nineAm = slots.find((s) => s.timeLabel === "9:00 AM")!;
    expect(nineAm.capacity).toBe(3);
    expect(nineAm.used).toBe(2);
    expect(nineAm.remaining).toBe(1);
    expect(nineAm.isAvailable).toBe(true);
  });

  it("prefers the server's authoritative usedByIso count over locally-visible bookings", () => {
    const hours = everydayHours("09:00 AM", "10:00 AM", 30);
    const iso = new Date(FUTURE_YEAR, 0, 1, 9, 0, 0, 0).toISOString();
    // Nothing visible locally, but the server says the slot is already full —
    // simulates another customer's RLS-hidden booking.
    const slots = generateWorkingSlots(hours, targetDate, [], [], { capacity: 2, usedByIso: { [iso]: 2 } });
    const nineAm = slots.find((s) => s.timeLabel === "9:00 AM")!;
    expect(nineAm.used).toBe(2);
    expect(nineAm.remaining).toBe(0);
    expect(nineAm.isAvailable).toBe(false);
  });

  it("blocks the whole day when a blocked slot has no timeLabel", () => {
    const hours = everydayHours("09:00 AM", "10:00 AM", 30);
    const wholeDayBlock: BlockedSlot = {
      id: "block_1", targetId: "biz_1", targetType: "BUSINESS",
      date: `${FUTURE_YEAR}-01-01`, timeLabel: null, recurring: false,
    };
    const slots = generateWorkingSlots(hours, targetDate, [], [wholeDayBlock]);
    expect(slots).toEqual([]);
  });

  it("marks only the specific blocked time label as unavailable", () => {
    const hours = everydayHours("09:00 AM", "10:00 AM", 30);
    const partialBlock: BlockedSlot = {
      id: "block_2", targetId: "biz_1", targetType: "BUSINESS",
      date: `${FUTURE_YEAR}-01-01`, timeLabel: "9:00 AM", reason: "Owner break", recurring: false,
    };
    const slots = generateWorkingSlots(hours, targetDate, [], [partialBlock]);
    const nineAm = slots.find((s) => s.timeLabel === "9:00 AM")!;
    const nineThirty = slots.find((s) => s.timeLabel === "9:30 AM")!;
    expect(nineAm.blocked).toBe(true);
    expect(nineAm.blockReason).toBe("Owner break");
    expect(nineAm.isAvailable).toBe(false);
    expect(nineThirty.blocked).toBeUndefined();
    expect(nineThirty.isAvailable).toBe(true);
  });

  it("excludes a split-shift's closed gap (e.g. lunch break)", () => {
    const w = expandPatternToWeekly("Everyday", "09:00 AM", "06:00 PM", 60);
    w.days.Mon.ranges = [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "18:00" }];
    for (const d of DAY_CODES) if (d !== "Mon") w.days[d] = w.days.Mon;
    const slots = generateWorkingSlots(serializeHoursValue(w), targetDate);
    expect(slots.map((s) => s.timeLabel)).not.toContain("1:00 PM");
    expect(slots.map((s) => s.timeLabel)).toContain("12:00 PM");
    expect(slots.map((s) => s.timeLabel)).toContain("2:00 PM");
  });
});

describe("calculateNextStartTime", () => {
  // 2025-01-06 is a Monday; 01-07 Tue, 01-10 Fri, 01-11 Sat, 01-13 Mon.
  const hours = "Mon–Fri from 09:00 AM to 05:00 PM";

  it("finds a later window today when called before opening", () => {
    const now = new Date(2025, 0, 6, 7, 0, 0); // Mon 7:00 AM
    const { nextDate, label } = calculateNextStartTime(hours, now);
    expect(nextDate.getHours()).toBe(9);
    expect(label).toBe("Opens today at 9:00 AM");
  });

  it("rolls over to tomorrow when called after closing (labelled 'tomorrow')", () => {
    const now = new Date(2025, 0, 6, 18, 0, 0); // Mon 6:00 PM
    const { nextDate, label } = calculateNextStartTime(hours, now);
    expect(nextDate.getDate()).toBe(7); // Tuesday
    expect(label).toBe("Opens tomorrow at 9:00 AM");
  });

  it("skips closed weekend days and names the actual weekday", () => {
    const now = new Date(2025, 0, 10, 18, 0, 0); // Fri 6:00 PM, closed Sat/Sun
    const { nextDate, label } = calculateNextStartTime(hours, now);
    expect(nextDate.getDate()).toBe(13); // the following Monday
    expect(label).toBe("Opens Mon at 9:00 AM");
  });

  it("finds the afternoon window of a split shift instead of jumping to tomorrow", () => {
    const w = expandPatternToWeekly("Everyday", "09:00 AM", "05:00 PM", 30);
    w.days.Mon.ranges = [{ from: "09:00", to: "13:00" }, { from: "14:00", to: "17:00" }];
    const now = new Date(2025, 0, 6, 13, 30, 0); // Mon 1:30 PM — mid lunch gap
    const { nextDate, label } = calculateNextStartTime(serializeHoursValue(w), now);
    expect(nextDate.getHours()).toBe(14);
    expect(label).toBe("Opens today at 2:00 PM");
  });
});

describe("evaluateProviderAvailability (time-dependent — fake timers)", () => {
  afterEach(() => vi.useRealTimers());

  it("with no availabilityNote, mirrors the isAvailableNow flag verbatim", () => {
    expect(evaluateProviderAvailability(undefined, true).isOpenNow).toBe(true);
    expect(evaluateProviderAvailability(undefined, true).statusText).toBe("Available right now");
    expect(evaluateProviderAvailability(undefined, false).isOpenNow).toBe(false);
    expect(evaluateProviderAvailability(undefined, false).statusText).toBe("Offline");
  });

  it("reports open during a working window with no manual override", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 6, 11, 0, 0)); // Mon 11:00 AM
    const info = evaluateProviderAvailability("Mon–Fri from 09:00 AM to 05:00 PM");
    expect(info.isOpenNow).toBe(true);
    expect(info.isManualOverride).toBe(false);
    expect(info.statusText).toBe("Available • Open till 5:00 PM");
  });

  it("reports closed outside the working window and names the next opening", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 6, 20, 0, 0)); // Mon 8:00 PM
    const info = evaluateProviderAvailability("Mon–Fri from 09:00 AM to 05:00 PM");
    expect(info.isOpenNow).toBe(false);
    expect(info.statusText).toBe("Closed • Opens tomorrow at 9:00 AM");
  });

  it("an availableUntil override in the future forces open regardless of hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 6, 20, 0, 0)); // Mon 8:00 PM — normally closed
    const untilFuture = new Date(2025, 0, 6, 22, 0, 0).toISOString();
    const info = evaluateProviderAvailability("Mon–Fri from 09:00 AM to 05:00 PM", false, untilFuture);
    expect(info.isOpenNow).toBe(true);
    expect(info.isManualOverride).toBe(true);
  });

  it("isAvailableNow explicitly false overrides an otherwise-open window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 6, 11, 0, 0)); // Mon 11:00 AM — normally open
    const info = evaluateProviderAvailability("Mon–Fri from 09:00 AM to 05:00 PM", false);
    expect(info.isOpenNow).toBe(false);
    expect(info.isManualOverride).toBe(true);
  });
});

describe("calculateNextTurnoffTime (time-dependent — fake timers)", () => {
  afterEach(() => vi.useRealTimers());

  it("returns tomorrow's closing time for the given hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 6, 11, 0, 0)); // Mon 11:00 AM
    const turnoff = calculateNextTurnoffTime("Mon–Fri from 09:00 AM to 05:00 PM");
    expect(turnoff.getDate()).toBe(7); // Tuesday
    expect(turnoff.getHours()).toBe(17);
  });

  it("falls back to 7 PM when tomorrow has no working window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 10, 11, 0, 0)); // Fri — tomorrow is closed Sat
    const turnoff = calculateNextTurnoffTime("Mon–Fri from 09:00 AM to 05:00 PM");
    expect(turnoff.getHours()).toBe(19);
  });
});
