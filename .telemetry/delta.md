# Delta: Current → Target

**From:** `.telemetry/current-state.yaml` (audit 2026-10-27, 23 events, all client-side)
**To:** `.telemetry/tracking-plan.yaml` v1.0.0 (28 events: 17 db-side, 11 client-side)

**Accounting:** 16 KEEP + 1 RENAME (consolidates 7) + 11 ADD = **28 target events** ✓
**Removed as standalone names:** 7 delivery events, folded into one (no event is dropped outright)

## Decisions this delta is built on

| Decision | Choice |
|----------|--------|
| Naming | Keep `object_action` snake_case (`request_created`). No event renames except the delivery consolidation. |
| Event source | State changes are emitted in Postgres (triggers/RPCs → `emit_event`). The client sends only what the DB can't know. |
| PII | None anywhere. IDs and categorical values only. |
| Internal users | Drop events whose actor has `admin` / `super_admin`. |
| Groups | One flat group, `seller` (`b_*` business or `p_*` provider), stored as `seller_type` + `seller_id` columns on `events`. |

---

## P0 — Foundation (do first; everything else depends on it)

| # | Change | Where |
|---|--------|-------|
| 1 | Add columns to `public.events`: `source`, `platform`, `seller_type`, `seller_id`, `actor_role`. Index `(seller_id, name, created_at)`. | new migration |
| 2 | Create `public.emit_event(name, props, seller_type, seller_id, actor_role)` — SECURITY DEFINER, not executable by `anon`/`authenticated`, skips admin actors, scrubs nothing because callers pass only IDs and enums. | new migration |
| 3 | Replace the `events_name_known` CHECK with the 28 target names. In the same migration, rewrite the 7 old delivery rows to `delivery_status_changed` with `props.status`. | new migration |
| 4 | `track()`: send `source='client'` and `platform`, accept optional `seller_type`/`seller_id`, skip when the current user is admin, and expose `resetAnalyticsSession()`. | `src/lib/analytics.ts` |
| 5 | Call `resetAnalyticsSession()` on sign-out. This rotates `session_id` and zeroes the counter. | sign-out path in `src/store/AppProvider.tsx` / `authService` |
| 6 | Analytics views: `analytics.user_traits`, `analytics.seller_traits`, plus a daily materialized snapshot via pg_cron. | new migration |

## Keep (tracked today, name unchanged — 16)

Events that move from client to db lose their client `track()` call in the same change.

| Event | Source change | Shape changes |
|-------|---------------|---------------|
| `signup_completed` | client → client | `interests` → `interest_count`. `skipped_location` → `has_location` (inverted). |
| `otp_sent` | client → client | `native` → `is_native`. `resend` → `is_resend`. |
| `otp_verified` | client → client | `native` → `is_native`. `auto` → `is_auto_verified`. |
| `otp_failed` | client → client | `code` → `error_code`. `provider` → `provider_error_code`. `native` → `is_native`. |
| `request_viewed` | client → client | `guest` → `is_guest`. Add `request_id`, `is_viewer_seller`, `entry_source`. |
| `share_link_opened` | client → client | `kind` → `link_type`. `valid` → `is_valid`. |
| `delivery_declined` | client → client | `kind` → `assignment_type`. Add `delivery_id`, seller context. |
| `request_created` | **client → db** (insert on `requests`) | `category` (name) → `category_id`. Add `request_id`, `is_bulk`. Remove `track` at `requestService.ts:317`. |
| `proposal_created` | **client → db** (insert on `proposals`) | `responder_type` → envelope `seller_type`/`seller_id`. Add `proposal_id`, `request_id`, `is_first_proposal`, `minutes_since_request`, `price`. Remove `requestService.ts:415`. |
| `proposal_accepted` | **client → db** (agreement insert in `accept_proposal` + `accept_proposal_counter`) | Now covers counter-offer acceptance. Add `proposal_id`, `request_id`, `agreement_id`, `is_via_counter`, `proposal_count`. Remove `requestService.ts:463`. |
| `booking_created` | **client → db** (insert on `appointments` and `queue_tokens`) | Now covers queue joins. Add `booking_id`, `booking_type`, `is_asap`. Keep `fulfillment_type`. `target_type` → envelope. Remove `appointmentService.ts:392`. |
| `deal_completed` | **client → db** (agreements→COMPLETED, appointments→COMPLETED, queue_tokens→SERVED) | **North star.** Now covers all three channels. Add `deal_type`, `deal_id`, `customer_id`, `category_id`, `fulfillment_type`, `deal_value`, `minutes_to_complete`, `is_repeat_customer`. Remove `requestService.ts:566`. |
| `dispute_opened` | **client → db** (agreements→DISPUTED) | Add `agreement_id`, `disputed_from_status`. Remove `requestService.ts:631`. |
| `review_left` | **client → db** (insert on `ratings`) | Add `rating_id`, `has_comment`, `has_tip`. Remove `requestService.ts:682`. |
| `delivery_cash_collected` | **client → db** (cash-collect RPC) | Add `delivery_id`. Remove `deliveryService.ts:739`. |
| `delivery_cash_settled` | **client → db** (settle RPC) | Add `delivery_count`. Remove `deliveryService.ts:762`. |

