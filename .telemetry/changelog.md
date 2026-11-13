# Tracking plan changelog

## 1.2.0 — 2026-10-27 — Release 2 implemented (migration applied by the owner; app half not yet shipped)

**Release 1 status:** `20261009` applied to production by the owner; app code shipped to `main` (OTA + web 1.0.75).

**Code:** `supabase/migrations/20261010_analytics_r2.sql` (+ rollback, generated from the 20261009 bodies), client wiring in `BusinessDetail`, `ProviderDetail`, `MiniMap` (new `onDirections`), `Search`, `CategoryListing`, `MapView`, `Notifications`, `pushNotifications.ts`, `sw.js` + `App.tsx`. Test: `analyticsR2Migration.test.ts`.

**Live once applied and shipped:** all 28 plan events. The app half (4 client events) is harmless before the migration: the names are already whitelisted (20261009).

**Plan changes found while building:**
- `seller_verified` fires on `verification_status → APPROVED`. The column has no VERIFIED value.
- `booking_cancelled.outcome` gains `expired` (queue tokens end as EXPIRED too) and the props `cancelled_by` (appointments: customer / owner / system) and `fulfillment_type`.
- `team_member_added` hooks `business_access_sessions`, not `business_team_members`: that table has no UI caller and no rows. Access sessions are delegated logins granted again on later days, so the event fires only on a person's **first** ACTIVE grant per business. Props are now `access_level` (full / scoped), `scope_count`, `team_member_count` — `role` (OWNER/MANAGER/STAFF) does not exist there.
- `community_post_created` carries the seller when a business or provider posts, plus `has_media`.
- `user.is_team_member` is no longer deferred: active access session as grantee (opaque id join). `seller_snapshot.team_member_count` counts distinct active grantees.
- `search_performed` fires once per settled query (search), per category + filter + radius + sort (category), and per ~1 km map cell + radius (map) — never the text or coordinates.
- `seller_viewed` skips the seller's own owner and team. `seller_contacted` covers the call buttons and both directions entry points (button and map card).
- `notification_opened` covers in-app taps, native push taps and web push taps into an open tab. A web push that opens a new window is not tracked.

**Behavior change:** `events_drop_internal` now keeps `seller_verified` and `agreement_cancelled` when an admin causes them, with `user_id` null and `actor_role = 'system'`. Every other admin row is still dropped.

## 1.1.0 — 2026-10-27 — Release 1 implemented (not yet applied)

**Code:** `supabase/migrations/20261009_analytics_v1.sql` (+ rollback), `src/lib/analytics.ts`, call sites in `authService`, `UserOnboard`, `RequestDetail`, `TrackingPage`, `requestService`, `appointmentService`, `deliveryService`, `DeliveryConsole`. Tests: `analytics.test.ts`, `analyticsV1Migration.test.ts`, updated `deliveryOps.service.test.ts` and `deliveryOperationsMigration.test.ts`.

**Live once applied:** 7 client events (otp ×3, signup_completed, request_viewed, share_link_opened, delivery_declined) and 10 db events (request_created, proposal_created, proposal_accepted, booking_created, deal_completed, dispute_opened, review_left, delivery_status_changed, delivery_cash_collected, delivery_cash_settled). The other 11 are whitelisted but not yet sent (Release 2).

**Plan changes found while building:**
- `proposal_created.price` removed. STRYT's existing rule is that a seller's quote is commercially sensitive, so it stays out.
- `booking_created.is_asap` removed. It isn't stored on `appointments`.
- `delivery_status_changed.stop_count` → `batch_id`, because events are per stop. `delivery_id` is optional for `packed` before a rider exists, and `packed` fires only for DELIVERY orders. (The old client event fired for pickup orders too.)
- `delivery_declined` seller context is optional. The notification decline path doesn't know the shop.
- `settle_agent_cash` was redefined (same body plus one emit) so a settlement is one event rather than one per order.

**Behavior changes worth knowing:**
- Events now carry entity IDs (request, proposal, agreement, delivery, seller). The previous client code kept IDs out of props. Under the agreed PII policy (none), opaque IDs are allowed and names, phones, addresses, coordinates and free text are not. The old test asserting "no ids" was rewritten to assert seller attribution instead.
- `deal_completed.deal_value` (agreed/paid INR) is recorded for GMV. It's admin-read only, like all of `events`.
- Sign-out now rotates the analytics session id.

## 1.0.1 — 2026-10-27
- `deal_completed.customer_id` added (the actor is often staff).

## 1.0.0 — 2026-10-27
- Initial target plan (28 events).
