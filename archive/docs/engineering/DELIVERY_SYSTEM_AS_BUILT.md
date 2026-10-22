# STRYT home delivery — how it actually works (as built)

*Written 2026-10-22 from the code and from the live production database. Nothing here is a plan or an intention: every statement was read from a source file or from a function/table definition queried from production (`gnswxlfmcwyhmzlfipql`) that day. Where the repo and production could differ, production wins and the file is named so you can compare.*

**How to read this.** Part 1 is the headline finding. Part 2 is the data model. Part 3 walks one order from the first tap to the end, one action at a time (who taps what → which function runs → what changes in the database → who is notified → what each person then sees). Part 4 is "who sees what, on which screen". Part 5 lists every defect found while reading, with evidence. Part 6 lists what was not verified.

Conventions: `RPC` = a Postgres function the app calls. "Owner" = the shop owner or a team member holding the `appointments` scope (the code treats them the same through `has_business_scope`). "Rider" = a user with a `business_access_sessions` row carrying the `delivery` scope (or the owner delivering personally).

---

## Part 1 — Why an order vanishes after "Mark packed" (and what else breaks the same way)

### What was reported
After the owner taps **Mark packed**, the order disappears from the customer's screen and from the business's screen, and the delivery cannot be continued.

### What "Mark packed" really does (production definition of `mark_order_ready`)
It does exactly two things and nothing else:
1. `update appointments set ready_at = now()` (only if the order is `ACCEPTED`; if `ready_at` is already set it returns quietly).
2. Inserts one notification for the customer ("Your order is packed" / "…ready for pickup").

It never touches `status`. So **Mark packed itself cannot make an order disappear.** The timing is a coincidence of a different, time-based job.

### What actually removes the order: `sweep_my_appointments()`
Production definition (identical to `supabase/migrations/20260824_booking_and_rpc_security.sql`, never changed since):

```sql
update appointments set status = 'CANCELLED', cancelled_by = 'SYSTEM', response_note = coalesce(response_note,'business not responded')
 where status = 'PENDING' and scheduled_for <= now()
   and (customer_user_id = me or target_owner_user_id = me or (target_type='BUSINESS' and has_business_access(target_id, me)));

update appointments set status = 'COMPLETED'
 where status = 'ACCEPTED' and scheduled_for <= now()
   and (customer_user_id = me or target_owner_user_id = me or (target_type='BUSINESS' and has_business_access(target_id, me)));
```

* It is called by the app on the first list read of a session and then at most every 2 minutes (`src/services/engagement/appointmentService.ts:145-154`, `sweepRemoteAppointments`), by **either** the customer's app **or** the owner's/team's app — whoever opens a list first.
* It has **no condition on `fulfillment_type`, on `ready_at`, or on whether a delivery exists.** It was written for time-slot bookings, where "the slot has passed" means "it happened".
* A delivery order is not a slot booking. An **ASAP** order is created with `scheduled_for = now + prep time + 1 minute` (`appointment_create`, 20261001). With the shop's prep time, that is only minutes away. The moment that time passes, the next sweep (from either side) turns an `ACCEPTED` order into **`COMPLETED`**, and an unanswered `PENDING` one into **`CANCELLED` ("business not responded")** — long before any rider has been involved.

### Evidence from production (the test shop, 2026-10-22)
| Order | Type | `ready_at` | `status` now | deliveries rows |
|---|---|---|---|---|
| `apt_9d95…` | DELIVERY, ASAP, ₹115 + ₹30 fee | never packed | **COMPLETED** | **0** |
| `apt_fb63…` | DELIVERY, ASAP, ₹115 + ₹30 fee | 14:27:13 (packed) | **COMPLETED** | **0** |

Both are `COMPLETED` with no delivery ever created. Nobody delivered anything; the clock did it.

*How this was established.* There is no audit log of status changes, so it is shown by elimination. A search of every production function that mentions both `appointments` and `COMPLETED` finds exactly two that set an appointment to `COMPLETED`: `sweep_my_appointments` (by time) and `tg_complete_appointment_on_delivery` (only when a delivery becomes `DELIVERED`). Neither order has a delivery row, so the second cannot have fired. The app itself changes order status only through RPCs (`appointment_transition` cannot produce `COMPLETED`), although the row-security policy `appt_update` would also let an owner's client write the column directly; no code in the app does that.

### Why that makes the order "disappear" for everyone
* **Owner → Upcoming tab:** the list only keeps `PENDING/ACCEPTED` orders whose `scheduled_for` is still in the future (`BusinessAppointments.tsx:653-655`). An ASAP order is out of that list as soon as its few minutes pass, even before the sweep.
* **Owner → Deliveries tab** still lists `ACCEPTED` and `COMPLETED` delivery orders (`:669-670`), but every action on a swept order is refused by the database: `assign_delivery` and `assign_delivery_batch` require `ACCEPTED` (`ORDER_NOT_ACCEPTED` / `SOME_APPOINTMENTS_NOT_ELIGIBLE`), and `business_delivery_queue` (the "waiting for a rider" list) filters on `status = 'ACCEPTED'`, so it silently drops out of "Waiting for a rider".
* **Rider:** `delivery_mark_picked_up`, `appointment_update_delivery_status` and `delivery_collect_cash` all raise `ORDER_NOT_ACTIVE` unless the order is `ACCEPTED`, so a swept order can never be picked up, started, collected or delivered.
* **Customer:** the order moves to the history side and shows "Completed" without ever having arrived. **No notification is sent for `COMPLETED`** (`notify_on_appointment_status` has no branch for it), so it is silent.

### The same sweep breaks two other things
1. **ASAP expiry is not 30 minutes.** `expire_stale_asap_orders` (cron, every minute) cancels an unanswered ASAP order after 30 minutes, and `nudge_pending_asap_orders` tells the shop at 10 minutes "it expires in 20 minutes". But the sweep cancels the same `PENDING` order as soon as `scheduled_for` (prep + 1 minute) passes. The promised 20-minute window does not exist.
2. **Late deliveries are completed by the clock.** Even a normal *scheduled* delivery that is simply running late is flipped to `COMPLETED` once its slot time passes, and then can't be delivered.

The design note in `20260879_complete_appointment_on_delivery.sql` says delivery orders should be completed "by the delivery rather than the clock" — but it only added the trigger for the DELIVERED case and left the clock path (`sweep_my_appointments`) untouched.

### What fixing it needs (not done — this document only records)
`sweep_my_appointments` must not complete or cancel delivery orders by time (`fulfillment_type = 'DELIVERY'` should be excluded from both updates, or ASAP given a separate, longer rule), and the client-side copy `localHousekeeping` in `appointmentService.ts:178-195` has the same blind spot for local records. The owner's "Upcoming" filter should also keep an accepted, not-yet-delivered delivery order visible after its scheduled time.

---

## Part 2 — Data model (production, 2026-10-22)

### `appointments` (an order is an appointment) — delivery-relevant columns
`id`, `target_type` (`BUSINESS`/`PROVIDER`), `target_id`, `target_owner_user_id`, `customer_user_id`, `customer_name`, `scheduled_for` (NOT NULL), `date_label`, `time_label`, `notes`, `package_id/name/price`, `status`, `response_note`, `payment_method`, `payment_status` (default `UNPAID`), `payment_amount`, `payment_reference`, `cancelled_by`, `is_walk_in`, `fulfillment_type` (`IN_STORE`|`DELIVERY`, default `IN_STORE`), `delivery_address_line`, `delivery_lat`, `delivery_lng`, `requested_delivery_window`, `delivery_eta_text`, `party_size`, `is_out_of_range`, **`delivery_fee`** (integer, snapshot at order time), **`is_asap`**, **`ready_at`** ("packed"), **`cash_collected_at`**, **`cash_settled_at`**, `cash_collected_amount`, `cash_outstanding_amount`, `nudged_at`.
* `status` is constrained to `PENDING, ACCEPTED, REJECTED, COMPLETED, CANCELLED, NO_SHOW`. `cancelled_by` ∈ `CUSTOMER, OWNER, SYSTEM`.
* Line items live in `appointment_items` (`appointment_id, catalog_item_id, item_name, unit_price, quantity`).

