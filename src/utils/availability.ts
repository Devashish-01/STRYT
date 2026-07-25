import type { AppointmentRecord, BlockedSlot } from "@/types";

export const DEFAULT_WORKING_HOURS = "Mon–Sat from 09:00 AM to 07:00 PM";
export const DEFAULT_ONBOARD_WORKING_HOURS = "Everyday from 09:00 AM to 09:00 PM";
export const DEFAULT_MOCK_WORKING_HOURS = "Mon-Sat 9 AM - 7 PM";
export const DEFAULT_SHORT_WORKING_HOURS = "9 AM - 9 PM";

export const DEFAULT_DAYS_PATTERN = "Mon–Sat";
export const DEFAULT_START_TIME = "09:00 AM";
export const DEFAULT_END_TIME = "07:00 PM";

export const DEFAULT_ONBOARD_DAYS_PATTERN = "Everyday";
export const DEFAULT_ONBOARD_END_TIME = "09:00 PM";

export type DayCode = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export const DAY_CODES: DayCode[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const JS_DAY_INDEX: DayCode[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** One open interval within a day, e.g. the morning half of a split shift. */
export interface TimeRange { from: string; to: string; }
/** A single day's schedule — up to 2 ranges, enabling a split shift (e.g. lunch closure). */
export interface DaySchedule { open: boolean; ranges: TimeRange[]; }
/**
 * Current hours storage format (v2), JSON-serialized into the same `text` column
 * businesses/providers already used for the 3 legacy string formats. Storage is always
 * per-day — there is no day-group concept here, only in the editor UI as a bulk-apply
 * convenience — so overriding one day never disturbs the rest of whatever group it was
 * set from. parseHoursValue() below transparently upgrades all 3 legacy formats on read.
 */
export interface WeeklyHours {
  v: 2;
  mode: "24x7" | "weekly";
  slotDurationMin: number;
  days: Record<DayCode, DaySchedule>;
}

/** Local YYYY-MM-DD key for a date — avoids UTC-shift bugs from toISOString(). */
export function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Owner-set blocks (specific date or recurring weekday) that apply to this calendar day. */
export function matchBlockedSlotsForDate(date: Date, blockedSlots: BlockedSlot[]): BlockedSlot[] {
  const dayKey = dateKey(date);
  const weekday = date.getDay();
  return blockedSlots.filter((b) => (b.recurring ? b.weekday === weekday : b.date === dayKey));
}

export interface AvailabilityInfo {
  isOpenNow: boolean;
  isManualOverride: boolean;
  statusText: string;
  nextClosingTime?: Date;
}

/** Parses time string like "09:00 AM" or "9 AM" or "19:00" into minutes from midnight */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim().toUpperCase();
  const isPM = cleaned.includes("PM");
  const isAM = cleaned.includes("AM");
  const numPart = cleaned.replace(/(AM|PM)/g, "").trim();
  const parts = numPart.split(":");
  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function formatMinutesToTime(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  const displayM = m < 10 ? `0${m}` : m;
  return `${displayH}:${displayM} ${ampm}`;
}

/** Normalizes any accepted time string (12hr "09:00 AM" or 24hr "09:00") to strict 24hr
 *  "HH:MM" — the shape TimeRange values are always stored in, and what <input type="time">
 *  requires. Legacy strings arrive in either shape depending on which of the 3 old formats
 *  they came from, so every TimeRange built below is normalized through this. */
function to24h(timeStr: string): string {
  const min = parseTimeToMinutes(timeStr);
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Which DayCodes a legacy day-group pattern covers. Unrecognized/"Everyday" → all 7,
 *  matching the old (silent-default-to-open) behavior for any unknown pattern. */
function daysForPattern(pattern: string): DayCode[] {
  if (pattern.includes("Mon–Sat") || pattern.includes("Mon-Sat")) return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (pattern.includes("Mon–Fri") || pattern.includes("Mon-Fri")) return ["Mon", "Tue", "Wed", "Thu", "Fri"];
  if (pattern.includes("Sat–Sun") || pattern.includes("Sat-Sun")) return ["Sat", "Sun"];
  return [...DAY_CODES];
}

/** Builds a per-day WeeklyHours from a legacy day-group + single time range — used both to
 *  upgrade old pattern-format strings on read, and by onboarding's day-group picker to write
 *  the new format directly. */
export function expandPatternToWeekly(daysPattern: string, from: string, to: string, slotDurationMin = 30): WeeklyHours {
  const workingDays = new Set(daysForPattern(daysPattern));
  const range = { from: to24h(from), to: to24h(to) };
  const days = {} as Record<DayCode, DaySchedule>;
  for (const d of DAY_CODES) {
    days[d] = workingDays.has(d) ? { open: true, ranges: [{ ...range }] } : { open: false, ranges: [] };
  }
  return { v: 2, mode: "weekly", slotDurationMin, days };
}

/**
 * Single source of truth for reading a stored hours/availabilityNote string. Transparently
 * upgrades all 3 legacy formats ("Open 24×7", the per-day comma list, and the day-group
 * pattern) into the new per-day WeeklyHours shape, alongside the new JSON format itself —
 * so every consumer below shares one parser instead of each keeping its own inline copy.
 */
export function parseHoursValue(raw?: string): WeeklyHours {
  if (!raw) return expandPatternToWeekly(DEFAULT_DAYS_PATTERN, DEFAULT_START_TIME, DEFAULT_END_TIME, 30);

  const trimmed = raw.trim();

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.v === 2 && parsed.days) {
        const days = {} as Record<DayCode, DaySchedule>;
        for (const d of DAY_CODES) {
          const ds = parsed.days[d];
          const ranges = ds && Array.isArray(ds.ranges)
            ? ds.ranges.slice(0, 2).map((r: TimeRange) => ({ from: to24h(r.from), to: to24h(r.to) }))
            : [];
          days[d] = ds && typeof ds === "object" ? { open: !!ds.open, ranges } : { open: false, ranges: [] };
        }
        return {
          v: 2,
          mode: parsed.mode === "24x7" ? "24x7" : "weekly",
          slotDurationMin: typeof parsed.slotDurationMin === "number" ? parsed.slotDurationMin : 30,
          days,
        };
      }
    } catch {
      // Not valid JSON despite the leading brace — fall through to legacy parsing.
    }
  }

  const parts = trimmed.split("|");
  const mainPart = parts[0]?.trim() || "";
  const configPart = parts[1];
  let slotDurationMin = 30;
  if (configPart?.includes("duration=")) {
    const match = configPart.match(/duration=(\d+)/);
    if (match) slotDurationMin = parseInt(match[1], 10);
  }

  if (mainPart === "Open 24×7") {
    const days = {} as Record<DayCode, DaySchedule>;
    for (const d of DAY_CODES) days[d] = { open: true, ranges: [{ from: to24h(DEFAULT_START_TIME), to: to24h(DEFAULT_ONBOARD_END_TIME) }] };
    return { v: 2, mode: "24x7", slotDurationMin, days };
  }

  if (mainPart.includes(", ") || mainPart.includes("Closed") || /^[A-Za-z]{3}\s\d{2}:\d{2}/.test(mainPart)) {
    // Legacy per-day format: e.g. "Mon 11:00–23:30, Tue Closed, ..."
    const days = {} as Record<DayCode, DaySchedule>;
    const chunks = mainPart.split(", ");
    for (const d of DAY_CODES) {
      const chunk = chunks.find((c) => c.startsWith(d));
      if (!chunk || chunk.includes("Closed")) { days[d] = { open: false, ranges: [] }; continue; }
      const timePart = chunk.substring(d.length).trim();
      const times = timePart.split(/[–-]/);
      days[d] = times[0] && times[1]
        ? { open: true, ranges: [{ from: to24h(times[0].trim()), to: to24h(times[1].trim()) }] }
        : { open: false, ranges: [] };
    }
    return { v: 2, mode: "weekly", slotDurationMin, days };
  }

  // Legacy day-group pattern: e.g. "Mon–Fri from 09:00 AM to 07:00 PM"
  let fromTime = DEFAULT_START_TIME;
  let toTime = DEFAULT_END_TIME;
  if (mainPart.includes("from ") && mainPart.includes(" to ")) {
    const p = mainPart.split(" from ");
    const times = p[1]?.split(" to ");
    if (times?.[0]) fromTime = times[0].trim();
    if (times?.[1]) toTime = times[1].trim();
  }
  return expandPatternToWeekly(mainPart || DEFAULT_DAYS_PATTERN, fromTime, toTime, slotDurationMin);
}

