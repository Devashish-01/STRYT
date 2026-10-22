# Delivery — production-readiness audit

**Date:** 2026-10-19 · **Scope:** every delivery surface — rider console, owner dispatch/live board/cash/insights, customer ordering/tracking, public tracking page, notifications, and the database functions behind them. · **Method:** read the code and the *live* function definitions (staging; production matched on the functions compared), traced each flow end to end. Nothing was changed.
**Continues** `DLV-001…009` in `archive/docs/trackers/DELIVERY_FLOW_TRACKER.md` and supersedes the status columns of `DELIVERY_RIDER_CONSOLE_`, `MERCHANT_DELIVERY_DISPATCH_` and `CUSTOMER_DELIVERY_TRACKING_GAP_LOG.md` (re-verified in §6).

Severity: **P0** = money or safety wrong / flow dead — blocks production · **P1** = real users hit it in week one · **P2** = degrades quality at scale · **P3** = polish.

## 1. Summary

| | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| New findings (DLV-010…043, 34 total; DLV-036 retracted) | 6 | 14 | 11 | 2 |

**The six P0s:** cancelling an order does not stop a live delivery (DLV-010) · UPI/deposit payments ignore the delivery fee and deposits, so cash due is wrong (DLV-011) · solo-assignment Accept/Decline buttons are dead (DLV-016) · the rider cannot call anyone and has no fallback when the customer can't give the code (DLV-017) · shared tracking links are dead on the Android app (DLV-026) · the delivery status machine isn't enforced (DLV-022).

## 2. Money and order integrity

