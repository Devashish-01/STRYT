import { normalizeTimeStr } from "@/components/HoursSelector";

/**
 * Best-effort translation of OpenStreetMap's `opening_hours` mini-DSL into
 * STRYT's own hours string format ("<days> from <HH:MM AM/PM> to <HH:MM AM/PM>",
 * see HoursSelector's parseAvailability/updateTiming). Only the small set of
 * shapes the rest of the app actually understands (utils/availability.ts's
 * resolveWorkingWindow only recognizes "Everyday", "Mon–Sat", "Mon–Fri",
 * "Sat–Sun" as day patterns) are translated — anything else (multiple rules,
 * exceptions, 24/7 variants, comma day-lists) returns undefined so the caller
 * can fall back to showing the raw OSM text instead of a silently-wrong value.
 */

function dayPatternFor(startCode: string, endCode: string): string | undefined {
  if (startCode === "Mo" && endCode === "Su") return "Everyday";
  if (startCode === "Mo" && endCode === "Sa") return "Mon–Sat";
  if (startCode === "Mo" && endCode === "Fr") return "Mon–Fri";
  if (startCode === "Sa" && endCode === "Su") return "Sat–Sun";
  return undefined;
}

export function translateOsmHours(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().replace(/;\s*$/, "");
  if (!cleaned || cleaned.includes(";")) return undefined; // multiple rules — too complex

  if (/^24\/7$/i.test(cleaned)) {
    return `Everyday from 12:00 AM to 11:59 PM`;
  }

  // e.g. "Mo-Fr 09:00-18:00" — only a day *range* is translated (not a bare
  // single day like "Sa 09:00-13:00"): utils/availability.ts's day-open logic
  // only recognizes the four ranges below, so a single-day pattern would
  // silently be treated as open every day rather than just that one.
  const match = cleaned.match(
    /^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/,
  );
  if (!match) return undefined;

  const [, startCode, endCode, from, to] = match;
  const days = dayPatternFor(startCode, endCode);
  if (!days) return undefined;

  return `${days} from ${normalizeTimeStr(from)} to ${normalizeTimeStr(to)}`;
}