## Rename / consolidate (1 target replaces 7 current)

| Current names | Target name | Notes |
|---------------|-------------|-------|
| `delivery_packed`, `delivery_assigned`, `delivery_picked_up`, `delivery_started`, `delivery_arrived`, `delivery_delivered`, `delivery_failed` | `delivery_status_changed` | One db event with `status` ∈ packed, assigned, picked_up, leaving, on_the_way, arrived, delivered, failed. This splits the old `delivery_started` into leaving/on_the_way, carries `failure_reason`, `assignment_type` and `stop_count`, and records true server time instead of outbox-flush time. Remove the client calls at `deliveryService.ts:354, 362, 474, 731, 805, 817`. |

## Add (not tracked today — 11)

| Priority | Event | Source | Why |
|----------|-------|--------|-----|
| P1 | `booking_cancelled` | db | Supply-side rejections, no-shows and queue walk-outs are where bookings die. They're invisible today. |
| P1 | `agreement_cancelled` | db | Shows how many accepted deals die in the 10-minute mutual confirmation. That's the biggest blind spot in the request loop. |
| P1 | `seller_created` | db | The supply-side counterpart of signup. Needed to measure seller activation (created → first proposal → first deal). |
| P1 | `search_performed` | client | Unmet demand. `result_count = 0` by area is the signal for which sellers to recruit. |
| P1 | `seller_viewed` | client | Joins discovery to bookings per session. The existing view logs have no user or session. |
| P1 | `seller_contacted` | client | Calls and directions are how many hyperlocal deals close off-app. Today they're a bare counter. |
| P2 | `notification_opened` | client | Whether request broadcasts actually reach sellers, which drives time to first reply. |
| P2 | `seller_verified` | db | Trust milestone. Lets you compare verified and unverified conversion. |
| P2 | `team_member_added` | db | Business adoption depth. |
| P2 | `conversation_started` | db | Pre-deal intent. Messages themselves stay untracked. |
| P2 | `community_post_created` | db | The retention loop between transactions. |

## Remove

None outright. The 7 delivery step names are retired from the whitelist after their rows are rewritten (see Rename).

## Other changes

| Item | Change |
|------|--------|
| `marketplace_health()` | Unchanged and still authoritative. It has no caller yet; wiring it into the admin dashboard is a separate UI task. |
| View logs / `bump_*` RPCs | Unchanged. They power the in-app business dashboard. `seller_viewed` / `seller_contacted` are the analytics copies. |
| Vercel Analytics | Unchanged. It handles traffic only. |
| Safety features | Explicitly never tracked (SOS, emergency contacts, live location). |
| Billing | Deferred until Pro plans go live. `seller.pro_tier` trait is reserved. |

## Migration risks

1. **Double counting during rollout.** Ship each trigger and the removal of its client `track()` in the same release. OTA updates (Capgo) shorten the overlap, but old native builds will keep sending client copies until they update. Filter `source = 'client'` for moved events after cutover.
2. **CHECK constraint ordering.** Old clients still send the 7 retired delivery names. Keep them in the whitelist for one release cycle, then remove them. Inserts from old clients fail silently by design, so nothing breaks for users.
3. **Trigger cost on hot tables.** `queue_tokens` and `appointments` triggers must be `AFTER` row triggers that do one `insert`. `is_repeat_customer` needs an index-backed lookup on (customer, seller, completed).
4. **System actor attribution.** Timeouts and sweeps run with no `auth.uid()`. `emit_event` must set `actor_role = 'system'` explicitly rather than infer it.
5. **Historical property renames.** Existing rows keep old prop keys (`native`, `guest`, …). Either rewrite them in the migration (low volume, recommended) or alias them in the analytics views.
