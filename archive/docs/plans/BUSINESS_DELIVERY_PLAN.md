# Business home delivery — plan to finish it properly

**Status:** built 2026-10-19 on the recommended defaults (D1–D6), flag-gated; **migration `20261001` written but NOT yet applied to any database** (see §7). **Date:** 2026-10-19. **Scope:** the business side of delivery (setup, ordering, dispatch, cash, insights, rollout).

## 1. Where things stand

Delivery is built but **switched off and only half-modelled on the business side.**

**Exists (all dark behind `DELIVERY_AGENT_ENABLED = false`, `src/lib/features.ts`):**
- DB: `appointments.fulfillment_type` (IN_STORE / DELIVERY), `delivery_address_line`, `delivery_lat/lng`, `requested_delivery_window`, `delivery_eta_text`; `appointment_deliveries` (assign, ASSIGNED → EN_ROUTE → ARRIVED → DELIVERED / CANCELLED, 6-digit handoff code, live position); `delivery_batches` (multi-stop runs); `delivery_agent_duty`; `businesses.delivery_enabled` + `delivery_time` (free text). RPCs for assign / accept / decline / cancel / confirm handoff (rate-limited).
- UI: customer Home-delivery toggle in `AppointmentSheet`; owner live board `BusinessDeliveries.tsx` + `DeliveryAssignControl`; agent console `/delivery`; customer tracking; delivery notifications v2; Team & Access `delivery` scope.
- Flag-off effect: the Settings toggle says "delivery will switch on once the feature ships"; the Live deliveries / My deliveries entries and the customer toggle never render.

**Missing for a shop owner (the "properly" part):**

| # | Gap | Evidence |
|---|-----|----------|
| G1 | **No delivery terms.** Only on/off + a free-text ETA. No delivery radius, fee, free-above amount, minimum order, delivery hours or prep time. The server only rejects `DELIVERY_NOT_OFFERED`; any address anywhere is accepted. | `businesses` has just `delivery_enabled`, `delivery_time` |
| G2 | **Customer never sees a delivery cost.** No fee in the total, no "add ₹X for free delivery", no out-of-area message. | `AppointmentSheet`, `CartCheckoutSheet` |
| G3 | **Orders are slot bookings.** A grocery order is "as soon as possible", not "pick a time slot". There is no ASAP path and no "packed / ready for dispatch" step; "orders awaiting a driver" isn't a queryable state (DLV-009). | order = `appointments` + slot-capacity trigger |
| G4 | **Dispatch only to Team & Access members.** A one-person shop where the owner delivers can't assign it to themselves. No hint that an order is waiting for a driver. | `deliveryService.deliveryTeam` = ACTIVE grantees only |
| G5 | **Cash on delivery isn't modelled.** Payment methods are UPI / CASH at the shop; nobody records the agent collecting cash or hands it to the owner. | no COD / cash-collected anywhere in src or migrations |
| G6 | **No owner insights.** No delivery history, on-time rate, per-agent counts, or cash still to reconcile. | — |
| G7 | **Play Store gates.** Delivery runs need `ACCESS_BACKGROUND_LOCATION` (declaration + demo video) and the battery-exemption permission (currently commented out in the manifest). The flag is a compile-time constant, so enabling it needs a new AAB. | `archive/docs/launch/ANDROID_LAUNCH_BLOCKERS.md` BLOCKERs 1–2 |

## 2. Decisions I need from you (my recommendation first)

| ID | Question | Recommendation |
|----|----------|----------------|
| D1 | **When to ship?** | After the 12-tester / 14-day closed test finishes, as v1.1. Changing permissions mid-test risks re-review and muddies the test. Build and test on staging in the meantime. |
| D2 | **One app or a separate rider app?** (Zomato/Swiggy ship two.) | One app for v1.1. Agent-only permission prompts (already the default in `batteryOptimization.ts`). Revisit a rider app if Play pushes back. |
| D3 | **Who can deliver?** | Team members **plus the owner themselves.** Third-party couriers (Dunzo-style) are out of scope. |
| D4 | **Fee model** | Flat fee + free-above amount + minimum order + one delivery radius. Distance-tier pricing later. |
| D5 | **Order timing** | Support both: ASAP (default for shops) and scheduled slot (existing). |
| D6 | **Payment** | UPI (existing claim/confirm flow) + cash on delivery. In-app online payment is out of scope. |

## 3. Phases

Each phase ships behind the flag, with tests, and leaves the app working. Migrations are new files after `20261000`; verify live DB state via MCP, `DROP` before widening any `RETURNS TABLE`, `REVOKE` anon on new RPCs, add rollbacks in `supabase/rollbacks/`.