### `appointment_deliveries` (one physical delivery attempt for an order)
`id` (`del_…`), `appointment_id` → appointments (cascade), `business_id`, `agent_user_id` (the rider; set null if the user is deleted), `status`, `handoff_code` (6 digits), `handoff_verified`, `lat/lng/heading/position_at` (rider position), `live_status`, `batch_id`, `stop_order`, `created_at`, `picked_up_at`, `started_at`, `arrived_at`, `delivered_at`, `cancelled_at/cancelled_by/cancel_reason/cancel_note`, `proof_photo_url/proof_note/proof_at`.
* `status` ∈ `ASSIGNED, EN_ROUTE, ARRIVED, DELIVERED, CANCELLED`. `live_status` ∈ `LEAVING, ON_THE_WAY, ARRIVED, DONE` (or null).
* `cancel_reason` ∈ `CUSTOMER_UNAVAILABLE, ADDRESS_PROBLEM, CUSTOMER_REFUSED, UNSAFE, AGENT_EMERGENCY, OTHER, ORDER_CANCELLED`; `cancelled_by` ∈ `AGENT, BUSINESS, SYSTEM`.
* **One live delivery per order:** a unique index allows only one row per `appointment_id` while its status is `ASSIGNED/EN_ROUTE/ARRIVED`.

### `delivery_batches` (a "run": several stops for one rider)
`id` (`batch_…`), `business_id`, `agent_user_id`, `status` (`PENDING_ACCEPTANCE` default, `ACCEPTED, DECLINED, IN_PROGRESS, COMPLETED, CANCELLED`), `lat/lng/accuracy/heading/position_at`, `accepted_at`, `completed_at`.

### Others
* `delivery_agent_duty (user_id, on_duty default true, updated_at)` — the rider's on/off duty switch (no row means on duty).
* `tracking_tokens (id uuid, agreement_id, appointment_id, expires_at)` — share-link tokens; **0 policies**, reachable only through the RPCs below.
* `handoff_attempts (delivery_id, fail_count, last_attempt_at, locked_until)` — wrong-code throttle.
* On `businesses`: `delivery_enabled`, `delivery_radius_km`, `delivery_fee`, `free_delivery_above`, `min_order_amount`, `delivery_prep_min` (default 20), `delivery_proof_allowed`, `delivery_time`, `broadcast_radius`, `is_open_now`, `is_available_now`, `available_until`, `hours`.

### Access rules (row security, production)
* `appointments`: select = the customer, the target owner, or anyone with the `appointments` scope on that business; insert = only as yourself (`customer_user_id = auth.uid()`); update = owner or `appointments` scope. (Rider-only users cannot read appointments directly; they get data through `my_deliveries`.)
* `appointment_deliveries`: select = `delivery` scope, `appointments` scope, or being the assigned rider. No insert/update policy — **all writes go through the RPCs.**
* `delivery_batches`: select = the rider, or `delivery`/`appointments` scope. `delivery_agent_duty`: select = yourself or a manager of a business you ride for.
* `has_business_scope(business, user, scope)` is true for the owner, or for an `ACTIVE`, unexpired `business_access_sessions` row whose `access_level = 'FULL'` or whose `scopes` contains the scope. `has_business_access` is the same without a scope.
* **Realtime:** the `supabase_realtime` publication contains `appointments` and `notifications` only. `appointment_deliveries` and `delivery_batches` are **not** published, so changes to a delivery (assigned, en route, arrived) do not arrive by push; the screens have to re-query.

### Triggers
| On | Trigger → function | Does |
|---|---|---|
| `appointments` | `trg_enforce_slot_capacity` (before insert/update) | blocked slots, party size, per-timestamp capacity, business-wide ceiling |
| `appointments` | `trg_customer_daily_appointment_limit` | max 5 non-delivery bookings per customer per IST day (delivery orders are exempt) |
| `appointments` | `trg_notify_appointment_created` | notifies the owner "New booking request" |
| `appointments` | `trg_notify_appointment_status` | customer/owner notifications on ACCEPTED, REJECTED, NO_SHOW, CANCELLED, payment changes. **Nothing for COMPLETED.** |
| `appointments` | `trg_cancel_delivery_on_order_cancel` (after update of status) | order CANCELLED/REJECTED → cancels any live delivery, closes an empty run, tells the rider "Order cancelled — don't deliver" |
| `appointment_deliveries` | `trg_complete_appointment_on_delivery` | delivery becomes DELIVERED → the order (DELIVERY type, PENDING/ACCEPTED) becomes COMPLETED |
| `appointment_deliveries` | `trg_delivery_batch_in_progress` | first non-ASSIGNED status in an ACCEPTED run → run becomes IN_PROGRESS |
| `business_access_sessions` | `tg_unassign_deliveries_on_access_end` | rider's access revoked/expired/denied → not-started deliveries are deleted (back to dispatch), started ones stay, managers notified |
| `notifications` | `trg_push_on_notification` | sends the push notification for every inserted notification |

### Scheduled jobs (`cron.job`, production)
`nudge-pending-asap-orders` (every minute), `expire-stale-asap-orders` (every minute), plus unrelated ones. **`sweep_my_appointments` is not a cron job; it runs only when someone's app calls it.**

---

## Part 3 — One order, action by action

Format of each step: **Who taps what** → code path → what changes in the database → who is told → what each person then sees → what the server refuses.

The feature flag `DELIVERY_AGENT_ENABLED` (`src/lib/features.ts`) gates every delivery screen. It is `VITE_DELIVERY_AGENT_ENABLED === "true"` at build time; the web build has it on since 2026-10-22, the Android builds only once the workflow change is pushed.

### 3.0 Setup (before any order)

**A. Owner turns delivery on** — *Manage → Settings → Home delivery* (`BusinessSettings.tsx`, section `bset_home_delivery`).
* Toggle "Offer delivery" → `businessService.update(id, { deliveryEnabled })`. With the flag off the hint reads "Coming soon…" but the value still saves.
* With it on, `DeliveryTermsEditor` appears (plus a free-text "typical delivery time", stored in `businesses.delivery_time`).
* Terms editor fields and limits (UI mirrors the database CHECK `businesses_delivery_terms_check`): radius = *follow shop reach* or 1/2/3/5/8/10/15 km (DB allows 0 < r ≤ 100); fee ₹0–5000; "free above" ₹ (blank = never free); minimum order ₹0–100000; prep minutes 0–240 (default 20); checkbox "Allow leaving paid orders at the door" (`delivery_proof_allowed`).
* **Save terms** sends all six fields in one `businessService.update`. If the database lacks any one of those columns the whole save fails (this is exactly what happened with `delivery_proof_allowed` before migration 20261004 was applied).
* Effect: from the next time a customer opens the shop, `BusinessDetail` passes `deliveryEnabled`, the terms (`termsFromBusiness`), the shop's lat/lng and reach, and whether it is open now to the order sheet.

