import type { AppointmentRecord } from "@/types";

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
  let fromMin = 9 * 60;
  const raw = availabilityNote ? availabilityNote.split("|")[0].trim() : "Mon–Sat from 09:00 AM to 07:00 PM";

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

  let fromMin = 9 * 60; // 9:00 AM
  let toMin = 19 * 60; // 7:00 PM

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
}

/** Generates valid time slots for a given target date based on working hours and slot duration */
export function generateWorkingSlots(
  availabilityNote?: string,
  targetDate = new Date(),
  existingAppointments: AppointmentRecord[] = []
): AppointmentSlot[] {
  const slots: AppointmentSlot[] = [];
  const note = availabilityNote || "Mon–Sat from 09:00 AM to 07:00 PM";
  
  const parts = note.split("|");
  const mainPart = parts[0]?.trim() || "Mon–Sat from 09:00 AM to 07:00 PM";
  const configPart = parts[1];
  
  let slotDuration = 30;
  if (configPart && configPart.includes("duration=")) {
    const match = configPart.match(/duration=(\d+)/);
    if (match) slotDuration = parseInt(match[1], 10);
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const targetDayName = dayNames[targetDate.getDay()];
  
  let fromMin = 9 * 60; // 9:00 AM
  let toMin = 19 * 60;  // 7:00 PM
  let isWorkingDay = true;

  if (mainPart === "Open 24×7") {
    fromMin = 9 * 60; // default active range from 9 AM to 9 PM
    toMin = 21 * 60;
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

  if (!isWorkingDay) return [];

  const nowTime = Date.now();
  for (let min = fromMin; min <= toMin - slotDuration; min += slotDuration) {
    const slotDate = new Date(targetDate);
    slotDate.setHours(Math.floor(min / 60), min % 60, 0, 0);

    const isBooked = existingAppointments.some(apt => {
      if (apt.status === "CANCELLED" || apt.status === "REJECTED") return false;
      try {
        return new Date(apt.scheduledForISO).getTime() === slotDate.getTime();
      } catch {
        return false;
      }
    });

    const isAvailable = !isBooked && slotDate.getTime() > nowTime + 5 * 60 * 1000;

    slots.push({
      id: slotDate.toISOString(),
      timeLabel: formatMinutesToTime(min),
      dateLabel: slotDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      isoTimestamp: slotDate.toISOString(),
      isAvailable,
    });
  }

  return slots;
}
