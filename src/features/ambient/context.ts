export type DayPart = "morning" | "afternoon" | "evening" | "night";
export type Season  = "summer" | "monsoon" | "winter" | "spring";

export function getDayPart(d = new Date()): DayPart {
  const h = d.getHours();
  if (h >= 5  && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

// India-centric seasons (by month index, 0=Jan)
export function getSeason(d = new Date()): Season {
  const m = d.getMonth();
  if (m >= 2 && m <= 4)  return "summer";   // Mar–May
  if (m >= 5 && m <= 8)  return "monsoon";  // Jun–Sep
  if (m >= 9 && m <= 10) return "spring";   // Oct–Nov (post-monsoon / festive)
  return "winter";                           // Dec–Feb
}

export interface Festival { name: string; themeKey: string; }

// Data-driven festival windows — update yearly, not the logic
const FESTIVALS: { name: string; themeKey: string; start: string; end: string }[] = [
  { name: "Diwali",      themeKey: "diwali",  start: "2025-10-20", end: "2025-10-24" },
  { name: "Diwali",      themeKey: "diwali",  start: "2026-11-06", end: "2026-11-12" },
  { name: "Holi",        themeKey: "holi",    start: "2025-03-14", end: "2025-03-14" },
  { name: "Holi",        themeKey: "holi",    start: "2026-03-03", end: "2026-03-04" },
  { name: "Ganeshotsav", themeKey: "ganesh",  start: "2025-08-27", end: "2025-09-07" },
  { name: "Ganeshotsav", themeKey: "ganesh",  start: "2026-09-14", end: "2026-09-24" },
  { name: "Eid ul-Fitr", themeKey: "eid",     start: "2026-03-20", end: "2026-03-21" },
  { name: "Christmas",   themeKey: "xmas",    start: "2025-12-24", end: "2025-12-26" },
  { name: "Christmas",   themeKey: "xmas",    start: "2026-12-24", end: "2026-12-26" },
];

export function getActiveFestival(d = new Date()): Festival | null {
  const today = d.toISOString().slice(0, 10);
  const f = FESTIVALS.find((x) => today >= x.start && today <= x.end);
  return f ? { name: f.name, themeKey: f.themeKey } : null;
}