export function serializeHoursValue(w: WeeklyHours): string {
  return JSON.stringify(w);
}

/** Resolves a day's open windows (0–2 of them — 2 means a split shift) in minutes-from-midnight. */
export function getDayWindows(w: WeeklyHours, day: DayCode): { fromMin: number; toMin: number }[] {
  const ds = w.days[day];
  if (!ds || !ds.open || ds.ranges.length === 0) return [];
  return ds.ranges
    .map((r) => ({ fromMin: parseTimeToMinutes(r.from), toMin: parseTimeToMinutes(r.to) }))
    .filter((r) => r.toMin > r.fromMin)
    .sort((a, b) => a.fromMin - b.fromMin);
}

/** Human-readable summary for customer-facing UI — collapses consecutive days that share an
 *  identical schedule, and never leaks storage internals (e.g. the old "|duration=30" suffix). */
export function formatHoursForDisplay(raw?: string): string {
  return formatWeeklyHoursForDisplay(parseHoursValue(raw));
}

/** Same as formatHoursForDisplay but works directly off an already-parsed WeeklyHours — lets
 *  editors preview the in-progress (unsaved) schedule without a serialize/parse round trip. */
export function formatWeeklyHoursForDisplay(w: WeeklyHours): string {
  if (w.mode === "24x7") return "Open 24×7";

  const scheduleKey = (d: DayCode) => {
    const ds = w.days[d];
    if (!ds.open || ds.ranges.length === 0) return "closed";
    return ds.ranges.map((r) => `${r.from}-${r.to}`).join(",");
  };
  const rangeText = (d: DayCode) => {
    const ds = w.days[d];
    if (!ds.open || ds.ranges.length === 0) return "Closed";
    return ds.ranges
      .map((r) => `${formatMinutesToTime(parseTimeToMinutes(r.from))}–${formatMinutesToTime(parseTimeToMinutes(r.to))}`)
      .join(", ");
  };

  const groups: { start: DayCode; end: DayCode; text: string }[] = [];
  let i = 0;
  while (i < DAY_CODES.length) {
    const day = DAY_CODES[i];
    const key = scheduleKey(day);
    let j = i;
    while (j + 1 < DAY_CODES.length && scheduleKey(DAY_CODES[j + 1]) === key) j++;
    groups.push({ start: day, end: DAY_CODES[j], text: rangeText(day) });
    i = j + 1;
  }

  return groups
    .map((g) => {
      const label = g.start === g.end ? g.start : `${g.start}–${g.end}`;
      return g.text === "Closed" ? `${label} Closed` : `${label} ${g.text}`;
    })
    .join(" · ");
}

