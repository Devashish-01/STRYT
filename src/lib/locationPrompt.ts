/**
 * The one flag that records "this person was asked for their location during
 * onboarding and chose to skip".
 *
 * Skipping is legitimate — location is optional by design — but it leaves
 * `users.lat/lng` at the seeded `0, 0`. Every discovery call already coerces
 * that away (`user.lat || undefined`), so the feed is *unranked* rather than
 * ranked against a point in the Atlantic. The problem was never the ranking:
 * it was that nothing on screen said so. Home rendered
 * `t("neighborhood_placeholder")` — the literal example string "e.g. Amanora
 * Park Town, Pune" — in the header where the user's own area goes, which reads
 * as a real, wrong answer rather than a missing one
 * (CUSTOMER_ONBOARDING #5 and #8).
 *
 * Kept in its own module so the onboarding flow and Home can agree on the key
 * without importing each other.
 */
export const LOCATION_SKIPPED_KEY = "ob_location_skipped";

/** True when the user has no usable coordinates — either they skipped the
 *  question or the profile simply has none yet. `0` is the seed value, and a
 *  real 0,0 fix is the Gulf of Guinea, so treating it as "unset" is safe. */
export function hasNoLocation(lat?: number | null, lng?: number | null): boolean {
  return !lat || !lng;
}
