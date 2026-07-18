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

/** Calculates the next start time when availability opens */
export function calculateNextStartTime(availabilityNote?: string, now = new Date()): { nextDate: Date; label: string } {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let fromMin = parseTimeToMinutes(DEFAULT_START_TIME);
  const raw = availabilityNote ? availabilityNote.split("|")[0].trim() : DEFAULT_WORKING_HOURS;

  if (raw.includes("from ") && raw.includes(" to ")) {
    const parts = raw.split(" from ");
    const times = parts[1]?.split(" to ");
    if (times?.[0]) fromMin = parseTimeToMinutes(times[0]);
  }

  function isWorking(d: Date): boolean {
    const name = dayNames[d.getDay()];
    if (raw.includes("Mon–Sat") || raw.includes("Mon-Sat")) return name !== "Sun";
    if (raw.includes("Mon–Fri") || raw.includes("Mon-Fri")) return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(name);
    if (raw.includes("Sat–Sun") || raw.includes("Sat-Sun")) return ["Sat", "Sun"].includes(name);
    return true;
  }

  const currentMin = now.getHours() * 60 + now.getMinutes();

  if (isWorking(now) && currentMin < fromMin) {
    const target = new Date(now);
    target.setHours(Math.floor(fromMin / 60), fromMin % 60, 0, 0);
    return { nextDate: target, label: `Opens today at ${formatMinutesToTime(fromMin)}` };
  }

  const target = new Date(now);
  target.setDate(target.getDate() + 1);
  while (!isWorking(target)) {
    target.setDate(target.getDate() + 1);
  }
  target.setHours(Math.floor(fromMin / 60), fromMin % 60, 0, 0);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const diffDays = Math.round((startOfTarget - startOfToday) / (86400 * 1000));
  let dayLabel = dayNames[target.getDay()];
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

  const cleanNote = availabilityNote ? availabilityNote.split("|")[0].trim() : "";
  const nextStart = calculateNextStartTime(cleanNote, now);

  if (!availabilityNote) {
    return {
      isOpenNow: Boolean(isAvailableNow),
      isManualOverride: false,
      statusText: isAvailableNow ? "Available right now" : "Offline",
    };
  }

  // Parse availabilityNote like "Mon–Sat from 09:00 AM to 07:00 PM"
  const raw = cleanNote;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const currentDayName = dayNames[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let isWorkingDay = true;
  if (raw.includes("Mon–Sat") || raw.includes("Mon-Sat")) {
    isWorkingDay = currentDayName !== "Sun";
  } else if (raw.includes("Mon–Fri") || raw.includes("Mon-Fri")) {
    isWorkingDay = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(currentDayName);
  } else if (raw.includes("Sat–Sun") || raw.includes("Sat-Sun")) {
    isWorkingDay = ["Sat", "Sun"].includes(currentDayName);
  }

  let fromMin = parseTimeToMinutes(DEFAULT_START_TIME); // 9:00 AM
  let toMin = parseTimeToMinutes(DEFAULT_END_TIME); // 7:00 PM

  if (raw.includes("from ") && raw.includes(" to ")) {
    const parts = raw.split(" from ");
    const times = parts[1]?.split(" to ");
    if (times?.[0]) fromMin = parseTimeToMinutes(times[0]);
    if (times?.[1]) toMin = parseTimeToMinutes(times[1]);
  }

  const isWithinHours = currentMinutes >= fromMin && currentMinutes <= toMin;
  const isOpen = isWorkingDay && isWithinHours;

  // If user explicitly turned OFF availability (isAvailableNow === false), respect manual off state
  const finalOpen = isAvailableNow === false ? false : (isAvailableNow === true ? true : isOpen);

  return {
    isOpenNow: finalOpen,
    isManualOverride: Boolean(isAvailableNow !== undefined && isAvailableNow !== isOpen),
    statusText: finalOpen
      ? `Available • Open till ${formatMinutesToTime(toMin)}`
      : `Closed • ${nextStart.label}`,
  };
}

/** Calculates the next turnoff timestamp when turning ON during off-hours */
export function calculateNextTurnoffTime(availabilityNote?: string): Date {
  const target = new Date();
  target.setDate(target.getDate() + 1); // target next day

  let toMin = 19 * 60; // default 7 PM
  const raw = availabilityNote ? availabilityNote.split("|")[0].trim() : "";
  if (raw && raw.includes(" to ")) {
    const parts = raw.split(" to ");
    if (parts[1]) toMin = parseTimeToMinutes(parts[1]);
  }

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

interface WorkingWindow {
  isWorkingDay: boolean;
  fromMin: number;
  toMin: number;
}

/** Resolves whether a day is worked and its open/close minutes from an availabilityNote's main part. */
function resolveWorkingWindow(mainPart: string, targetDayName: string): WorkingWindow {
  let fromMin = parseTimeToMinutes(DEFAULT_START_TIME); // 9:00 AM
  let toMin = parseTimeToMinutes(DEFAULT_END_TIME);  // 7:00 PM
  let isWorkingDay = true;

  if (mainPart === "Open 24×7") {
    fromMin = parseTimeToMinutes(DEFAULT_START_TIME); // default active range from 9 AM to 9 PM
    toMin = parseTimeToMinutes(DEFAULT_ONBOARD_END_TIME);
    isWorkingDay = true;
  } else if (mainPart.includes(", ") || mainPart.includes("Closed") || mainPart.match(/^[A-Za-z]{3}\s\d{2}:\d{2}/)) {
    // Per-day format: e.g. "Mon 11:00–23:30, Tue Closed"
    const chunks = mainPart.split(", ");
    const dayChunk = chunks.find(c => c.startsWith(targetDayName));
    if (dayChunk) {
      if (dayChunk.includes("Closed")) {
        isWorkingDay = false;
      } else {
        const timePart = dayChunk.substring(4).trim();
        const times = timePart.split(/[–-]/);
        if (times[0] && times[1]) {
          fromMin = parseTimeToMinutes(times[0]);
          toMin = parseTimeToMinutes(times[1]);
          isWorkingDay = true;
        } else {
          isWorkingDay = false;
        }
      }
    } else {
      isWorkingDay = false;
    }
  } else {
    // Pattern format: e.g. "Mon–Sat from 09:00 AM to 07:00 PM"
    if (mainPart.includes("from ") && mainPart.includes(" to ")) {
      const p = mainPart.split(" from ");
      const times = p[1]?.split(" to ");
      if (times?.[0]) fromMin = parseTimeToMinutes(times[0]);
      if (times?.[1]) toMin = parseTimeToMinutes(times[1]);
    }

    if (mainPart.includes("Mon–Sat") || mainPart.includes("Mon-Sat")) {
      isWorkingDay = targetDayName !== "Sun";
    } else if (mainPart.includes("Mon–Fri") || mainPart.includes("Mon-Fri")) {
      isWorkingDay = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(targetDayName);
    } else if (mainPart.includes("Sat–Sun") || mainPart.includes("Sat-Sun")) {
      isWorkingDay = ["Sat", "Sun"].includes(targetDayName);
    }
  }

  return { isWorkingDay, fromMin, toMin };
}

/** Whether the business/provider works on this calendar day, per their availabilityNote. Used to
 *  disable non-working date chips in the booking UI before a customer even opens the slot grid. */
export function isWorkingDay(availabilityNote: string | undefined, targetDate: Date): boolean {
  const note = availabilityNote || DEFAULT_WORKING_HOURS;
  const mainPart = note.split("|")[0]?.trim() || DEFAULT_WORKING_HOURS;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return resolveWorkingWindow(mainPart, dayNames[targetDate.getDay()]).isWorkingDay;
}

/** Generates valid time slots for a given target date based on working hours and slot duration */
export function generateWorkingSlots(
  availabilityNote?: string,
  targetDate = new Date(),
  existingAppointments: AppointmentRecord[] = [],
  blockedSlots: BlockedSlot[] = []
): AppointmentSlot[] {
  const slots: AppointmentSlot[] = [];
  const note = availabilityNote || DEFAULT_WORKING_HOURS;

  const parts = note.split("|");
  const mainPart = parts[0]?.trim() || DEFAULT_WORKING_HOURS;
  const configPart = parts[1];

  let slotDuration = 30;
  if (configPart && configPart.includes("duration=")) {
    const match = configPart.match(/duration=(\d+)/);
    if (match) slotDuration = parseInt(match[1], 10);
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const targetDayName = dayNames[targetDate.getDay()];

  const { isWorkingDay: workingToday, fromMin, toMin } = resolveWorkingWindow(mainPart, targetDayName);
  if (!workingToday) return [];

  // Owner-set blocks for this calendar day (specific date) or this weekday (recurring).
  const matchingBlocks = matchBlockedSlotsForDate(targetDate, blockedSlots);
  if (matchingBlocks.some((b) => !b.timeLabel)) return []; // whole day blocked
  const blockedTimeLabels = new Map<string, string | undefined>();
  for (const b of matchingBlocks) {
    if (b.timeLabel) blockedTimeLabels.set(b.timeLabel, b.reason ?? undefined);
  }

  const nowTime = Date.now();
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

  return slots;
}
