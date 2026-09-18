/**
 * Small pure rules shared by the notification cards (components/NotificationContent.tsx and the per-type cards).
 */

/**
 * The status pill a card should show, or undefined when the title already says it. "Payment confirmed" with a
 * "Confirmed" pill says the same thing twice; "Payment received" with "Awaiting confirmation" does not.
 */
export function distinctPill(title: string, pill?: string | null): string | undefined {
  if (!pill) return undefined;
  const words = pill.replace(/[✓✔]/g, "").trim().toLowerCase();
  if (!words) return undefined;
  return title.toLowerCase().includes(words) ? undefined : pill;
}

/**
 * Up to two letters for an avatar that has no photo: "Ravi Plumbing" → "RP", "asha" → "A". Counts code points, not
 * UTF-16 units, so a name starting with an emoji or a Devanagari letter is not cut in half.
 */
export function initialsOf(name?: string | null): string {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}