**B. Owner adds a rider** — *Add team members & manage access* (`BusinessAccess.tsx`): enter the person's mobile / email / username, choose the **Delivery rider** preset (scope `delivery`) → `grant_team_member_access(business, identifier, scopes)`. The person must already have an account. Only offered when the flag is on (`ALL_SCOPES` / presets are built from the flag).
* The rider then appears in `deliveryService.deliveryTeam` (the owner's `ACTIVE` sessions, plus "Me (deliver myself)" for the owner). **Any** active team member is offered in the picker, not only those with the `delivery` scope; `assign_delivery` only requires `has_business_access`.
* In the rider's own app the **Delivery** hat is offered when the flag is on and they hold an `ACTIVE` session whose scopes include `delivery`, or have an active delivery (`useAccountOptions.ts`). The `/delivery` route is guarded by `RequireDeliveryAgent` (flag + that scope or an active assignment; once let in during a session they stay in).
* If the rider's access is later revoked/expired/denied, trigger `tg_unassign_deliveries_on_access_end` deletes their not-yet-started deliveries (the orders return to "waiting for a rider"), leaves started ones with them, and tells every manager.

### 3.1 Customer places the order

**Taps:** shop page → *ADD* on items (cart stepper; not shown to guests, to the owner, or for the medical theme) → the cart bar → **How would you like this?** (`CartCheckoutSheet`).
* **Buy in place** — pay now by UPI/cash; creates an in-store order through `appointment_create_walk_in_payment` (not a delivery).
* **Home delivery** *(new, 2026-10-22 — in the working tree, not yet deployed; only shown when the flag is on and the shop offers delivery)* — opens the order sheet with delivery already chosen.
* **Book for another time** — opens the order sheet; inside it **How would you like this? → Visit the store | Home delivery** (`AppointmentSheet.tsx:657`). The delivery choice only exists when `DELIVERY_AGENT_ENABLED && targetType === "BUSINESS" && shop.deliveryEnabled`.

**Order sheet (client):**
* Timing: **As soon as possible** (default, only when the shop is open now; label shows "About N min" = prep + travel allowance) or **Pick a time** (slot grid). A reschedule is always a slot.
* Address: prefilled from the customer's profile (`user.area`, `user.lat/lng`), editable by search, pin on a map, or "Re-detect my location". Both a text line (> 2 characters) and a pin are required for delivery.
* It shows: delivery fee line, "Add ₹X more for free delivery", minimum-order block ("Add ₹X more to get this delivered (minimum ₹Y)"), an "outside the shop's usual delivery area" notice (the order can still be sent as a request), and "Total with delivery". These use `src/lib/deliveryTerms.ts`, which mirrors the server.
* Confirm → `appointmentService.create` → RPC `appointment_create`. ASAP sends placeholder times; the server computes the real time.

**Server — `appointment_create` (live definition), in order:** must be signed in; target type, fulfilment type valid; ASAP only for delivery; non-ASAP time must be in the future; delivery needs lat/lng; party size ≥ 1; the target exists; the shop is "accepting" (`is_open_now` ≠ false → else `NOT_ACCEPTING_APPOINTMENTS`); delivery needs `delivery_enabled` (`DELIVERY_NOT_OFFERED`); **ASAP needs the shop open** — a manual "open until" wins, then the owner's `is_available_now` switch, then posted hours via `hours_open_at` (unreadable hours count as open) → else `SHOP_CLOSED`; subtotal from line items (else package price); delivery: subtotal below minimum → `DELIVERY_MIN_ORDER`, fee = 0 if subtotal ≥ free-above else the flat fee; ASAP → `scheduled_for = now + prep + 1 minute` rounded to the minute, labels "Today"/"ASAP"; distance shop→drop-off (PostGIS) against the delivery radius (own radius, else shop reach, else 5 km) → beyond it, `is_out_of_range = true` (the order is still created as a request); customer name from profile.
* Inserts the appointment as **`PENDING`** with the fee snapshot (`delivery_fee`) and `is_asap`; inserts `appointment_items`; reserves stock for `FINITE` catalog items (`reserve_catalog_items`, `INSUFFICIENT_STOCK` if short).
* Triggers on insert: capacity (`enforce_slot_capacity`: blocked slots, party size, per-timestamp capacity for that item, business-wide ceiling — an out-of-range `PENDING` request does not consume capacity until accepted), daily limit (delivery orders are exempt), and `notify_on_appointment_created` → the owner gets **"New booking request"** (actions Accept/Decline, pill "New").
* Payment: if the shop's `payment_timing` is `AT_BOOKING` the sheet hands straight to the payment sheet (amount = package price + delivery fee, `PaymentSheet.tsx:27`); otherwise the order is `UNPAID` (to be paid in cash at the door or later).
* Customer then sees: toast "…delivery in about N min 🛵" (or "Request sent! The shop will confirm delivery to your address 📍" when out of range); the order in **My Appointments → Upcoming** with status **Pending**.

### 3.2 Owner accepts or declines

**Where:** push/notification, or *Manage → Bookings* (Upcoming tab: newest first; ASAP badge ⚡; "Waiting N min" badge while PENDING; amber "Out of radius" badge).
* **Accept** on a delivery order opens a sheet with distance from the shop, the address, the customer's requested window, and an **ETA** field (≤ 40 characters, placeholder from the shop's typical time, "Use '<typical>'" shortcut). **Confirm** → `appointment_accept_with_eta(id, eta)`: needs the `appointments` scope; order must be `PENDING` (else `INVALID_TRANSITION`); sets `status = ACCEPTED` and `delivery_eta_text` in one update.
  * If the shop collects payment at booking and it is not yet `PAID`, the Accept button is replaced by "Waiting for customer to pay" / "Verify the payment claim above".
  * Trigger `trg_notify_appointment_status` → customer: **"Booking confirmed ✓ … — arriving in <eta>."**
  * Accepting a previously out-of-range request re-runs the capacity check.
* **Decline** → `appointment_transition(REJECTED)`: customer notified "Booking declined" (+ note).
* The order is then `ACCEPTED`. Nothing else happens automatically: **no rider is assigned and nothing is packed by itself.**

### 3.3 Timers on a waiting ASAP order

* `nudge_pending_asap_orders` (cron, every minute): a `PENDING` ASAP order 10–30 minutes old that has not been nudged gets one notification to every manager: "An order is waiting for you … it expires in 20 minutes." (sets `nudged_at`).
* `expire_stale_asap_orders` (cron, every minute): `PENDING` ASAP orders older than 30 minutes → `CANCELLED`, `cancelled_by = SYSTEM`, note "The shop didn't respond in time" → customer notified "Booking auto-cancelled".
* `sweep_stale_appointment_holds`: `PENDING` orders older than 2 hours whose time is still in the future → cancelled (note "Hold expired"). Not a cron job: the app calls it opportunistically whenever any customer opens an order sheet (`bookedSlots` → `releaseStaleHolds`). For an ASAP order (time = a few minutes after creation) it can never match.
* **But** `sweep_my_appointments` (Part 1) cancels a `PENDING` order the moment its `scheduled_for` passes — for ASAP that is prep + 1 minute after the order — so the 10/20/30-minute messages describe a window that the sweep cuts short.

### 3.4 "Mark packed"