### DLV-010 — P0 — Cancelling an order does not stop its delivery
- `appointment_transition` lets a customer cancel from `PENDING`/`ACCEPTED` and an owner cancel from `ACCEPTED` with **no check on a live delivery**, and nothing cascades to `appointment_deliveries` (no trigger on `appointments` touches it; `reschedule_appointment` cancels the same way).
- **Scenario:** rider is EN_ROUTE, customer taps Cancel → appointment `CANCELLED`, delivery row stays `EN_ROUTE`. Rider keeps navigating, verifies the code, collects cash (`delivery_collect_cash` doesn't check appointment status) and marks delivered; `tg_complete_appointment_on_delivery` only flips `PENDING/ACCEPTED`, so the order stays `CANCELLED` while goods and cash changed hands. Owner-side cancel never notifies the rider either.
- **Fix:** one rule in the database: cancelling an appointment with an active delivery cancels it (reason `ORDER_CANCELLED`), notifies the rider and (if prepaid) flags a refund; customer cancel is blocked or fee-bearing once `EN_ROUTE`/`ready_at` (see DLV-032).

### DLV-011 — P0 — Payment claims ignore the delivery fee and deposits; cash due is wrong
- `appointment_claim_payment` sets `payment_amount := coalesce(package_price, p_amount)` — **goods only**. My order sheet now shows and asks for *goods + fee*, but the record says goods only, and the owner confirms a smaller number than the customer paid. For a deposit order the customer pays e.g. 30% but the row says the full goods price, then `appointment_confirm_payment` marks it `PAID`.
- `my_deliveries.amount_due` (20261001) returns 0 whenever `payment_status = 'PAID'`, and `delivery_collect_cash` raises `ALREADY_PAID` — so for deposit orders (and any under-recorded claim) **the rider is told nothing is due and cannot collect the balance**. The deposit mis-recording itself pre-dates delivery; delivery makes it cost real cash.
- **Fix:** claim amount = goods + `delivery_fee` (and the deposit amount when a deposit applies); store paid vs total; `amount_due = total − paid`; collect RPC allowed for the balance.

### DLV-012 — P1 — Rescheduling a delivery order drops its fee, ASAP and out-of-range flags
- `reschedule_appointment` copies the address/payment fields but not `delivery_fee`, `is_asap`, `ready_at`, `is_out_of_range` (the first two are from migration 20261001). A rescheduled order silently becomes **fee-free**, loses the "request" flag (skipping the owner's out-of-area decision) and loses "packed".
- **Fix:** copy all four; re-run the minimum-order/fee rules against the shop's *current* terms, or keep the snapshot deliberately and say so.

### DLV-013 — P1 — "Mark delivered" works with cash still outstanding
- The rider screen shows "Collect ₹N" above "Mark delivered" but both are tappable (`DeliveryConsole.tsx:688-698`); the server doesn't tie `DELIVERED` to payment. An order can be delivered and stay `UNPAID` forever with no flag for the owner.
- **Fix:** require "collected / paid another way / will pay later (reason)" before DONE, and show "delivered, cash outstanding" to the owner (feeds the cash card).

### DLV-014 — P1 — Daily limit of 5 orders blocks normal grocery use
- `enforce_customer_daily_appointment_limit` caps a customer at **5 non-cancelled appointments per day across all shops**, counting delivered/completed ones. A household ordering groceries, milk and medicine hits it; the error says "appointments … pick another date", meaningless for an ASAP order. The day boundary is `date_trunc('day', …)` in DB time (UTC), not IST.
- **Fix:** exempt (or raise sharply) for delivery/ASAP orders; IST-aware day; delivery-appropriate copy.

### DLV-015 — P1 — ASAP ignores opening hours and never expires
- Server: `appointment_create` only checks `is_open_now` (a manual flag); no working-hours check for ASAP. Client: the sheet offers ASAP at any time (the demo shop shows "Closed" yet ASAP works).
- A PENDING ASAP order the shop never answers sits forever (no timeout, reminder or auto-cancel), and if accepted hours later it still says "ASAP".
- Customers see **"Today at ASAP"** (`MyAppointments.tsx:352` builds `date at time`), owners see "Today, by H:MM".
- **Fix:** hide/disable ASAP outside hours (server-enforced), a response SLA (nudge owner at N min, auto-cancel at M with customer notice), consistent "ASAP · by H:MM" copy.

### DLV-016 — P0 — Solo-assignment Accept/Decline buttons do nothing
- `assign_delivery` writes a notification with `actions: [ACCEPT_DELIVERY, DECLINE_DELIVERY]` and metadata `deliveryId` — **no `batchId`**. `notifications/actions.ts:127-130,157-160` return immediately when `batchId` is missing, so both buttons are silent no-ops for every solo assignment. The console has no accept/decline for solo either, so a rider cannot refuse a single assignment (DLV R7 still true).
- **Fix:** solo accept/decline RPCs (or drop the buttons and make solo "assigned → start"), and surface a decline path in the console.

## 3. Rider flow

### DLV-017 — P0 — The rider can't call anyone and has no fallback at the door
- `my_deliveries` returns **no customer phone, no shop phone, no order contents, no notes, no requested window** (R2, R9 still true). Customer not answering the door → no call button. The only way past `ARRIVED` is the customer's 6-digit code (`HANDOFF_NOT_VERIFIED`); if the customer can't produce it (battery, elderly recipient, forwarded order) the only exit is "Can't deliver" (R3 still true).
- **Fix:** tap-to-call customer and shop (number masked/bridged if privacy requires), order summary + notes, a "customer unreachable → wait/call/leave-at-door with photo proof" path.

### DLV-018 — P1 — No pickup step
- Lifecycle is `ASSIGNED → EN_ROUTE → ARRIVED → DELIVERED`. There is no "picked up from shop" confirmation; the customer is told "out for delivery" at the first tap although the rider may still be travelling to the shop; routing ignores the shop (R5); the rider isn't shown what to collect.
- **Fix:** add `PICKED_UP` (with shop-side "handed to rider" confirm), notify customer at that point, route shop → stops.

### DLV-019 — P1 — Live tracking silently off or stale
- Declining the location disclosure sets `isTrackingRef=false` and nothing else (`DeliveryConsole.tsx:244-246`): no message, no retry; the rider continues and the owner sees no marker.
- Leaving `/delivery` (e.g. to chat) runs `backgroundLocation.stop()` on unmount (line 262) although deliveries are active (R6 still true).
- Position write failures are swallowed (251, 255); positions have **no timestamp** (`appointment_deliveries`/`delivery_batches` have no `position_at`), `update_delivery_position` ignores `accuracy`/`heading`, so a dead phone leaves a confident, stale marker.
- **Fix:** persistent "location sharing off — tap to fix" banner, tracking owned by an app-level provider not the screen, `position_at` + "updated N min ago / lost" on the owner board.

### DLV-020 — P1 — Reassigning a batched delivery leaves the old run open
- `assign_delivery` clears `batch_id`/`stop_order` on reassignment but never closes or updates the old `delivery_batches` row (D1 still true). Old run can stay `ACCEPTED/IN_PROGRESS` with no stops, keeping the previous rider "on duty" with blockers.

### DLV-021 — P1 — `assign_delivery` has no eligibility checks
- It checks scope and team membership only. It will assign a delivery for a **store-visit** appointment, a **cancelled**, **completed** or already **delivered** one, notifying a rider about a non-order (D10 still true). `assign_delivery_batch` does validate, and a concurrent double-assign hits the `appointment_deliveries_one_active` unique index and surfaces as a raw "duplicate key" error (D7).

### DLV-022 — P0 — The delivery status machine is not enforced
- `appointment_update_delivery_status` allows any non-terminal → any status: `ASSIGNED → ARRIVED` or `→ DONE` skips EN_ROUTE (customer never gets "on the way"); `confirm_handoff` has **no status check**, so a code can be verified while merely `ASSIGNED`, after which `DONE` is accepted from `ASSIGNED`. A rider (or a buggy client) can complete a delivery without moving.
- **Fix:** explicit transition table (`ASSIGNED→EN_ROUTE→ARRIVED→DELIVERED`, `PICKED_UP` once added), handoff only at `ARRIVED`, minimum-distance/elapsed checks as a soft signal.

### DLV-023 — P2 — `accept_delivery_batch` doesn't validate the stop order
- It silently ignores ids not in the batch and leaves unlisted stops with a null/old order; duplicates are accepted.

### DLV-024 — P2 — No offline resilience for rider actions
- Start / arrive / verify / collect / deliver are one attempt then a toast (`advance`, `verifyHandoff`, `collectCash`); nothing is queued, no optimistic state, no "last synced". Riders lose signal in lifts and basements.

### DLV-025 — P2 — Rider console is untranslated and has stray hard-coded colours
- ~38 hard-coded English strings incl. the header, every toast, the background-location notification (`DELIVERY_NOTICE`, line 45) and the disclosure body (line 383); `#fff` in `CantDeliverSheet.tsx:170,221`.

## 4. Owner (business) side

### DLV-026 — P0 — Shared tracking links are dead on the Android app
- `DeliveryTrackControl.tsx:54` and `BusinessDeliveries.tsx:325` build `${window.location.origin}/track/${token}`. In the Capacitor app that is `https://localhost`, so the link sent over WhatsApp opens nothing. `ShareCard.tsx:39` already documents and avoids exactly this (uses the production host).
- **Fix:** build from the configured public origin (reuse `share.ts`). One-line fix, both call sites.

### DLV-027 — P1 — A failed delivery has no order-level outcome
- `cancel_delivery` marks only the delivery row; the order stays `ACCEPTED`, stock stays reserved, nothing returns it to the shop for return/refund.
- The customer is always told **"Delivery delayed — arranging a new delivery"**, even when the reason was `CUSTOMER_REFUSED` or `CUSTOMER_UNAVAILABLE`, with no way to respond ("I'm home now").
- Only the business **owner** is notified (`v_owner_uid`), not team members with the `appointments` scope who actually run the shop.
- **Fix:** failure outcomes (re-attempt / return to shop / cancel + refund), reason-aware customer copy and a "I'm available now" action, notify everyone who can manage the order.

### DLV-028 — P1 — Owner live board gaps
- Map re-centres to the first agent every 12 s poll (`MapController` `panTo`, `BusinessDeliveries.tsx:27-36`), fighting any pan the owner makes.
- No late/idle alerts: nothing flags "assigned 20 min, rider hasn't started" or "EN_ROUTE past the promised ETA".
- Cancel reason/note not visible in "Recently finished" (D5); no customer phone (D4); full-list refetch every 12 s.

### DLV-029 — P2 — Revoking a rider doesn't touch in-flight deliveries
- Removing a team member's access leaves their assigned deliveries live; they keep the customer's name/address and can complete or hold them.

### DLV-030 — P2 — Dispatch list performance and navigation
- Each delivery card mounts `DeliveryAssignControl` with its own per-appointment query (D8, N+1); no direct link from the dispatch tab to the live board (D9; the new dashboard tile only helps from the dashboard).

### DLV-031 — P2 — `TeamMyDeliveries` mislabels and doesn't bound its list
- Lists **all** deliveries for the shop including history (unbounded) under "No active deliveries"; every row opens the console rather than that delivery.

## 5. Customer side

### DLV-032 — P1 — Customers can cancel at any point
- An `ACCEPTED` order can be cancelled by the customer after packing and while the rider is on the way, with no window, fee or warning (links to DLV-010).

### DLV-033 — P1 — No usable ETA after dispatch
- `my_delivery_progress.eta_text` is the owner's static free-text from accept time; once the rider is moving there is no live ETA and no "running late" state. (No live map is a deliberate, enforced product decision — but it makes an honest ETA more important, not less.)

### DLV-034 — P1 — Customer can't contact the shop or (before pickup) the rider
- The tracking card shows the rider's phone only when `EN_ROUTE/ARRIVED` and has no "call the shop" (T4 still true).

### DLV-035 — P2 — Public tracking page defects
- A **cancelled** delivery returns no row from `get_tracking` (it filters to non-cancelled), so the page says "**Tracking link has expired**" (T5 only fixed in the in-app card).
- The 15 s poll never stops after `DONE`, has no error handling (an offline `await` throws unhandled), and a second Supabase client is created at module level.
- Privacy: anyone holding the link (4 h) sees the rider's **full name and photo** (`u.name`, `u.avatar`) once EN_ROUTE and after delivery — links are routinely forwarded.
- Pulse animation uses hard-coded `rgba(22,163,74,…)`/`#fff`.

### DLV-036 — RETRACTED — "Duplicate notifications on delivery"
- This was wrong. `notify_on_appointment_status` has no branch for `COMPLETED`, so flipping the appointment to completed on delivery sends nothing; the customer gets only the delivery notification. Found while reading that function for DLV-015. Not a bug; no change made.

### DLV-037 — P3 — Delivery customer text is English-only
- `DeliveryTrackControl` labels, cancel reasons and notification card copy are hard-coded.

## 6. Security, privacy, operations

### DLV-038 — P2 — Rider position endpoints have no rate limit or plausibility check
- `update_delivery_position` / `update_delivery_batch_position` accept any coordinates at any rate from the assigned agent (cheap abuse and write amplification).

### DLV-039 — P2 — No delivery event timeline
- Only `created_at` and `delivered_at` exist; no `accepted_at/started_at/arrived_at/picked_up_at`. SLAs, dispute resolution ("rider says arrived") and honest averages are impossible; `business_delivery_stats.avg_minutes` (mine) measures *assignment → delivered*, including time the rider hadn't started.

### DLV-040 — P3 — Name vs alias inconsistency
- Notifications use `users.alias` for the rider, stats and owner views use `name`; with the alias system retired the wording is inconsistent ("Your courier" fallback when alias is empty).

### DLV-041 — P2 — Admin has no delivery visibility
- No admin tab for deliveries/cash/disputes; support cannot see a stuck delivery.

### DLV-042 — P2 — Test coverage is thin
- No component or integration tests for `DeliveryConsole`, `BusinessDeliveries`, `TrackingPage`, `DeliveryTrackControl`; the new RPCs have only a text-level migration test. No database-level tests of the transition rules, cancel cascade or cash flows.

### DLV-043 — P1 — Delivery funnel is not instrumented
- Only `booking_created` carries a `fulfillment` field. No events for order placed → accepted → packed → assigned → picked up → delivered / failed, so conversion, time-to-accept and failure rate can't be measured in production.

## 7. Previously logged items re-verified against today's code

| Old id | Status now |
|---|---|
| R1 NewRunGate hijack | **Fixed** (gate only when no active work, `DeliveryConsole.tsx:363-389`) |
| R2 no phones | **Open** → DLV-017 |
| R3 handoff deadlock | **Open** → DLV-017 |
| R4 two-step completion | **Open** (verify, then a second "Mark delivered" tap) — P3 |
| R5 route ignores shop | **Open** → DLV-018 |
| R6 unmount stops GPS | **Open** → DLV-019 |
| R7 solo decline | **Open** → DLV-016 |
| R8 GPS timeout | **Partly fixed** (2.5 s, still blocks each action) |
| R9 notes/items stripped | **Open** → DLV-017 |
| R10 batch emergency exit | **Open** (cancel is per stop) |
| R11 console ejection after last delivery | **Open** (`RequireDeliveryAgent`) |
| R12 hard-coded copy | **Open** → DLV-025 |
| D1 reassign corrupts batch | **Open** → DLV-020 |
| D2 polyline spiderweb | **Fixed** (route only with one agent selected) |
| D3 no batch realtime | **Fixed by polling** (12 s) — see DLV-028 for the cost |
| D4 no customer phone | **Open** → DLV-017/028 |
| D5 cancel reason hidden | **Open** → DLV-028 |
| D6 `delivery_batches` RLS vs scope | **Open** (policy checks `delivery` only; mitigated because the board reads via RPC) — P3 |
| D7 raw batch error | **Open** → DLV-021 |
| D8 N+1 | **Open** → DLV-030 |
| D9 navigation dead end | **Open** → DLV-030 |
| D10 assign eligibility | **Open** → DLV-021 |
| D11 / T6 hard-coded `#fff` | **Partly** (3 left: `CantDeliverSheet`, `TrackingPage`) |
| T1 no polling in track control | **Fixed** (12 s + focus) |
| T2 no token sharing | **Fixed**, but see DLV-026 (dead link on Android) |
| T3 premature "On the way" | **Fixed** for deliveries |
| T4 can't contact shop | **Open** → DLV-034 |
| T5 cancelled vanishes | **Fixed in-app**, **open on public page** → DLV-035 |
| DLV-009 no queue of unassigned orders | **Fixed** by 20261001 (once applied) |

## 8. Suggested order to reach production grade

1. **Correctness first (all P0):** DLV-010, 011, 016, 022, 026, 017 (calls + door fallback). These are money/safety/dead-flow.
2. **Trust and operations (P1):** 012, 013, 014, 015, 018, 019, 020, 021, 027, 028, 032–034, 043.
3. **Scale and polish (P2/P3):** the remainder, plus translations, tests (DLV-042) and admin visibility (DLV-041).
4. **Before turning delivery on in production:** apply migration `20261001`, run a real-device pass (screen-locked GPS, offline, cash, cancel-mid-delivery), finish the Play declarations, and keep `VITE_DELIVERY_AGENT_ENABLED` unset until then.

## 9. What is already solid (keep)
Server-side handoff rate limit, one-active-delivery unique index, cancel-delivery flow with reasons (rider and business), multi-run position fan-out, duty gating with visible blockers, customer-side location privacy enforced in SQL, owner dispatch board with reassign/cancel, tracking-token reuse, fee/minimum/free-above rules enforced server-side (20261001).

## 10. Fix status (2026-10-19)

Fixed **in code**, with tests; the database halves live in `supabase/migrations/20261002_delivery_integrity.sql` (rollback in `supabase/rollbacks/`) and **only take effect once that migration — and `20261001` before it — is applied**. Nothing here has run against a live database.

| Id | State | What changed |
|---|---|---|
| DLV-010 | Fixed (needs 20261002) | Trigger cancels an order's live delivery and tells the rider; a customer can't cancel or reschedule once the rider is on the way (`DELIVERY_IN_PROGRESS`); rider steps and cash collection refuse a non-accepted order (`ORDER_NOT_ACTIVE`); the console says "order cancelled" and refreshes. |
| DLV-011 | Fixed (needs 20261002) | Claims are goods + delivery fee; a lower amount is honoured only for a real deposit; the rider collects `total − paid`; settlement sums `cash_collected_amount`; nothing is shown as due while a claim awaits confirmation. |
| DLV-012 | Fixed (needs 20261002) | Reschedule copies the fee and out-of-area flag. |
| DLV-016 | Fixed (needs 20261002 for the decline) | Notification Accept opens the console, Decline calls `decline_solo_delivery`; the console has a two-tap "Decline this delivery" on a not-yet-started single delivery. The test that asserted the dead behaviour was replaced. |
| DLV-017 | **Partly** fixed (needs 20261002) | Rider gets tap-to-call for the customer (once on the way) and the shop, the item list, notes and requested window, and "can't reach them" guidance. **Still open:** a proof-of-delivery alternative to the code (photo / leave-at-door) — a product decision. |
| DLV-020, 021 | Fixed (needs 20261002) | Reassigning closes an emptied run; assignment requires an accepted home-delivery order. |
| DLV-022 | Fixed (needs 20261002) | Enforced `ASSIGNED → EN_ROUTE → ARRIVED → DELIVERED`; a handoff code only counts while EN_ROUTE/ARRIVED. |
| DLV-026 | Fixed (client only, live once deployed) | `trackingUrl()` builds links from the public host; both call sites use it. |

Still open: DLV-013–015, 018, 019, 023–025, 027–043 (see §2–§6).

## 11. Fix status, second round (2026-10-19)

Fixed in code with tests. Database halves are in `supabase/migrations/20261003_delivery_operations.sql` (rollback alongside) and need **20261001 → 20261002 → 20261003 applied in that order** before they take effect; nothing here has run against a live database.

| Id | State | What changed |
|---|---|---|
| DLV-013 | Fixed (needs 20261003) | "Mark delivered" with money owed needs a deliberate second tap; the amount is recorded as `cash_outstanding_amount`, listed on the owner's Deliveries tab ("Delivered but not paid") and clearable with "Mark received". |
| DLV-014 | Fixed (needs 20261003) | Delivery orders no longer count towards the daily limit; the day is the IST day. |
| DLV-015 | **Mostly** fixed (needs 20261003) | ASAP is only offered while the shop is open (client); unanswered ASAP orders get the shop nudged at 10 min and are cancelled at 30 (cron); customers see "ASAP · by H:MM" and a "still waiting" note after 15 min; owners see "Waiting N min". **Not done:** the server does not validate opening hours — it can't parse the free-text hours — so a modified client could still place an ASAP order outside hours (it would then expire unanswered). |
| DLV-018 | Fixed (needs 20261002 + 20261003) | A real pick-up step: "Picked up from shop" (with navigation to the shop) before "Start"; the server refuses to start without it (`NOT_PICKED_UP`); the customer is told when it's picked up; a run is picked up once for all its stops. |
| DLV-019 | Fixed (needs 20261003) | Location sharing now lives in an app-level runner, so leaving the console no longer stops it; a declined prompt, a lost signal or an unreachable server shows a banner with a "Turn on" button; positions carry a time and the owner sees "location updated N min ago / lost". |
| DLV-023 | Fixed (needs 20261003) | Accepting a run needs a complete, duplicate-free stop order. |
| DLV-024 | **Partly** fixed | Network failures are retried (status steps, handoff) and an offline banner shows. **Not done:** no persistent offline queue — an action attempted fully offline fails with a message and must be repeated. |
| DLV-025, 037 | Fixed | Rider console, customer tracking card, public tracking page and the new owner copy are translated (en/hi/mr, ~240 strings); `#fff` removed. Hindi/Marathi are machine drafts awaiting native review, like the rest of the app. |
| DLV-027 | Fixed (needs 20261003) | Reason-aware customer messages, an "I'm ready now" action (notification + tracking card), and every manager — not only the owner — is notified of failures and declines. |
| DLV-028 | Fixed | Map no longer re-centres every refresh; health lines (not picked up, not started, location stale/lost, at the door); cancel reason shown; polling pauses when hidden. |
| DLV-029 | Fixed (needs 20261003) | Ending a rider's access takes back their unstarted deliveries and warns the shop about any still out. |
| DLV-030, 031 | Fixed | One query for all dispatch cards; a "Live board" link; "My deliveries" lists live first and caps history. |
| DLV-032 | Resolved by DLV-010 | Customer cancel is blocked once the rider is on the way; cancelling before that (even after packing) is allowed by design. |
| DLV-033, 034 | Fixed (needs 20261003) | The server computes "about N min away" from the rider's fresh position and returns only the number; the shop's phone is on the tracking card. |
| DLV-035 | Fixed (needs 20261003) | A cancelled delivery shows as cancelled; the link shows only the rider's first name and no photo; polling stops when the delivery ends and survives going offline; one anonymous client with no session storage. |
| DLV-036 | Retracted | Was not a bug (see above). |
| DLV-038, 039 | Fixed (needs 20261003) | Position writes limited to one per 2 s; `picked_up_at`, `started_at`, `arrived_at` recorded; the average delivery time now runs from the rider setting off. |
| DLV-040 | **Partly** fixed | New and rewritten delivery notifications name people by first name. Older notification functions elsewhere still use the alias. |
| DLV-041 | Fixed (needs 20261003) | Admin → Deliveries: counts, cash, and the deliveries that need attention. |
| DLV-042 | Improved | +~70 tests (retry, tracking store, health rules, service methods, friendly errors, migration contracts incl. rollbacks). Still no component/integration tests for the screens and none against a real database. |
| DLV-043 | Fixed (needs 20261003) | Ten delivery funnel events in the whitelist and sent (categorical props only). |
| R4, R6, R8, R10, R11 | Fixed | One-step completion after the code; tracking survives navigation; status taps use the watcher's last fix; whole-run emergency exit; the console stays open for the session after the last delivery. |
| D5, D6, D7, D8, D9, T4, T5 | Fixed | Cancel reason visible; runs readable by `appointments` staff (needs 20261003); friendly assignment errors; N+1 removed; board link; shop phone; cancelled state. |

**Still open**
- **DLV-017 remainder:** a proof-of-delivery alternative to the customer's code (photo / leave-at-door). Product decision.
- **Server-side opening-hours check for ASAP** (see DLV-015).
- **A persistent offline action queue** (see DLV-024).
- **Live-share overlap:** the background location watcher is one process-wide singleton shared with My People live share; a rider who also live-shares has one replace the other. Documented in `DeliveryTrackingRunner.tsx`, not solved.
- **Real-device verification** of everything that touches GPS, background services, push and the database.

## 12. Fix status, third round (2026-10-20)

Migrations 20261001–20261003 are **applied in production** (verified by catalog markers; recorded in `supabase/APPLY_LOG.md` rows 64–66). Delivery is still dark in production builds: `VITE_DELIVERY_AGENT_ENABLED` is unset for the Play build.

| Item | Status | What changed |
|---|---|---|
| DLV-015 (hours) | Fixed (needs **20261004**) | `appointment_create` refuses ASAP with `SHOP_CLOSED` when the shop is closed — same precedence as the order sheet (manual "open until", then the owner's switch, then posted hours, India time). Hours the server can't read count as open. Reads the v2 JSON format, the old `Mon–Sat from … to …` pattern and `Open 24×7`; the oldest per-day list isn't read (fails open). The hours functions were run against Postgres (26 cases, staging `pg_temp`). |
| DLV-017 remainder (proof of delivery) | Fixed (needs **20261004**) | Shop opt-in (`businesses.delivery_proof_allowed`, off by default; checkbox in delivery terms). Rider, after arriving and waiting 5 minutes, on a **prepaid** order, takes a photo → `delivery_record_proof` → the normal "delivered" step accepts the photo in place of the code. The photo must be in the rider's own `uploads/<uid>/delivery-proof/` folder. Customer's notification reads "left at your door" and shows the photo (`delivery_proof`: rider always; customer and shop managers once delivered). |
| DLV-024 | Fixed (client only) | Persistent outbox (`src/lib/actionQueue.ts`, `riderQueue.ts`): pick-up, on-the-way, arrived, delivered and cash-collected taps made with no signal are kept in order, survive an app restart, replay when the connection returns (online / app focus / every 20 s) even if the rider has left the console. "Already in that state" counts as done; a refusal is dropped and reported. The card is held while its tap waits; a banner counts what's waiting. **Not queued by design:** the handoff code (the server must answer it) and position fixes. |
| Live-share overlap | Fixed (client only) | `backgroundLocation` is now one watcher with named owners (`live-share`, `delivery`): each has its own callback and throttle, the watcher stops with the last owner, a joining owner gets a fresh fix at once, and while both run the notification describes live share (the use declared to Play). |
| DLV-042 | Improved | +~60 tests: outbox, owners of the watcher, hours/proof migration contracts incl. rollback, proof service methods, and a render test of the rider's leave-at-door card (server-rendered with stubbed hooks — there is no jsdom/testing-library in this repo, and none was added). Still none against a real database, and no interaction tests for whole screens. |

**Still open**
- **Apply `supabase/migrations/20261004_delivery_followups.sql`** (rollback alongside). Until then the client degrades safely: `delivery_proof` is only called for an arrived delivery, an unknown RPC returns an error the card swallows (no card shown), and ASAP simply isn't refused server-side.
- **Real-device verification** of everything that touches GPS, background services, camera, push and the database. Nothing in this log has been exercised on a phone.
- **Hindi/Marathi** strings are machine-quality and not natively reviewed (explicitly out of scope).
- DLV-040: older, non-delivery notification functions elsewhere still name people by alias.
- `supabase_migrations.schema_migrations` lags the real state (only to 20260998); the nightly drift check will report 20260999–20261003 until it's repaired — see `supabase/APPLY_LOG.md`.
