# Tracking plan changelog

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