/** Calculates the next start time when availability opens — checks any remaining window today
 *  (including a later shift after a split-shift gap) before scanning forward into next days. */
export function calculateNextStartTime(availabilityNote?: string, now = new Date()): { nextDate: Date; label: string } {
  const w = parseHoursValue(availabilityNote);
  const currentMin = now.getHours() * 60 + now.getMinutes();

  const todayWindows = getDayWindows(w, JS_DAY_INDEX[now.getDay()]);
  const todayNext = todayWindows.find((win) => currentMin < win.fromMin);
  if (todayNext) {
    const target = new Date(now);
    target.setHours(Math.floor(todayNext.fromMin / 60), todayNext.fromMin % 60, 0, 0);
    return { nextDate: target, label: `Opens today at ${formatMinutesToTime(todayNext.fromMin)}` };
  }

  const target = new Date(now);
  target.setDate(target.getDate() + 1);
  let windows = getDayWindows(w, JS_DAY_INDEX[target.getDay()]);
  let guard = 0;
  while (windows.length === 0 && guard < 7) {
    target.setDate(target.getDate() + 1);
    windows = getDayWindows(w, JS_DAY_INDEX[target.getDay()]);
    guard++;
  }
  const fromMin = windows[0]?.fromMin ?? parseTimeToMinutes(DEFAULT_START_TIME);
  target.setHours(Math.floor(fromMin / 60), fromMin % 60, 0, 0);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const diffDays = Math.round((startOfTarget - startOfToday) / (86400 * 1000));
  let dayLabel: string = JS_DAY_INDEX[target.getDay()];
  if (diffDays === 1) dayLabel = "tomorrow";

  return { nextDate: target, label: `Opens ${dayLabel} at ${formatMinutesToTime(fromMin)}` };
}

