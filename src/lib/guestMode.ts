/**
 * Guest mode — the signed-out browse experience.
 *
 * Services (`discoveryService`, `requestService`, …) are plain modules, not React
 * components, so they can't read the store's context to find out whether the
 * current viewer is a guest. This module is the bridge: `AppProvider` pushes the
 * flag in, services read it out.
 *
 * Deliberately NOT persisted anywhere. It's derived state — recomputed from the
 * auth session on every boot — so it can never get stuck "on" for a user who has
 * since signed in.
 */

/**
 * Guests see 1 km. Not adjustable — a signed-in user's own `settings_radius`
 * preference must never widen a guest's view (see GUEST_MODE_PLAN.md §3).
 *
 * NOTE: this is a *product* limit, enforced client-side. The underlying rows are
 * already readable by `anon` at the RLS level, so this shapes what the app shows
 * rather than hard-securing the data. That trade-off is accepted and documented
 * in GUEST_MODE_PLAN.md §6 — don't "fix" it here without reading that first.
 */
export const GUEST_RADIUS_KM = 1;

let guestActive = false;

/** Called by AppProvider whenever the auth session resolves. */
export function setGuestMode(on: boolean): void {
  guestActive = on;
}

export function isGuestMode(): boolean {
  return guestActive;
}

/**
 * The radius a feed should use for the current viewer. Guests are clamped to
 * GUEST_RADIUS_KM regardless of what the caller asked for or what's saved in
 * localStorage from a previous signed-in session on this device.
 */
export function clampRadiusForViewer(requested: number | undefined): number | undefined {
  if (!guestActive) return requested;
  return requested === undefined ? GUEST_RADIUS_KM : Math.min(requested, GUEST_RADIUS_KM);
}