**Taps:** *Bookings → (order card) → Mark packed*. Visible only when the flag is on, the order is `ACCEPTED`, `ready_at` is empty, and it is a delivery order (or is in the waiting-for-rider list).
* `deliveryService.markOrderReady` → RPC `mark_order_ready`: needs `appointments` scope; order must be `ACCEPTED` (`ORDER_NOT_ACCEPTED`); if already packed returns true; else `ready_at = now()`; inserts a customer notification "Your order is packed" ("…has packed your order and is arranging a rider.", pill "Packed").
* Owner sees: toast "Marked packed — the customer was told", a green "✓ Packed" badge, the button disappears.
* **What it does not do:** it does not change the order status, does not assign a rider, and is not checked by `assign_delivery`, pickup or any later step (a rider can be assigned and can pick up before the shop marks it packed).
* **The customer app never reads `ready_at`** (it is only used on the owner's card): "packed" reaches the customer only as that notification.

### 3.5 Dispatch — assigning a rider

**Where:** *Bookings → Deliveries tab*. Top panels (`DeliveryOwnerPanels`): banner "N waiting for a rider" (from `business_delivery_queue`); "Delivered but not paid"; "Cash to collect from riders"; 30-day summary. Below: every delivery order with status `ACCEPTED` or `COMPLETED` (waiting ones first). Each card ends with `DeliveryAssignControl`.
* **Waiting list** = `business_delivery_queue`: delivery orders with `status = 'ACCEPTED'` and no delivery in `ASSIGNED/EN_ROUTE/ARRIVED/DELIVERED`, packed ones first.
* **Assign delivery (one order)** → pick a person (chips; off-duty people are tagged but still selectable; "Me (deliver myself)") → `assign_delivery(order, rider)`:
  * needs `appointments` scope; order must exist, be a delivery order (`NOT_A_DELIVERY_ORDER`) and be `ACCEPTED` (`ORDER_NOT_ACCEPTED`); the rider must have access to this business (`AGENT_NOT_TEAM_MEMBER`);
  * generates a random 6-digit handoff code; inserts a delivery row `ASSIGNED` (no run); the unique index refuses a second live delivery for the same order;
  * notifies the rider **"New delivery assigned"** (deep link `/delivery`, actions Accept/Decline);
  * the RPC result never contains the code (`handoff_code` is nulled before return; the column also has no read permission for logged-in users).
* **Reassign** (same control, shown while a delivery is `ASSIGNED/EN_ROUTE/ARRIVED`): the same RPC updates the existing live row to the new rider, `status = 'ASSIGNED'`, `handoff_verified = false`, a **new code**, run/stop cleared; an emptied old run is completed. (See defect D5: pickup/start/arrival timestamps are not reset.) The customer's already-shown code stops working.
* **Select multiple → run:** tick `ACCEPTED` orders → bar at the bottom → choose a rider → `assign_delivery_batch(order ids, rider)`: every order must be an accepted delivery order with no live delivery (else `SOME_APPOINTMENTS_NOT_ELIGIBLE`); creates a **run** (`PENDING_ACCEPTANCE`) and one `ASSIGNED` delivery per order, each with its own code; the rider gets "New delivery run".

### 3.6 Live board (owner)

*Deliveries tab → "Live board"* (`/business/:id/manage/deliveries`, `BusinessDeliveries.tsx`; also in the hub as "Live deliveries"): map (shop pin, each rider's last position, stops, route line for a single selected rider), per-rider filter chips, one row per active delivery with: status pill; address; **health line** (assigned > 10 min unpicked; picked up > 5 min not started; en route with no position for 2 min, stale > 2 min, lost > 10 min; at the door > 20 min); ETA promised; "Handoff verified ✓"; **Call agent**; **Drop-off** (opens a route); and, when the row is tapped open, **Assign/Reassign**, **Share tracking link**, **Cancel delivery**. "Recently finished" lists the last 25 with cancel reasons.
* Data: `business_active_deliveries(business)`; refresh: realtime subscription on `appointment_deliveries` (which is **not** in the realtime publication, so it never fires) plus a 12-second poll that only runs while at least one delivery is already active and the tab is visible.
* **Cancel delivery** (owner) → `cancel_delivery(id, reason, note)` as `BUSINESS`: delivery `CANCELLED`; the rider is told "Delivery cancelled"; the customer is told "Delivery delayed — … is arranging a new delivery". The order itself stays `ACCEPTED`.

### 3.7 The rider's side

**Seeing work.** The rider is told by the push/notification (deep link `/delivery`). In the console the list is `my_deliveries()`; refresh is pull-to-refresh, on every action, and on opening (the realtime subscription is on an unpublished table, see Part 2). Tabs: **Active** (EN_ROUTE/ARRIVED solos and accepted/in-progress runs), **Assigned** (ASSIGNED solos), **History**. A pending *run* takes over the whole screen until accepted or declined (unless the rider already has active work, then it is a banner).

**Duty.** A toggle "On duty / Off duty" (`get_delivery_duty` default on; `set_delivery_duty`). Going off duty is refused while any delivery is `ASSIGNED/EN_ROUTE/ARRIVED` or a run is open (the toggle disables itself and says how many). Going on duty prompts the battery-optimisation exemption. Duty is informational for owners — assignment does not check it.

**Accept / decline.**
* *Single delivery:* no acceptance step — "Accept" in the notification just opens the console. **Decline this delivery** (two taps) → `decline_solo_delivery`: only while `ASSIGNED` and not in a run; the row (and any wrong-code history) is deleted so the order is back in "waiting for a rider"; every manager is told "Delivery declined — please assign another rider".
* *Run:* all-or-nothing. **Accept all N** → `accept_delivery_batch(run, stop order)`: the app computes a nearest-neighbour order from the rider's position and sends it; the server checks it contains exactly the run's stops once each (`INVALID_STOP_ORDER`); run → `ACCEPTED`. **Decline** (two taps) → `decline_delivery_batch`: all the run's deliveries are deleted, run `DECLINED`, managers told "Your courier declined N deliveries — please reassign".

**Pick up.** Before anything can start the rider must confirm they have the order: **Picked up from shop** → `delivery_mark_picked_up`: delivery must be `ASSIGNED` and the order `ACCEPTED` (`ORDER_NOT_ACTIVE` otherwise); for a run the run must be `ACCEPTED/IN_PROGRESS`; stamps `picked_up_at` on **all** this rider's not-started stops in the run (or just this delivery) and tells each customer "Your order has been picked up". Shows the pick-up address and a navigate-to-shop button.

**Start.** **Start delivery** / **Start this stop** → `appointment_update_delivery_status(…, ON_THE_WAY, lat, lng)`: allowed from `ASSIGNED`/`EN_ROUTE`; from `ASSIGNED` requires `picked_up_at` (`NOT_PICKED_UP`); order must be `ACCEPTED`; run must be accepted; sets `status = EN_ROUTE`, `live_status`, position, `started_at`; first start flips an accepted run to `IN_PROGRESS`; customer notified **"Your order is out for delivery 🛵"** with the rider's first name, phone, **the handoff code**, and track/call actions.
* Location sharing starts automatically (`DeliveryTrackingRunner`) when the rider has any `EN_ROUTE/ARRIVED` solo or an `ACCEPTED/IN_PROGRESS` run: first-time disclosure dialog for background location, then a background watcher that writes each fix with `update_delivery_position` (solo; at most one write per 2 s) or `update_delivery_batch_position` (run). Banners: permission declined, "no location for a while" (> 90 s with no fix), "can't reach the server" (3 failed sends). Past positions are not stored, only the latest.

**Arrive.** **I've arrived** → `…(ARRIVED)`: allowed from `EN_ROUTE`/`ARRIVED`; `status = ARRIVED`, `arrived_at`; customer notified **"Courier has arrived! … Share OTP <code> to receive your order."**

**Hand over — the code.** The customer shows the 6-digit code (their tracker card shows it while `EN_ROUTE/ARRIVED` and not yet verified). Rider types it → `confirm_handoff(delivery, code)`: only while `EN_ROUTE/ARRIVED`; correct → `handoff_verified = true` (and `EN_ROUTE → ARRIVED`), attempts cleared; wrong → counted; **5 wrong within 15 minutes locks that delivery for 15 minutes**.
* After a correct code the app finishes by itself when nothing is owed (`DONE`); if money is owed it shows **Collect ₹N cash** first.

**Money at the door.** **Collect ₹N cash** → `delivery_collect_cash`: delivery `EN_ROUTE/ARRIVED`; order `ACCEPTED`; refused if the customer's own payment claim is waiting (`PAYMENT_ALREADY_CLAIMED`), if nothing is due (`ALREADY_PAID`/`NOTHING_TO_COLLECT`); sets order `PAID`, method `CASH` (a balance after a deposit keeps the original method), `payment_amount = price + fee`, `cash_collected_amount`, `cash_collected_at`; and `cash_settled_at = now()` immediately if the rider *is* the owner. Then **Mark delivered**. **Mark delivered anyway** (two taps, shows the amount as unpaid) completes without cash and records `cash_outstanding_amount`.

**Leave at the door (optional, per shop).** Only when the shop ticked "Allow leaving paid orders at the door", the order has nothing left to pay, and the rider has waited ≥ 5 minutes since arriving: **Take photo** → upload (path must contain `/uploads/<rider id>/delivery-proof/`) → **Leave & complete** → `delivery_record_proof` (refused unless `ARRIVED`, not yet handed over, order `ACCEPTED`, shop allows it, prepaid, ≥ 5 min, valid photo URL) → then `DONE` is accepted without the code. The customer can open the photo once delivered. *(Needs migration 20261004, applied 2026-10-22, not yet exercised.)*

**Finish.** `…(DONE)`: needs `ARRIVED`; needs the code verified **or** a proof photo when a code exists (`HANDOFF_NOT_VERIFIED`); order must still be `ACCEPTED`; sets `DELIVERED`, `delivered_at`; for a run, when no stop is left the run → `COMPLETED`; records any unpaid balance; customer notified **"Order delivered! 🎉"** (or "Order left at your door 📦"); trigger `trg_complete_appointment_on_delivery` sets the **order** to `COMPLETED` (delivery orders in `PENDING/ACCEPTED` only).

**Can't deliver.** **Can't deliver?** (per stop) or **Can't continue this run? (emergency)** (all open stops, one call each) → reasons *customer unavailable / address or access problem / customer refused / unsafe / rider emergency / other (note required)* → `cancel_delivery`: delivery `CANCELLED` (rider or any manager may do it; closed deliveries refuse); an emptied run completes. The **order is untouched** and stays `ACCEPTED`. Notifications: managers "Delivery couldn't be completed … (reason)" with a Reassign action; the customer, by reason: *unavailable* / *address* → "We couldn't reach you / Problem with your address" with **I'm ready now**; *refused* → "Delivery not completed"; any other reason (including emergency, unsafe, other) → "Delivery delayed — … is arranging a new delivery".

**Offline.** Taps for pick-up, start/arrive/done, and cash made with no signal are saved on the phone (`stryt_rider_queue_v1:<user>`) and replayed every 20 s, when the connection returns, and when the app is visible; the card is held until sent. Verifying the code and location fixes are never queued.

### 3.8 What the customer sees, stage by stage

On *My Appointments* each delivery order card shows `DeliveryTrackControl` (only while the order is `ACCEPTED` or `COMPLETED`):

| Stage | Customer sees |
|---|---|
| Order placed | Pending badge; ASAP shows "ASAP · by <time>"; after 15 min pending: "Still waiting for the shop to accept…" |
| Accepted, no rider yet | "Delivery accepted" + the owner's ETA text (only if an ETA was typed; otherwise **nothing at all**) |
| Packed | Nothing in the card (only a notification) |
| Rider assigned | "A delivery agent is assigned" + stepper; stops-ahead count on a multi-stop run; no rider identity yet |
| Picked up | "Picked up — leaving shortly" |
| On the way | "Your delivery is on the way", "About N min away" (computed on the server from the rider's fresh position, never coordinates), rider first name + photo + **Call**, the **code**, **Call shop**, share-link icon |
| Arrived | "Your delivery agent has arrived", the code |
| Delivered | "Delivered" (+ photo link if left at the door); order shows Completed, Rate & Review |
| Delivery cancelled | red card with the reason, **Call shop**, and **I'm ready now** for unavailable/address |

* Updates: a 12-second poll and a refetch on window focus — **both are only started once a delivery row exists**, so while the order is accepted-but-unassigned the card does not refresh by itself.
* **Share tracking link** → `appointment_create_tracking_token` (customer, owner/manager, or the assigned rider; reuses an unexpired token; 4-hour life) → public page `/track/<token>` via `get_tracking`: progress only, rider's first name only, no coordinates, no photo.
* **Customer cancel/reschedule:** only from the Upcoming tab for `PENDING/ACCEPTED`. `appointment_transition(CANCELLED)` is refused while the delivery is `EN_ROUTE/ARRIVED` (`DELIVERY_IN_PROGRESS`); otherwise the order cancels and `trg_cancel_delivery_on_order_cancel` cancels any live delivery and tells the rider "Order cancelled — don't deliver". **Reschedule** (`reschedule_appointment`) cancels the old order and creates a new `PENDING` one with the same address, fee, items and payment state — but it does **not** copy `is_asap`, `ready_at` or the ETA text.

### 3.9 Money and settlement (owner)

* **Prepaid:** customer pays (UPI/other) → claim → owner "Confirm received" (`appointment_confirm_payment`) → `PAID`; amount = package price + delivery fee.
* **Cash on delivery:** see 3.7. *Deliveries tab → Cash to collect from riders* lists, per rider, delivered orders whose cash is collected but not settled (`business_cash_to_settle`); **Mark received** → `settle_agent_cash` stamps `cash_settled_at`.
* **Delivered but unpaid:** *Delivered but not paid* (`business_cash_outstanding`); **Mark received** → `mark_outstanding_paid` → `PAID` (method defaults to CASH, `COD`).
* **Insights:** `business_delivery_stats(business, 30)` → delivered, cancelled, average minutes (delivered_at − delivery created_at), delivery fees collected, per-rider counts.
* **Admin:** `admin_delivery_overview` (active, delivered/failed last 7 days, awaiting a rider, cash outstanding/unsettled, and up to 50 deliveries needing attention: assigned 30+ min not started, en route with no location 10+ min, at the door 20+ min).

### 3.10 Notifications — what is sent and to whom

Every row inserted into `notifications` fires `trg_push_on_notification` (push). Delivery-related ones:

| Event | Recipient | Title |
|---|---|---|
| Order created | owner | New booking request |
| Accepted | customer | Booking confirmed ✓ (+ ETA) |
| Declined / owner cancelled / system cancelled | customer | Booking declined / cancelled / auto-cancelled |
| ASAP waiting 10 min | every manager | An order is waiting for you |
| Mark packed | customer | Your order is packed |
| Single assign | rider | New delivery assigned |
| Run assign | rider | New delivery run |
| Pickup | customer | Your order has been picked up |
| En route | customer | Your order is out for delivery 🛵 |
| Arrived | customer | Courier has arrived! 🛵 (with the code) |
| Delivered | customer | Order delivered! 🎉 / left at your door 📦 |
| Rider can't deliver | managers; customer (by reason) | Delivery couldn't be completed / We couldn't reach you / … |
| Owner cancels a delivery | rider; customer | Delivery cancelled / Delivery delayed |
| Order cancelled with a live delivery | rider | Order cancelled — don't deliver |
| Rider declines solo / run | managers | Delivery declined / run declined |
| Rider's access ends | managers | A rider's access ended |
| Customer "I'm ready now" | managers | Customer is ready for delivery (throttled 10 min) |
| Order auto-completed by the sweep | — | **nothing** |

---

## Part 4 — Who sees what, on which screen

### Which list an order sits in (read from the filters in the code)

| Screen | Rule | Source |
|---|---|---|
| **Owner → Bookings → Upcoming** | status `PENDING` or `ACCEPTED` **and** `scheduled_for` still in the future | `BusinessAppointments.tsx:653-655` |
| Owner → Day view | orders whose `scheduled_for` falls on the selected day | `:642` |
| **Owner → Bookings → Deliveries** | `fulfillment_type = DELIVERY` and status `ACCEPTED` **or** `COMPLETED`; "waiting for a rider" ones first | `:669-676` |
| Owner → History | `COMPLETED` or `NO_SHOW` | `:657-659` |
| Owner → Cancelled | `CANCELLED` or `REJECTED` | `:662-664` |
| Owner → "N waiting for a rider" banner / dashboard tile | `business_delivery_queue` (status `ACCEPTED`, no delivery in `ASSIGNED/EN_ROUTE/ARRIVED/DELIVERED`) | `20261001` |
| Owner → Live board | rows of `appointment_deliveries` (active first, last 25 finished) | `BusinessDeliveries.tsx` |
| **Customer → My Appointments → Upcoming** | status `PENDING` or `ACCEPTED` **and** `scheduled_for` in the future | `MyAppointments.tsx:31-34` |
| Customer → Past / cancelled | everything else (including every `COMPLETED`, and any `ACCEPTED` whose time has passed) | `:162-164` |
| Rider → Active / Assigned / History | by delivery status (`EN_ROUTE`/`ARRIVED`, `ASSIGNED`, `DELIVERED`/`CANCELLED`) and run status | `DeliveryConsole.tsx:174-190` |

### One ASAP order on a clock (shop prep time P minutes)

| Time after order | What the database does | Owner sees | Customer sees |
|---|---|---|---|
| 0 | `PENDING`, `scheduled_for = now + P + 1 min` | Upcoming (⚡ ASAP, "Waiting N min") | Upcoming, Pending |
| accept | `ACCEPTED`, ETA text | Upcoming + Deliveries tab; "N waiting for a rider" | Upcoming, "Delivery accepted" (+ETA if typed) |
| Mark packed | `ready_at` set | "✓ Packed" badge | a notification only |
| P + 1 min passes | nothing yet (a read triggers the sweep) | **leaves Upcoming** (still in Deliveries tab) | **moves to Past** (still shows the delivery card) |
| first list read by either side after that (the sweep runs at most every 2 min per app) | `ACCEPTED → COMPLETED` (or `PENDING → CANCELLED`) | moves to History; **drops out of "waiting for a rider"**; assign/pickup/start/cash all refused | "Completed"; Rate & Review offered; no notification |

So with a typical prep time the order is out of the "live" lists within minutes and then closed by the clock — whether or not it has been packed, assigned or delivered.

### What each role can do at each order state (server-enforced)

| Action | Needs the order to be | Needs the delivery to be |
|---|---|---|
| Accept / decline | `PENDING` | — |
| Mark packed | `ACCEPTED` | — |
| Assign / reassign / batch-assign | `ACCEPTED`, `DELIVERY` | no other live delivery (reassign replaces it) |
| Rider: picked up | `ACCEPTED` | `ASSIGNED`; its run `ACCEPTED/IN_PROGRESS` |
| Rider: start | `ACCEPTED` | `ASSIGNED` (picked up) or `EN_ROUTE`; run accepted |
| Rider: arrived | `ACCEPTED` | `EN_ROUTE` or `ARRIVED` |
| Rider: confirm code | — | `EN_ROUTE` or `ARRIVED` |
| Rider: collect cash | `ACCEPTED` | `EN_ROUTE` or `ARRIVED` |
| Rider: proof photo | `ACCEPTED` | `ARRIVED`, code not yet given |
| Rider: delivered | `ACCEPTED` | `ARRIVED` + (code verified or proof) |
| Rider/owner: can't deliver / cancel | — | not `DELIVERED`/`CANCELLED` |
| Customer: cancel / reschedule | `PENDING` or `ACCEPTED` | not `EN_ROUTE`/`ARRIVED` |
| Customer: "I'm ready now" | `ACCEPTED` | no live delivery |

"Needs `ACCEPTED`" is the common factor that the sweep removes.

---

## Part 5 — Defects found while reading (with evidence)

Severity: **P0** = breaks the delivery flow for real orders; **P1** = wrong or misleading behaviour that affects use; **P2** = gap or rough edge. None of these has been changed — this document only records them.

| # | Sev | Defect | Evidence | Effect |
|---|---|---|---|---|
| **D1** | **P0** | `sweep_my_appointments` completes every `ACCEPTED` order whose `scheduled_for` has passed, with no exception for delivery orders. ASAP orders are scheduled only P + 1 minutes ahead. | production function body (Part 1); `20260879` comment says delivery should complete "by the delivery, not the clock" but only added the DELIVERED trigger; prod rows `apt_9d95…`, `apt_fb63…` are `COMPLETED` with 0 deliveries | Orders vanish from live lists, can't be assigned/picked up/started/paid (`ORDER_NOT_ACCEPTED`/`ORDER_NOT_ACTIVE`), drop out of "waiting for a rider"; customer gets no notice; the owner sees "Mark no-show" on a delivery that never happened (and the customer a "Marked as no-show" message); the customer is offered Rate & Review. |
| **D2** | **P0** | The same sweep cancels `PENDING` orders when `scheduled_for` passes ("business not responded"), so an ASAP order dies after P + 1 minutes, not after the 30 minutes `expire_stale_asap_orders` allows; the owner nudge at 10 minutes says "it expires in 20 minutes". | same function; `nudge_pending_asap_orders`, `expire_stale_asap_orders` bodies | Shops that take > P + 1 min to answer lose the order; copy is wrong. (The comment at `AppointmentSheet.tsx:138-139` shows the sweep's cancel was known.) |
| **D3** | P1 | Both "Upcoming" lists require `scheduled_for > now`, so an accepted delivery that is merely running late leaves "Upcoming" (owner) / moves to "Past" (customer) even before the sweep. | `BusinessAppointments.tsx:653-655`; `MyAppointments.tsx:31-34,162-164` | After P + 1 minutes the live order is in the wrong tab; customer loses Cancel/Reschedule (those buttons exist only in Upcoming) and sees "Book again". |
| **D4** | P1 | The offline/guest fallback `localHousekeeping` copies the same rule on the client (`ACCEPTED` + past → `COMPLETED`, `PENDING` + past → `CANCELLED`). | `appointmentService.ts:178-195` | Same wrong outcome on a cached list. |
| **D5** | P1 | Reassigning an existing live delivery keeps `picked_up_at`, `started_at`, `arrived_at`, `live_status`, `lat/lng/position_at` and any proof from the previous rider; only agent, status, code, verified flag, run/stop are reset. | `assign_delivery` body (the `if found` branch) | A new rider inherits "picked up" without picking up; owner's health line and the customer's "Picked up" label can be stale. (Reassign is offered while `EN_ROUTE`/`ARRIVED` too.) |
| **D6** | P2 | `DeliveryAssignControl` is rendered for `ACCEPTED` **and** `COMPLETED` orders, so a closed order shows "Assign delivery"; the refusal text for `ORDER_NOT_ACCEPTED` is "Accept the order before assigning a rider", wrong for a completed/cancelled order. | `BusinessAppointments.tsx:629`; `deliveryService.friendlyDeliveryError` | Misleading dead button. |
| **D7** | P1 | The screens that need live delivery data subscribe to realtime on `appointment_deliveries` (rider console, tracking runner, owner live board), but that table (and `delivery_batches`) is not in the `supabase_realtime` publication, so those subscriptions never fire and the hook has no polling fallback. | publication query (Part 2); `useApi.ts:120-181` | Rider doesn't see a new assignment until pull-to-refresh/open/tap; the owner's live board only polls (12 s) while a delivery is already active, so the first assignment doesn't show until reopened; the customer's tracker card has no poll or focus refetch until a delivery row exists (`DeliveryTrackControl.tsx:37-53`); the tracking runner counts active deliveries once per mount. |
| **D8** | P2 | "Packed" (`ready_at`) is never read by any customer screen; with no ETA text typed at accept, an accepted-but-unassigned delivery shows nothing at all in the card. | `readyAt` appears only in `BusinessAppointments.tsx:426,621`; `DeliveryTrackControl.tsx:96-105` | Customer can't tell "accepted", "packed" or "no rider yet" apart in the app. |
| **D9** | P2 | Packing is decoupled from dispatch: `assign_delivery`, pickup and start never check `ready_at`. | function bodies | A rider can be sent for, and can start, an order the shop has not packed. |
| **D10** | P2 | `reschedule_appointment` on a delivery order creates a fresh `PENDING` order but does not copy `is_asap`, `ready_at` or `delivery_eta_text`; the old order is cancelled (its `ASSIGNED` delivery too). | function body | A packed/ASAP order loses its state on reschedule. |
| **D11** | P2 | Stock reserved at order time for `FINITE` items is never returned when the order is cancelled, rejected or expires (no restock path found). | `reserve_catalog_items`; a search of the migrations for restock/release/unreserve logic found none (only the owner raising the quantity by hand) | Over-counted sold stock until the owner restocks. (Test shop items are `INFINITE`.) |
| **D12** | P3 | Accepting a run from the notification button calls `acceptBatch(batchId)` with no stop order; accepting in the console sends a computed order. | `notifications/actions.ts:156`; `DeliveryConsole.tsx:372-378` | Stops of a run accepted from the notification have no route order. |
| **D13** | P2 | The proof-photo flow and the open-hours check from migration 20261004 are live in production but have not been run end to end anywhere (staging stops at `20260999`). | `supabase/APPLY_LOG.md` row 67 | Unknown behaviour until tested. |

### What D1 means for the reported problem
1. Order placed (ASAP) at T. `scheduled_for = T + P + 1`.
2. Owner accepts, taps **Mark packed** (this only sets `ready_at`).
3. When `scheduled_for` passes, the next list read by either side runs the sweep → `COMPLETED`.
4. From then on: gone from Upcoming/Past-active views, unassignable, unpickable, "Completed" for the customer.
The tap on **Mark packed** is simply the last visible action before the clock closes the order; it is not the cause.

---

## Part 6 — What this document does not claim

* **Not run end to end.** No complete order has been taken from placement to delivered on a real device in this build. Background GPS with the screen locked, camera capture, push delivery on a phone, and the Play background-location declaration are unverified.
* **Read in full:** the production definitions of every function listed in Parts 2–3 (including triggers, `has_business_scope`, `has_business_access`, `business_manager_ids`, `person_first_name`), `appointment_create` (live, 20261004 version), `deliveryService.ts`, `DeliveryConsole.tsx`, `BusinessDeliveries.tsx`, `DeliveryAssignControl.tsx`, `DeliveryOwnerPanels.tsx`, `DeliveryTrackControl.tsx`, `DeliveryTrackingRunner.tsx`, `riderQueue.ts`, `RequireDeliveryAgent.tsx`, `deliveryTerms.ts`, `deliveryHealth.ts`, the order-handling parts of `MyAppointments.tsx`, `BusinessAppointments.tsx`, `AppointmentSheet.tsx`, `CartCheckoutSheet.tsx`, `appointmentService.ts` (lists, create, sweep), `useApi.ts`, `notifications/actions.ts` (delivery actions).
* **Read only in part (named so you can ask for more):** `DeliveryTermsEditor.tsx` (first 130 lines), `BusinessSettings.tsx` (the delivery toggle and editor mount), `ManageDashboard.tsx` / `BusinessHub.tsx` / `ManageNav.tsx` (the delivery gating lines only), `TrackingPage.tsx` (header only), `DeliveryNotificationCard.tsx` (action list only), `RiderOrderInfo`, `LeaveAtDoorProof`, `CantDeliverSheet`, `HandoffCodeInput`, `backgroundLocation.ts`, `actionQueue.ts`, `AdminDeliveries.tsx`, `BusinessAccess.tsx` (scopes/presets only).
* **Not read:** `appointment_claim_payment` / `appointment_confirm_payment` internals (how the claimed amount is validated against price + fee), `grant_team_member_access` internals, the `send-push` edge function body, `push_on_notification_insert`, the walk-in order functions.
* Hindi/Marathi strings were not reviewed.
* The `20261004` migration was applied by the owner in the SQL editor and checked only by catalog markers (APPLY_LOG row 67).

---

### Appendix — the production functions this document was written from
`accept_delivery_batch`, `admin_delivery_overview`, `appointment_accept_with_eta`, `appointment_create`, `appointment_create_tracking_token`, `appointment_transition`, `appointment_update_delivery_status`, `assign_delivery`, `assign_delivery_batch`, `business_active_deliveries`, `business_cash_outstanding`, `business_cash_to_settle`, `business_delivery_queue`, `business_delivery_stats`, `business_manager_ids`, `cancel_delivery`, `confirm_handoff`, `count_my_active_deliveries`, `customer_ready_for_redelivery`, `decline_delivery_batch`, `decline_solo_delivery`, `delivery_collect_cash`, `delivery_mark_picked_up`, `delivery_proof`, `delivery_record_proof`, `enforce_customer_daily_appointment_limit`, `enforce_slot_capacity`, `expire_stale_asap_orders`, `get_delivery_duty`, `get_tracking`, `has_business_access`, `has_business_scope`, `hours_open_at` (and its two helpers), `mark_order_ready`, `mark_outstanding_paid`, `my_deliveries`, `my_delivery_progress`, `my_duty_blockers`, `notify_on_appointment_created`, `notify_on_appointment_status`, `nudge_pending_asap_orders`, `person_first_name`, `reschedule_appointment`, `reserve_catalog_items`, `set_delivery_duty`, `settle_agent_cash`, `sweep_my_appointments`, `sweep_stale_appointment_holds`, `tg_cancel_delivery_on_order_cancel`, `tg_complete_appointment_on_delivery`, `tg_delivery_batch_in_progress`, `tg_unassign_deliveries_on_access_end`, `update_delivery_batch_position`, `update_delivery_position`.

---

## Part 7 — What was changed to fix this (2026-10-22, written after Parts 1–6)

*Parts 1–6 describe the system as it was found. This part records the fix. **The database half is migration `supabase/migrations/20261005_delivery_order_lifecycle.sql`, applied to production by the owner on 2026-10-22 (APPLY_LOG row 69)**, so production no longer behaves as Parts 1–6 describe. The app half is in the working tree, uncommitted and not deployed; it is written to work either way (it detects a database without the new columns and doesn't gate on them).*

### The model, borrowed from the delivery platforms
DoorDash, Uber Eats and Swiggy share a few rules, and the fix applies them:
* **An order moves on events, not on the clock.** The shop accepts, the shop marks it ready, a courier picks up, arrives, hands over. Timers exist only on the *waiting* states, and they escalate before they expire. (DoorDash models the delivery as its own status track — assigned → picked up → arrived → dropped off, with a cancelled and a could-not-deliver branch — and Uber Eats has the merchant accept within a window and then signal "ready for pickup" before a courier collects. [DoorDash delivery statuses](https://developer.doordash.com/en-US/docs/drive_classic/reference/delivery_statuses), [Uber Eats order integration](https://developer.uber.com/docs/eats/guides/order-integration).)
* **Hand-over is confirmed by a code, with a photo as the fallback, and everything is logged** with who, what and when. Cash on delivery is tied to the delivery record so the two can't drift apart. (Pattern from delivery-confirmation and COD-reconciliation guides, e.g. [LogiNext on proof of delivery](https://loginextsolutions.com/blog/?p=11605), [Pidge on COD reconciliation](https://pidge.in/blogs/cod-reconciliation-automation-delivery-businesses).)

### Defect by defect
| # | What was wrong | Fix | Where |
|---|---|---|---|
| D1 | The clock completed accepted delivery orders | `sweep_my_appointments` never completes a `DELIVERY` order; completion comes only from the rider's hand-over (`tg_complete_appointment_on_delivery`) | migration §4 |
| D2 | The clock cancelled unanswered ASAP orders after prep + 1 minute | `sweep_my_appointments` skips ASAP orders; `expire_stale_asap_orders` (30 min, with the 10-minute nudge) is the only expiry, so the message is now true | migration §4 |
| — | A stuck accepted order sat open forever | New `escalate_overdue_delivery_orders` (every 5 min): tells the shop once at 15 minutes overdue with nobody assigned; closes the order at 3 hours (customer told, stock returned, a waiting rider stood down) | migration §4 |
| D3 | "Upcoming" lists hid a late delivery | New `isLiveOrder`: a delivery order is live until delivered or cancelled. Used by the owner's and the customer's lists | `src/lib/orderLists.ts` + both screens |
| D4 | Offline copy of the clock rule | `localHousekeeping` skips delivery orders | `appointmentService.ts` |
| D5 | Reassign kept the old rider's pick-up/start/position/proof | Reassign resets them, issues a new code, clears wrong-code history, tells the old rider "don't deliver"; choosing the same rider is a no-op | migration §7 |
| D6 | "Assign delivery" on finished orders, wrong error text | Assign/Reassign only for `ACCEPTED`; finished orders show who delivered, read-only; new plain error messages | `DeliveryAssignControl`, `deliveryService.friendlyDeliveryError` |
| D7 | Delivery screens waited on a realtime feed that carries no delivery rows | Polling that runs for as long as the screen is open: rider console every 15 s (+ on focus), owner live board every 12 s (not only once a delivery is active), customer card every 12 s **from the moment the order is placed**; the tracker's active count is refreshed (it was read once, so tracking could stop mid-delivery). The tables were deliberately **not** added to the realtime feed — see "Not changed" | the three screens + `DeliveryTrackingRunner` |
| D8 | Customer couldn't see "packed", or anything before a rider | One seven-step progress line from the moment the order is placed: placed → accepted → packed → partner assigned → picked up → on the way → delivered, with a sentence for each wait | `deliveryStage.ts`, `OrderProgress`, `DeliveryTrackControl` |
| D9 | Packing wasn't linked to pick-up | A rider can pick up only once the shop has marked the order packed (an owner delivering their own order is exempt); in a run only the packed stops are marked. The rider's card says "Waiting for the shop to pack this order"; the owner is warned when assigning an unpacked order | migration §8, `DeliveryConsole`, `DeliveryAssignControl` |
| D10 | Reschedule lost the ASAP state | An ASAP order can't be rescheduled (cancel and re-order — there is no later slot); the button is hidden; a reschedule can't happen once the rider has the order | migration §6, `MyAppointments` |
| D11 | Stock never returned | Cancelling or declining an order returns FINITE stock (an item the owner set out of stock by hand stays out); a reschedule re-reserves for the replacement | migration §3, §6 |
| D12 | A run accepted from the notification had no stop order | The server numbers the stops in assignment order when none is sent | migration §7 |
| D13 | Migration 20261004 untested | The new lifecycle test (below) exercises the surrounding paths | `supabase/tests/delivery_lifecycle.test.sql` |
| — | The reported "no-show" on a delivered order | A delivery can't be marked a no-show (server and button) | migration §6, `BusinessAppointments` |

### Hardening added while in there
* **Server-side pricing.** The order price used to come from the app. A delivery order is now priced from the shop's catalog (name and unit price read from `catalog_items`; items must belong to the shop and be in stock; quantities 1–99); a total that doesn't match is refused with "a price changed", not silently charged. Coordinates are range-checked and address text is length-capped.
* **Open-order cap:** 3 open delivery orders per customer per shop, 5 overall (`TOO_MANY_OPEN_ORDERS`) — delivery was exempt from the daily limit and had no cap at all.
* **Hand-over codes** now come from `gen_random_uuid()` (a secure source), not `random()`.
* **Positions are erased** when a delivery or a run ends (a trigger), so a finished delivery leaves no location behind.
* **Customers can't cancel once the rider has the order** (picked up), not only once it is moving.
* **Audit log** `order_events`: placed, accepted, packed, assigned, reassigned, picked up, en route, arrived, handoff verified, proof recorded, cash collected/settled, delivered, cancelled, completed — with who (or SYSTEM) and when; readable by the customer, the owner and staff with the appointments scope; nobody can write to it directly. Written by triggers, so every path is covered.
* The customer is told when a delivery partner is assigned; the rider list also carries `order_ready_at`; system-cancel messages say what really happened instead of always blaming the shop.
* Trigger functions are no longer executable by app users.

### How it was checked
* `npm run verify` (lint, tsc, eslint, all unit tests including the new ones, build).
* New unit tests: `orderLists`, `deliveryStage`, `DeliveryTrackControl` (the customer card at every stage), `deliveryService` (pick-up gate, old-database tolerance).
* **Database behaviour test** `supabase/tests/delivery_lifecycle.test.sql`: replays a whole order as the three test users — and the cases that used to fail (the clock closing a live order, reassign leaving stale state, pick-up before packing, price tampering, stock never returned, a stuck order) — then rolls back. Combined with the migration it can be run **before** applying: `archive/output/delivery_dryrun.sql` runs both in one transaction that always rolls back and should end with the error text `ALL_DELIVERY_CHECKS_PASSED`.
* **Run against production after the owner applied the migration (2026-10-22):** the behaviour test alone, in one rolled-back transaction, ended `ALL_DELIVERY_CHECKS_PASSED` (the first run failed one check — a rider could read the shop's audit log — because the fixture rider also holds the `appointments` scope; that is correct behaviour, so the test now narrows the rider to delivery-only inside the transaction). Read-only catalog checks confirmed the table, columns, 7 functions, 7 triggers, the cron job, and that `anon` has no execute on any touched function; the rollback left no test rows. The live objects were checked by markers, not byte-compared to the file.
* **Still not done:** a person walking the order through three real accounts on the web and on a phone (GPS with the screen locked, camera for proof, push), and the app half is not deployed yet.

### Not changed, and why
* **Realtime for delivery rows.** Adding `appointment_deliveries` to the realtime feed would be the textbook way to get push updates, but the hand-over code and the proof-photo URL are protected only by column permissions, and I could not confirm from here that realtime respects column permissions. Leaking the code would defeat the point of the code, so the screens poll instead.
* **Direct table updates on `appointments`.** The row-security policy `appt_update` lets an owner (or anyone with the appointments scope) write any column from the client, including `status` and payment fields. The app never does, but a modified app could. Closing it means revoking table UPDATE and routing every write through the RPCs — worth doing, but it touches every booking flow and needs staging; it is not part of this change.
* **Server pricing for in-store orders and provider packages** (only delivery is covered), **COD abuse limits** (blocking cash on delivery for repeat refusers), **rider payouts/earnings**, and an **order-timeline screen** over `order_events`.
* **Team access** (shop login scopes, the business update policy, access notifications) — being fixed separately in `20261006_team_access_fixes.sql`; the two migrations touch different objects and can be applied in either order.