/** Evaluates whether provider is open right now based on working hours & manual override */
export function evaluateProviderAvailability(
  availabilityNote?: string,
  isAvailableNow?: boolean,
  availableUntil?: string | null
): AvailabilityInfo {
  const now = new Date();

  // Check if manual override until a specific date is active
  if (availableUntil) {
    const untilDate = new Date(availableUntil);
    if (untilDate > now) {
      return {
        isOpenNow: true,
        isManualOverride: true,
        statusText: `Available until ${untilDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        nextClosingTime: untilDate,
      };
    }
  }

  const nextStart = calculateNextStartTime(availabilityNote, now);

  if (!availabilityNote) {
    return {
      isOpenNow: Boolean(isAvailableNow),
      isManualOverride: false,
      statusText: isAvailableNow ? "Available right now" : "Offline",
    };
  }

  const w = parseHoursValue(availabilityNote);
  const currentDayName = JS_DAY_INDEX[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const windows = getDayWindows(w, currentDayName);
  const activeWindow = windows.find((win) => currentMinutes >= win.fromMin && currentMinutes <= win.toMin);
  const isOpen = Boolean(activeWindow);
  const closingMin = activeWindow?.toMin ?? windows[windows.length - 1]?.toMin ?? parseTimeToMinutes(DEFAULT_END_TIME);

  // If user explicitly turned OFF availability (isAvailableNow === false), respect manual off state
  const finalOpen = isAvailableNow === false ? false : (isAvailableNow === true ? true : isOpen);

  return {
    isOpenNow: finalOpen,
    isManualOverride: Boolean(isAvailableNow !== undefined && isAvailableNow !== isOpen),
    statusText: finalOpen
      ? `Available • Open till ${formatMinutesToTime(closingMin)}`
      : `Closed • ${nextStart.label}`,
  };
}

/** Calculates the next turnoff timestamp when turning ON during off-hours — the closing time
 *  of tomorrow's last window (previously a naive string-wide " to " scan). */
export function calculateNextTurnoffTime(availabilityNote?: string): Date {
  const target = new Date();
  target.setDate(target.getDate() + 1); // target next day

  const w = parseHoursValue(availabilityNote);
  const windows = getDayWindows(w, JS_DAY_INDEX[target.getDay()]);
  const toMin = windows.length > 0 ? windows[windows.length - 1].toMin : 19 * 60;

  target.setHours(Math.floor(toMin / 60), toMin % 60, 0, 0);
  return target;
}

export interface AppointmentSlot {
  id: string;
  timeLabel: string;
  dateLabel: string;
  isoTimestamp: string;
  isAvailable: boolean;
  /** True when an owner-set block (not a booking) is why this slot is unavailable. */
  blocked?: boolean;
  blockReason?: string;
  /** Set when a live appointment occupies this exact slot — lets the owner timetable render it inline. */
  bookedAppointmentId?: string;
}

/** Whether the business/provider works on this calendar day, per their availabilityNote. Used to
 *  disable non-working date chips in the booking UI before a customer even opens the slot grid. */
export function isWorkingDay(availabilityNote: string | undefined, targetDate: Date): boolean {
  const w = parseHoursValue(availabilityNote);
  return getDayWindows(w, JS_DAY_INDEX[targetDate.getDay()]).length > 0;
}

/** Generates valid time slots for a given target date based on working hours and slot duration —
 *  loops over every window in the day so a split shift's lunch gap is correctly excluded. */
export function generateWorkingSlots(
  availabilityNote?: string,
  targetDate = new Date(),
  existingAppointments: AppointmentRecord[] = [],
  blockedSlots: BlockedSlot[] = []
): AppointmentSlot[] {
  const slots: AppointmentSlot[] = [];
  const w = parseHoursValue(availabilityNote);
  const slotDuration = w.slotDurationMin || 30;

  const targetDayName = JS_DAY_INDEX[targetDate.getDay()];
  const windows = getDayWindows(w, targetDayName);
  if (windows.length === 0) return [];

  // Owner-set blocks for this calendar day (specific date) or this weekday (recurring).
  const matchingBlocks = matchBlockedSlotsForDate(targetDate, blockedSlots);
  if (matchingBlocks.some((b) => !b.timeLabel)) return []; // whole day blocked
  const blockedTimeLabels = new Map<string, string | undefined>();
  for (const b of matchingBlocks) {
    if (b.timeLabel) blockedTimeLabels.set(b.timeLabel, b.reason ?? undefined);
  }

  const nowTime = Date.now();
  for (const { fromMin, toMin } of windows) {
    for (let min = fromMin; min <= toMin - slotDuration; min += slotDuration) {
      const slotDate = new Date(targetDate);
      slotDate.setHours(Math.floor(min / 60), min % 60, 0, 0);
      const timeLabel = formatMinutesToTime(min);

      // Exact-match booking that starts on this grid slot — used to render the
      // booking inline in the owner timetable (bookedAppointmentId).
      const bookedApt = existingAppointments.find(apt => {
        if (apt.status === "CANCELLED" || apt.status === "REJECTED") return false;
        try {
          return new Date(apt.scheduledForISO).getTime() === slotDate.getTime();
        } catch {
          return false;
        }
      });

      // Availability uses interval overlap, not exact-timestamp equality, so an
      // off-grid walk-in (arbitrary HH:MM) or a changed slot duration still marks
      // the covering slot as taken instead of leaving it wrongly bookable.
      const slotStart = slotDate.getTime();
      const slotEnd = slotStart + slotDuration * 60000;
      const overlapBooked = existingAppointments.some(apt => {
        if (apt.status === "CANCELLED" || apt.status === "REJECTED" || apt.status === "NO_SHOW") return false;
        try {
          const t = new Date(apt.scheduledForISO).getTime();
          return t >= slotStart && t < slotEnd;
        } catch {
          return false;
        }
      });
      const isBlocked = blockedTimeLabels.has(timeLabel);

      const isAvailable = !overlapBooked && !isBlocked && slotStart > nowTime + 5 * 60 * 1000;

      slots.push({
        id: slotDate.toISOString(),
        timeLabel,
        dateLabel: slotDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        isoTimestamp: slotDate.toISOString(),
        isAvailable,
        blocked: isBlocked || undefined,
        blockReason: isBlocked ? blockedTimeLabels.get(timeLabel) : undefined,
        bookedAppointmentId: bookedApt?.id,
      });
    }
  }

  return slots;
}
