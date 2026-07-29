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
 */
export const DELIVERY_AGENT_ENABLED = true;

/**
 * Main map screen (MapView) tries Mapbox's styled tiles first, falling back
 * to the free OpenFreeMap style (src/screens/MapView/index.tsx's original,
 * still-default behavior) if Mapbox errors or hasn't loaded within 4s. Flip
 * to `false` for an instant, code-only revert to the pure-free-map behavior —
 * no other changes needed — if Mapbox ever misbehaves in a way the
 * timeout/error handling doesn't catch.
 */
export const MAPBOX_PRIMARY_MAP_ENABLED = true;