### Phase 0 — Spike and decisions (S)
- Answer D1–D6.
- Spike for G3: can an ASAP order live as an `appointments` row (synthetic "now + prep time" slot that bypasses `enforce_slot_capacity`, like the out-of-range bypass in `20260946`), or does it need a thin `orders` layer? Output: a one-page recommendation before Phase 3. This is the single biggest design risk.

### Phase 1 — Delivery terms in business settings (M)
- **DB:** `businesses.delivery_radius_km`, `delivery_fee`, `free_delivery_above`, `min_order_amount`, `delivery_prep_min`, optional `delivery_cutoff_time`. Keep `delivery_time` as the shown ETA, derived from prep time + a travel allowance.
- **Server enforcement** in `appointment_create`: `DELIVERY_OUT_OF_AREA` (distance from the shop's coordinates), `DELIVERY_MIN_ORDER`, and **snapshot the fee onto the order** (`appointments.delivery_fee`) so later setting changes never alter an existing order.
- **UI:** Settings → Home delivery becomes a proper section (radius picker reuses the shared `RadiusSelector`, fee / free-above / minimum as simple money inputs, live preview "Customers within 3 km pay ₹30; free above ₹500"). Remove the "once the feature ships" copy.

### Phase 2 — Customer ordering experience (M)
- Pick-up / Deliver selector in cart checkout and booking sheet; saved address or map pin (existing `LocationPicker`).
- Shows fee, "Add ₹X more for free delivery", ETA, final total (fee included in the payment amount).
- Out-of-area and under-minimum states with friendly, specific messages; offer pick-up instead.
- Tracking page keeps the existing stepper; add delivery fee to the receipt.

### Phase 3 — Order lifecycle and dispatch (L, depends on the Phase 0 spike)
- Statuses the owner actually uses: Placed → Accepted → Packed (ready) → Out for delivery → Delivered. Map onto the existing appointment + delivery statuses; add the "Packed / ready for dispatch" step and a queryable "awaiting a driver" state.
- Owner dashboard: a **Deliveries** tile with counts (awaiting driver / on the way); a board of orders waiting for dispatch with one-tap assign.
- **Self-delivery:** "Deliver myself" in the assign control; extend the `assign_delivery` guard so the owner can be the agent without a Team & Access invite.
- Notifications: owner pinged when an order is packed and unassigned for N minutes; customer notified at each step (v2 notifications already exist).
- Keep: handoff code, cancel flow, multi-stop batches, on/off duty.

### Phase 4 — Cash on delivery (M)
- Order payment method COD; agent marks "cash collected" at handoff (amount shown, must match); owner gets a reconciliation list ("₹1,240 collected by Ravi, not yet handed over") and marks settled.
- Reuses `PaymentStatus` and the existing owner confirmation queue; no new payment provider.

### Phase 5 — Owner insights (S–M)
- Delivery history, on-time rate, average delivery time, per-agent counts, cash to reconcile. One new screen under Business → Deliveries; RPCs read from `appointment_deliveries`.

### Phase 6 — Rollout (M, mostly non-code)
- Flip `DELIVERY_AGENT_ENABLED` (restore the battery permission only for agents, per BLOCKER 1 option 3), new AAB, Play Console background-location declaration and demo video (draft exists), updated Data Safety (delivery address, delivery position).
- Staged rollout: 5% → 20% → 100% with the delivery funnel watched.
- QA matrix below, on real devices with a real SIM.

## 4. Test plan
- **Unit (vitest):** fee and free-above maths, radius check, minimum order, status mapping, COD reconciliation totals.
- **DB:** migration lint, rollback applied/reverted on staging, RPC tests for each new error code.
- **Staging seed:** demo kirana with delivery on (radius 4 km, ₹30 fee, free above ₹500, minimum ₹150), one team rider, owner self-delivery.
- **Manual device matrix:** order in range / out of range / under minimum / free-delivery threshold; ASAP and scheduled; owner self-deliver; team-rider run with screen locked (background GPS); COD collect and settle; cancel at each stage; reassign mints a new handoff code.
- **Known gap:** e2e persona sign-in is broken by the Firebase OTP screen; fix that fixture (or add a direct-session path) before relying on Playwright for this.

## 5. Risks
- **ASAP vs slots (G3)** is the one structural unknown; do not start Phase 3 before the spike.
- **Play review** for background location and battery permissions can take longer than the code; start the declaration early.
- **Scope creep:** each of fee tiers, third-party couriers, in-app card payments, auto-dispatch is out of scope here. Add later only on demand.
- **Existing orders:** fee snapshot and `IF NOT EXISTS` columns mean current data is unaffected.

## 6. Rough size
Phase 0: days. Phases 1, 2, 4, 5: roughly one working week each. Phase 3: the largest, size after the spike. Phase 6: bounded by Play review time, not engineering.

## 7. What was built (2026-10-19) and what is left

**Correction found during the Phase 0 spike:** a delivery radius check already existed (`appointment_create` compared the drop-off with the shop's `broadcast_radius`, 5 km default, and flagged beyond it as an out-of-range *request* rather than rejecting). So G1's real gap was "the radius isn't configurable separately", not "any address is accepted". Out-of-area orders still arrive as requests the owner can accept; the customer is now told so before ordering.

**Phase 0 result (ASAP orders):** no separate orders table needed. `enforce_slot_capacity` checks capacity per exact timestamp, so an ASAP order is an appointment at `now + prep time` (rounded up a minute) with label "ASAP"; whole-day blocks still apply.

| Phase | Done |
|-------|------|
| 1 Terms | `businesses`: `delivery_radius_km`, `delivery_fee`, `free_delivery_above`, `min_order_amount`, `delivery_prep_min`. `appointment_create` enforces the minimum (`DELIVERY_MIN_ORDER`), snapshots the fee on the order, uses the delivery radius. Settings → Home delivery has a full editor (`DeliveryTermsEditor`) with a plain-language preview. |
| 2 Customer | Order sheet: As-soon-as-possible (default, with an estimate) or pick a time; fee line, "add ₹X for free delivery", minimum-order block, out-of-area notice, total with delivery; the fee is included in the amount to pay. |
| 3 Lifecycle | `mark_order_ready` (customer notified), `business_delivery_queue` (orders awaiting a rider), "Mark packed" on accepted delivery orders, Deliveries tab lists waiting orders first with a banner, dashboard Delivery tile shows "N waiting for a rider" and opens that tab, **owner can assign a delivery to themselves** (`assign_delivery` already allowed it; the picker never offered it). |
| 4 Cash | `delivery_collect_cash` (rider), `business_cash_to_settle` + `settle_agent_cash` (owner); rider card shows cash due and a "Collect ₹N cash" step before "Mark delivered"; an owner delivering their own order is settled automatically. |
| 5 Insights | `business_delivery_stats` + a 30-day summary and per-rider counts on the Deliveries tab. |
| 6 Rollout | `DELIVERY_AGENT_ENABLED` now reads `VITE_DELIVERY_AGENT_ENABLED` (default off); `.env.staging` sets it. Production and Play builds are unchanged until that variable is set and a new build ships. |

**Not done / still yours:** apply `20261001_business_delivery_terms.sql` (rollback in `supabase/rollbacks/`); the Play Console background-location declaration and demo video; turning the flag on for production (a new build, per D1 after the closed test); a real-device pass (background GPS with the screen locked, cash collect/settle, reassign); a Delivery-agent e2e once the Firebase OTP fixture is fixed.

### 7.1 Release runbook (2026-10-20)

1. **Database.** `20261001`–`20261003` are live in production. Apply `supabase/migrations/20261004_delivery_followups.sql` in the SQL editor (rollback: `supabase/rollbacks/20261004_delivery_followups.rollback.sql`); then add `supabase/APPLY_LOG.md` row 67 with the file's sha256 and move `LATEST_APPLIED_MIGRATION` in `scripts/lint-migrations.mjs` to `20261004_delivery_followups.sql`. **Correction (2026-10-22): the app is NOT safe to run with the flag on before this is applied.** Settings → Home delivery → *Save terms* sends `delivery_proof_allowed`, a column this migration adds, so with the flag on and the migration missing the save fails with PostgREST `PGRST204 Could not find the 'delivery_proof_allowed' column of 'businesses'` (hit while testing on production). Minimum unblock, additive and idempotent with the full migration: `alter table public.businesses add column if not exists delivery_proof_allowed boolean not null default false; notify pgrst, 'reload schema';`. Without the rest, proof-of-delivery doesn't appear (the app reads it through RPCs, which then error quietly) and ASAP isn't refused server-side. The full file also replaces `appointment_create`, which every booking uses, and has not been run end to end anywhere (staging stops at 20260999) — test it on staging before applying it to production.
2. **Tracking table.** `supabase_migrations.schema_migrations` stops at 20260998; the nightly drift check will flag 20260999–20261004 until `supabase migration repair --status applied <versions>` is run (a production write — the owner's call).
3. **App.** Delivery is off in every build that doesn't set `VITE_DELIVERY_AGENT_ENABLED=true`; Play and production builds don't. Turning it on needs a new AAB, the Play background-location declaration for delivery, and the closed-test gate.
4. **Verification not done by this work:** a real phone (GPS in the background, camera capture, offline replay on reconnect, push), and anything against a real database beyond the hours-parser run in staging `pg_temp`.
