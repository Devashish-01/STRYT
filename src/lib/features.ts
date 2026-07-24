/**
 * Client feature flags.
 *
 * Flags let us land groundwork (types, DB migrations, dormant code) on `main`
 * without exposing an unfinished feature to users. Flip to `true` only when the
 * full flow is wired and tested.
 */

/**
 * Delivery Agent flow (app-plans/09_delivery_boy_flow.md).
 *
 * Phase 1 (DB + scope groundwork) is live and inert: the `delivery` team scope,
 * `appointment_deliveries` table + RLS, and the assign/track/handoff RPCs exist
 * but nothing in the UI surfaces them yet. Keep this `false` until the Delivery
 * hat + console (Phase 2) and assignment/tracking UI (Phase 3) ship.
 */
export const DELIVERY_AGENT_ENABLED = false;
