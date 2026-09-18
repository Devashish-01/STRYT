import { RADIUS_OPTIONS, WORLD_RADIUS_KM } from "@/utils/constants";

/**
 * The radius an empty feed's "Widen to …" button should offer: the next preset above the current one.
 *
 * It used to be a fixed 5 km, so a feed already at 5 km (the default) offered "Widen to 5 km" and the button did
 * nothing. "World" is not offered from here — it is a different kind of choice than "a bit further" — so past the
 * largest regular preset there is nothing to widen to, and the caller hides the button.
 */
export function nextWidenRadius(currentKm: number): number | null {
  const next = RADIUS_OPTIONS.map((o) => o.km).filter((km) => km < WORLD_RADIUS_KM && km > currentKm).sort((a, b) => a - b)[0];
  return next ?? null;
}
