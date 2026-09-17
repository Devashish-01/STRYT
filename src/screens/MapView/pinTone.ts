/**
 * The ring state around an avatar pin. One vocabulary shared by every pin type
 * that has an open/closed or available/unavailable state — a business "open"
 * and a provider "available" are the same visual idea (brand-colored ring vs.
 * grey), so they share tones rather than each type inventing its own palette.
 */
export type RingTone = "open" | "closed" | "available" | "unavailable" | "story-new" | "story-seen" | "place";

/** Exported so popup CTAs (and anything else that must match a pin's ring)
 *  read the same tone source — pinColors.business/provider used to drift.
 *  `closed` and `unavailable` are deliberately DIFFERENT greys (not the same
 *  value, as they used to be) — a shut shop and an offline provider are
 *  different situations and shouldn't be visually identical on the map. Both
 *  stay muted, neither competes with an active-state color. */
export const RING_BACKGROUND: Record<RingTone, string> = {
  open: "var(--brand-600)",
  closed: "var(--ink-300)",
  available: "var(--green-500)",
  unavailable: "var(--ink-400)",
  "story-new": "linear-gradient(135deg,var(--accent-500),var(--pink-500),var(--brand-600))",
  "story-seen": "var(--ink-400)",
  // Places have no open/closed or available/unavailable state — one static
  // tone, distinct from every other pin type so it reads as its own category.
  place: "var(--amber-700)",
};
