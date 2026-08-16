/**
 * Client feature flags.
 *
 * Flags let us land groundwork (types, DB migrations, dormant code) on `main`
 * without exposing an unfinished feature to users. Flip to `true` only when the
 * full flow is wired and tested.
 */

/**
 * Delivery Agent flow (docs/plans/app-plans/09_delivery_boy_flow.md).
 *
 * Phase 1 (DB + scope groundwork), Phase 2 (Delivery hat + console), and
 * Phase 3 (assignment/tracking UI) are all built — DeliveryConsole.tsx,
 * DeliveryAssignControl.tsx, DeliveryTrackControl.tsx, the Team & Access
 * `delivery` scope/preset, and the customer IN_STORE/DELIVERY toggle in
 * AppointmentSheet.tsx were sitting wired but dark behind this flag.
 *
 * OFF for the v1.0 Play Store submission — not because the feature isn't
 * ready, but because reviewing it properly (its own background-location
 * declaration, demo video, and test account) is a second pass we're
 * deliberately not blocking launch on. Flip back to `true` for v1.1, along
 * with restoring REQUEST_IGNORE_BATTERY_OPTIMIZATIONS in AndroidManifest.xml
 * and un-marking the deferred sections in docs/launch/.
 */
export const DELIVERY_AGENT_ENABLED = false;
