# Delivery Rider Console & Batch Runs — Bug & Gap Log

**Purpose:** Documenting every architectural defect, mission-critical mobile hazard, safety blocker, communication void, and workflow failure in **Flow 5.2: Delivery Rider Console & Batch Runs** (`src/screens/delivery/DeliveryConsole.tsx`, `src/screens/business/manage/TeamMyDeliveries.tsx`, `src/components/RequireDeliveryAgent.tsx`, `src/components/delivery/HandoffCodeInput.tsx`, `src/components/delivery/CantDeliverSheet.tsx`, `src/services/engagement/deliveryService.ts`, `src/lib/backgroundLocation.ts`, `src/lib/routeLink.ts`, and Supabase migrations `20260845_delivery_agent_phase1_groundwork.sql`, `20260848_delivery_batches_phase4.sql`, `20260862_delivery_agent_duty.sql`, `20260864_confirm_handoff_rate_limit.sql`, `20260871_team_console_delivery.sql`, `20260872_delivery_cancellation.sql`, `20260873_delivery_solo_position.sql`, `20260879_complete_appointment_on_delivery.sql`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **R1** | NewRunGate Fullscreen Gate Hijacks Console, Blocking In-Flight Active Deliveries | 🔴 P0 (Critical Operational Hazard) | In `DeliveryConsole.tsx:340-363`, if an agent receives a new pending batch dispatch while currently en route with an active delivery (`soloActive` or an active stop), `pendingBatch` renders an unskippable fullscreen gate (`<NewRunGate />`). The courier cannot see their current customer's address, cannot tap "I've arrived", and cannot enter the handoff code until they accept or decline the incoming batch. |
| **R2** | Zero Customer & Shop Phone Numbers in Entire Delivery Console | 🔴 P0 (Communication Void & Delivery Blocker) | In `my_deliveries` RPC (`20260848_delivery_batches_phase4.sql:413-435`) and `DeliveryConsole.tsx` (`RunCard.tsx`, `DeliveryCard.tsx`), `customer_phone`, `cu.phone`, and `b.phone` are completely omitted. There is zero `Phone` icon, zero `tel:` link, and zero chat action. If a courier cannot locate a gated community, flat, or security entrance, they have zero way to call the customer or the shop from the app. |
| **R3** | Unverified Handoff Deadlock with Zero Customer Code Fallback | 🟠 P1 (Customer Handoff Deadlock) | In `ActionControls.tsx:624-638` and `appointment_update_delivery_status` (`20260848_delivery_batches_phase4.sql:215-217`), completing a delivery strictly requires a 6-digit `handoff_code` verification (`HANDOFF_NOT_VERIFIED` exception). If a customer's battery died, SMS was delayed, or an elderly relative answered the door without the code, there is zero bypass, merchant override, or call fallback. The courier is forced to leave the order uncompleted or falsely cancel it as "Customer refused / unavailable". |
| **R4** | Redundant Two-Step Drop-Off Completion Traps Orders in `ARRIVED` | 🟠 P1 (Incomplete Order Abandonment) | In `ActionControls.tsx:630-660`, entering the correct handoff code verifies the code, but does **not** complete the delivery. The button flips to "Mark delivered". If a courier on a busy run enters the code, hands over the food/goods, and rides away without tapping the second button, the order sits in `ARRIVED` forever. The customer never receives a delivery notification, the appointment never closes (`tg_complete_appointment_on_delivery` triggers only on `DELIVERED`), and the batch cannot close. |
| **R5** | Route Optimization Ignores Store Pickup Point & Directs Rider to Drop-Off Directly | 🟠 P1 (Routing & Logistics Flaw) | In `computeNearestNeighborOrder` (`DeliveryConsole.tsx:86-104`), stops are sorted starting from the courier's GPS location directly through the drop-off coordinates. It completely ignores the store pickup location. A courier 5 km away is routed directly to Customer 1 without ever stopping at the merchant's store to pick up the parcels. `DeliveryConsole.tsx` provides zero store pickup navigation or store address details. |
| **R6** | In-App Navigation Destroys Background GPS Tracking | 🟠 P1 (Broken Live Tracking) | In `DeliveryConsole.tsx:254`, `useEffect(() => () => { void backgroundLocation.stop(); }, []);` stops background location tracking the moment `DeliveryConsole` unmounts. If the courier switches to in-app chats (`/chats`) or settings, background location terminates immediately, leaving customers and merchants with a frozen marker. |
| **R7** | Unaccepted Solo Assignments Trap Agents On-Duty with No Decline Path | 🟠 P1 (Forced Duty & Inescapable Dispatch) | When an owner assigns a solo delivery via `DeliveryAssignControl`, it immediately writes `status = 'ASSIGNED'` without agent acceptance. Unlike batched runs, solo deliveries in `DeliveryConsole.tsx` have no "Decline" button. In `set_delivery_duty` (`20260862_delivery_agent_duty.sql:63`), any `ASSIGNED` delivery blocks the agent from going off duty. An agent assigned a solo job without consent is held hostage on duty with no way out short of filing an undeliverable incident report. |
| **R8** | 5-Second Synchronous GPS Timeout Freezes UI on Every Status Advance | 🟡 P2 (Touch Latency & UI Freeze) | In `advance` (`DeliveryConsole.tsx:256-270`), every status advance button ("Start this stop", "I've arrived", "Mark delivered") awaits `getGPS()` with a 5000ms timeout (`DeliveryConsole.tsx:33`). In basements, elevators, or dense apartment lobbies, the button freezes on `"…"` for 5 seconds waiting for a GPS fix before proceeding. |
| **R9** | Customer Delivery Notes, Windows & Item Summaries Stripped | 🟡 P2 (Delivery Instructions Blindspot) | In `my_deliveries` (`20260848_delivery_batches_phase4.sql:413-446`), customer booking notes (`notes`, e.g. "Leave with guard, ring bell twice"), requested delivery window (`requested_delivery_window`), and package/item summaries are completely omitted from the query return. Couriers have zero access to customer drop-off instructions. |
| **R10** | Batch-Wide Emergency / Incident Exit Missing | 🟡 P2 (Emergency Safety Hazard) | In `RunCard.tsx:761-768`, `Can't deliver this stop?` only cancels the single active stop. If a courier has a flat tire, bike breakdown, or medical emergency during a 5-stop run, they are forced to go through 5 sequential multi-tap cancellations to release all stops before the system permits them to go off-duty. |
| **R11** | Immediate Console Ejection upon Completing Last Assigned Delivery | 🟡 P2 (Premature Route Kickout) | In `RequireDeliveryAgent.tsx:29-34`, access requires `hasDeliveryScope` OR `hasActiveAssignment > 0`. For a team member without the explicit `'delivery'` role preset (e.g. front desk or general staff), completing their final delivery drops `activeCount` to 0. `RequireDeliveryAgent` immediately redirects them to `/home`, ejecting them before they can view their completed history or manage off-duty status. |
| **R12** | Hardcoded System Notification Copy & Dark Mode Tokens | 🟢 P3 (Design & Copy Polish) | In `backgroundLocation.ts:71-73`, the system notification reads `"Sharing your live location with My People. Open STRYT to stop."` (leftover copy from the safety feature). In `DeliveryConsole.tsx:389, 556, 832`, hardcoded `#fff` values break theme tokens. |

---

## Detailed Gap Analyses

---

### #R1 — NewRunGate Fullscreen Gate Hijacks Console, Blocking In-Flight Active Deliveries

**Area:** `src/screens/delivery/DeliveryConsole.tsx:340-363, 500-607`  
**Severity:** 🔴 P0 (Critical Operational Hazard)

**Root cause:**
1. In `DeliveryConsole.tsx:340-363`:
   ```tsx
   // One primary action at a time: a pending run intercepts the whole console until
   // it's accepted or declined — nothing else competes with that decision.
   if (pendingBatch) {
     return (
       <div className="screen screen-boxed">
         <NewRunGate
           batch={pendingBatch}
           busy={decidingBatch === pendingBatch.batchId}
           queuePosition={1}
           queueTotal={pendingBatches.length}
           nextBatch={pendingBatches[1] ?? null}
           soloWaiting={soloAssigned.length}
           onAccept={() => acceptRun(pendingBatch)}
           onDecline={() => declineRun(pendingBatch)}
         />
   ```
2. While the intention was to prioritize decisions on new runs, this unconditional early return completely blocks rendering of the main console if ANY `pendingBatch` exists.
3. Scenario on the road:
   - A courier is actively delivering Order A (in `EN_ROUTE` or `ARRIVED` status).
   - The merchant at the shop dispatches a new batch (Batch B) for later in the day.
   - The courier arrives at Order A's doorstep, unlocks their phone, and opens STRYT to view the apartment number or enter the handoff code.
   - The screen is completely hijacked by `<NewRunGate />` demanding an immediate decision on Batch B!
   - The courier cannot access Order A's card, cannot view the address, and cannot verify handoff without first accepting or declining Batch B.

**Fix Recommendation:**
1. Do not replace the entire screen when `pendingBatch` exists if the courier currently has active in-flight work (`activeBatches.length > 0 || soloActive.length > 0`).
2. Instead, render incoming runs as an expandable banner or modal sheet with a "Review Later" or minimize action, keeping the active in-progress delivery front and center.

---

### #R2 — Zero Customer & Shop Phone Numbers in Entire Delivery Console

**Area:** `supabase/migrations/20260848_delivery_batches_phase4.sql:413-435`, `src/screens/delivery/DeliveryConsole.tsx:609-664, 743-802, 865-933`  
**Severity:** 🔴 P0 (Communication Void & Delivery Blocker)

**Root cause:**
1. In `my_deliveries` RPC (`20260848_delivery_batches_phase4.sql:413-435`):
   ```sql
   select d.id, d.appointment_id, d.business_id, b.name,
     case when d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
          then coalesce(a.customer_name, cu.name, 'Customer')
          else coalesce(cu.alias, 'Customer') end,
     cu.area, a.delivery_address_line, a.delivery_lat, a.delivery_lng,
     a.scheduled_for, a.date_label, a.time_label,
     d.status, d.live_status,
     null::text,
     d.handoff_verified, d.lat, d.lng,
     d.batch_id, d.stop_order, batch.status, batch.lat, batch.lng,
     d.created_at, d.delivered_at
   from public.appointment_deliveries d
   join public.appointments a on a.id = d.appointment_id
   left join public.businesses b on b.id = d.business_id
   left join public.users cu on cu.id = a.customer_user_id
   ```
2. The RPC selects `cu.area` and `a.delivery_address_line`, but **never selects `a.customer_phone` or `cu.phone`**, nor does it select `b.phone`.
3. In `DeliveryConsole.tsx`, grep confirms there is **zero usage of `Phone` or `tel:`**.
4. Real-world impact:
   - Couriers in Indian cities frequently face complex building navigation, gated community guards, or missing landmark directions.
   - A courier standing at an apartment gate has no phone number to call the customer and no phone number to call the shop.
   - The only option available in the UI is "Can't deliver this stop?", cancelling the order and destroying customer trust.

**Fix Recommendation:**
1. In `my_deliveries` RPC, add `coalesce(a.customer_phone, cu.phone) as customer_phone` and `b.phone as business_phone` to the return signature.
2. In `DeliveryItem` interface and mapping, add `customerPhone` and `businessPhone`.
3. In `RunCard.tsx` and `DeliveryCard.tsx`, add a prominent "Call customer" button (`href={`tel:${current.customerPhone}`}`) and a secondary "Call shop" button.

---

### #R3 — Unverified Handoff Deadlock with Zero Customer Code Fallback

**Area:** `src/screens/delivery/DeliveryConsole.tsx:624-638`, `supabase/migrations/20260848_delivery_batches_phase4.sql:215-217`  
**Severity:** 🟠 P1 (Customer Handoff Deadlock)

**Root cause:**
1. In `appointment_update_delivery_status` (`20260848_delivery_batches_phase4.sql:215-217`):
   ```sql
   if p_status = 'DONE' and v_row.handoff_code is not null and not v_row.handoff_verified then
     raise exception 'HANDOFF_NOT_VERIFIED';
   end if;
   ```
2. Every delivery has a non-null `handoff_code` automatically minted at assignment.
3. In `ActionControls.tsx:624-638`:
   ```tsx
   if (current.status === "ARRIVED" && !current.handoffVerified) {
     return (
       <div className="col gap-8">
         <div className="tiny muted">Ask the customer for their handoff code to confirm you reached the right person.</div>
         <HandoffCodeInput value={code} onChange={setCode} disabled={verifying} />
         <button ... onClick={async () => { ... await onVerify(current, code); }}>
           Confirm handoff
         </button>
       </div>
     );
   }
   ```
4. If the customer's phone died, or they cannot access the STRYT app, or an elderly person or domestic worker answers the door without the smartphone:
   - There is NO fallback button (e.g. "Customer cannot find code / call shop to verify").
   - The courier cannot mark the delivery as completed.
   - The courier's only choice is to tap "Can't deliver this stop?", triggering an erroneous cancellation of a physically fulfilled order.

**Fix Recommendation:**
1. Provide an in-app fallback flow: "Customer can't find code?" allowing the courier to call the customer or request a shop manager override.
2. Allow a manager with `'appointments'` scope to verify or waive the handoff code from `BusinessDeliveries.tsx`.

---

### #R4 — Redundant Two-Step Drop-Off Completion Traps Orders in `ARRIVED`

**Area:** `src/screens/delivery/DeliveryConsole.tsx:624-663`, `supabase/migrations/20260879_complete_appointment_on_delivery.sql:33-49`  
**Severity:** 🟠 P1 (Incomplete Order Abandonment)

**Root cause:**
1. In `ActionControls.tsx:624-662`:
   - Step 1: In `ARRIVED` status, courier enters 6-digit code and taps "Confirm handoff".
   - `confirm_handoff` RPC executes: `update appointment_deliveries set handoff_verified = true`.
   - Step 2: Once verified, `ActionControls` changes to render:
     ```tsx
     {current.status === "ARRIVED" && current.handoffVerified && (
       <button className="btn btn-primary grow" disabled={busy} onClick={() => onAdvance(current, "DONE", "Delivered ✓")}>
         {busy ? "…" : "Mark delivered"}
       </button>
     )}
     ```
2. The courier must tap a second button ("Mark delivered") to complete the delivery!
3. On a busy delivery run, couriers routinely enter the code, hand over the package, and immediately get back on their motorcycle without noticing the second button.
4. Because the status remains `ARRIVED`:
   - Trigger `tg_complete_appointment_on_delivery` does NOT fire (it requires `new.status = 'DELIVERED'`).
   - The batch does not close.
   - The customer never gets a "Delivered" notification.
   - The booking stays open on the merchant console.

**Fix Recommendation:**
1. Once `confirm_handoff` succeeds, automatically trigger `onAdvance(current, "DONE", "Delivered ✓")` in the same sequence without requiring a redundant second tap.

---

### #R5 — Route Optimization Ignores Store Pickup Point & Directs Rider to Drop-Off Directly

**Area:** `src/screens/delivery/DeliveryConsole.tsx:86-104, 311-314`  
**Severity:** 🟠 P1 (Routing & Logistics Flaw)

**Root cause:**
1. In `DeliveryConsole.tsx:86-104`:
   ```ts
   function computeNearestNeighborOrder(start: { lat: number; lng: number }, stops: DeliveryItem[]): DeliveryItem[] {
     ...
     let current = start; // Courier's GPS position
     while (remaining.length) {
       let bestIdx = 0;
       let bestDist = Infinity;
       for (let i = 0; i < remaining.length; i++) {
         const dist = haversineKm(current.lat, current.lng, remaining[i].deliveryLat!, remaining[i].deliveryLng!);
         if (dist < bestDist) { bestDist = dist; bestIdx = i; }
       }
       const next = remaining.splice(bestIdx, 1)[0];
       ordered.push(next);
       current = { lat: next.deliveryLat!, lng: next.deliveryLng! };
     }
     return [...ordered, ...withoutCoords];
   }
   ```
2. `start` is the courier's live location.
3. In a real-world dispatch flow, the courier is not currently holding the items—the items are at the merchant's shop!
4. If the courier is 4 km away from the shop, but 500 meters from Customer 2, nearest-neighbor routes them to Customer 2 first, before they have visited the store to pick up the packages!
5. Furthermore, `DeliveryConsole.tsx` provides zero navigation button to the shop, zero pickup checklist, and zero shop address.

**Fix Recommendation:**
1. Include the business location (`b.lat, b.lng`) as Step 0 (Pickup) in the route ordering calculation.
2. In `RunCard` and `DeliveryCard`, show a "Pickup from {businessName}" card with a "Navigate to shop" button before the courier transitions to drop-offs.

---

### #R6 — In-App Navigation Destroys Background GPS Tracking

**Area:** `src/screens/delivery/DeliveryConsole.tsx:225-254`, `src/lib/backgroundLocation.ts:54-93`  
**Severity:** 🟠 P1 (Broken Live Tracking)

**Root cause:**
1. In `DeliveryConsole.tsx:254`:
   ```tsx
   useEffect(() => () => { void backgroundLocation.stop(); }, []);
   ```
2. In React Router, navigating to `/chats`, `/settings`, or `/account` unmounts `DeliveryConsole`.
3. Unmounting executes the cleanup function, which calls `backgroundLocation.stop()`.
4. While the courier is chatting with a customer or looking at app settings, live tracking stops streaming coordinates to Supabase.
5. In addition, when the app is backgrounded to use external Google Maps, if the Android OS puts the WebView to sleep, background location depends on Capgo's `@capgo/background-geolocation` native foreground service. But `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is currently commented out in `AndroidManifest.xml` (`features.ts:22`), causing aggressive OEM battery managers to kill the process after 2-3 minutes.

**Fix Recommendation:**
1. Move the background location tracking coordinator to an app-level provider (`App.tsx` or a persistent service worker / hook) so that navigating between tabs within STRYT does not stop tracking while a delivery is active.
2. Re-enable battery optimization exemptions in `AndroidManifest.xml` for production builds.

---

### #R7 — Unaccepted Solo Assignments Trap Agents On-Duty with No Decline Path

**Area:** `src/screens/delivery/DeliveryConsole.tsx:148, 468-471`, `supabase/migrations/20260862_delivery_agent_duty.sql:60-74`  
**Severity:** 🟠 P1 (Forced Duty & Inescapable Dispatch)

**Root cause:**
1. In `supabase/migrations/20260862_delivery_agent_duty.sql:60-74`:
   ```sql
   select count(*) into v_active_count
   from public.appointment_deliveries d
   where d.agent_user_id = v_uid
     and d.status in ('ASSIGNED', 'EN_ROUTE', 'ARRIVED');
   if v_active_count > 0 then
     raise exception 'Finish your current delivery before going off duty.';
   end if;
   ```
2. When an owner assigns a solo delivery via `DeliveryAssignControl`, it immediately creates an `appointment_deliveries` row with `status = 'ASSIGNED'`.
3. In `DeliveryConsole.tsx`:
   - Batch runs have `NewRunGate` with an explicit "Decline" button.
   - Solo deliveries in the `ASSIGNED` tab have NO "Decline" button—only "Start delivery" and "Can't deliver?".
4. Because the unaccepted delivery is in `ASSIGNED` status, `set_delivery_duty(false)` throws an exception.
5. The agent cannot decline the delivery, cannot go off duty, and is forced to file a false "Can't deliver" incident report to free their account.

**Fix Recommendation:**
1. Add a "Decline assignment" button on `DeliveryCard` when `d.status === "ASSIGNED"`, which deletes the unstarted delivery row or marks it declined so the owner can reassign.
2. Only block off-duty status for deliveries that are genuinely `EN_ROUTE` or `ARRIVED`.

---

### #R8 — 5-Second Synchronous GPS Timeout Freezes UI on Every Status Advance

**Area:** `src/screens/delivery/DeliveryConsole.tsx:27-35, 256-270`  
**Severity:** 🟡 P2 (Touch Latency & UI Freeze)

**Root cause:**
1. In `DeliveryConsole.tsx:28-35`:
   ```ts
   function getGPS(): Promise<{ lat: number; lng: number } | null> {
     return new Promise((res) =>
       nativeGeolocation.getCurrentPosition(
         (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
         () => res(null),
         { timeout: 5000 },
       ),
     );
   }
   ```
2. In `advance()` (line 260): `const c = await getGPS();`.
3. If the courier is in an elevator, basement parking, or building corridor with weak GPS signals, `getCurrentPosition` stalls for the full 5000ms timeout before giving up and resolving null.
4. The button displays `"…"` with no feedback, making the app feel unresponsive or crashed.

**Fix Recommendation:**
1. Use cached GPS coordinates if available within the last 15 seconds, or reduce the initial GPS timeout to 1500ms before falling back to asynchronous position updates.

---

### #R9 — Customer Delivery Notes, Windows & Item Summaries Stripped

**Area:** `supabase/migrations/20260848_delivery_batches_phase4.sql:413-446`, `src/screens/delivery/DeliveryConsole.tsx:750-756`  
**Severity:** 🟡 P2 (Delivery Instructions Blindspot)

**Root cause:**
1. The `appointments` table contains `notes`, `requested_delivery_window`, and `package_name`.
2. In `my_deliveries` RPC (`20260848_delivery_batches_phase4.sql`), none of these columns are selected.
3. Couriers cannot see instructions such as "Do not ring bell, newborn sleeping" or "Gate code #4492".

**Fix Recommendation:**
1. Include `a.notes as delivery_notes`, `a.requested_delivery_window`, and `a.package_name` in `my_deliveries`.
2. Render delivery notes prominently in `RunCard` and `DeliveryCard`.

---

### #R10 — Batch-Wide Emergency / Incident Exit Missing

**Area:** `src/screens/delivery/DeliveryConsole.tsx:761-768`, `src/components/delivery/CantDeliverSheet.tsx:37-43`  
**Severity:** 🟡 P2 (Emergency Safety Hazard)

**Root cause:**
1. In `RunCard.tsx:761-768`, `Can't deliver this stop?` is strictly scoped to `current` (one stop).
2. If a courier has an accident or bike breakdown with 6 stops remaining on their run:
   - They must cancel Stop 1, wait for the sheet to close, cancel Stop 2, wait, cancel Stop 3... repeating 6 times.
   - Meanwhile, `set_delivery_duty` prevents them from going off-duty until all 6 stops are individually cancelled.

**Fix Recommendation:**
1. Add a "Report incident / Stop run" action on `RunCard` that allows cancelling the entire remaining run with reason `AGENT_EMERGENCY` or `UNSAFE` in a single operation.

---

### #R11 — Immediate Console Ejection upon Completing Last Assigned Delivery

**Area:** `src/components/RequireDeliveryAgent.tsx:29-35`  
**Severity:** 🟡 P2 (Premature Route Kickout)

**Root cause:**
1. In `RequireDeliveryAgent.tsx:29-35`:
   ```tsx
   const hasDeliveryScope = (sessions ?? []).some(
     (s) => s.status === "ACTIVE" && (s.scopes ?? []).includes("delivery" as any),
   );
   const hasActiveAssignment = (activeCount ?? 0) > 0;

   if (!hasDeliveryScope && !hasActiveAssignment) return <Navigate to="/home" replace />;
   ```
2. When a staff member assigned an ad-hoc delivery marks it delivered, `activeCount` becomes 0.
3. If they don't have the explicit `'delivery'` scope preset, the guard immediately navigates to `/home`, preventing them from seeing the delivery confirmation or accessing the History tab.

**Fix Recommendation:**
1. Allow access if the user has any delivery records in `my_deliveries` within the past 24 hours, or grant temporary session persistence.

---

### #R12 — Hardcoded System Notification Copy & Dark Mode Tokens

**Area:** `src/lib/backgroundLocation.ts:71-73`, `src/screens/delivery/DeliveryConsole.tsx:389, 556, 832`  
**Severity:** 🟢 P3 (Design & Copy Polish)

**Root cause:**
1. In `backgroundLocation.ts:71-73`, the system notification text reads `"Sharing your live location with My People. Open STRYT to stop."`.
2. In `DeliveryConsole.tsx:389, 556, 832`, hardcoded `#fff` hex codes break theme compliance.

**Fix Recommendation:**
1. Pass dynamic notification titles (`"STRYT Delivery in progress"`) into `backgroundLocation.start()`.
2. Replace hardcoded `#fff` with theme tokens.

---

## Verification Plan

### Automated Tests
```bash
npx tsc --noEmit
```

### Manual Flow Verification
1. **In-Flight Incoming Dispatch Test:** With one delivery active in `EN_ROUTE` status, assign a new batch to the agent. Verify the active delivery remains visible, navigable, and verifiable without forced gate interception.
2. **Contact Customer & Shop Test:** Open `/delivery`. Verify that "Call customer" and "Call shop" buttons are present on active delivery cards and dial the correct phone numbers.
3. **Emergency Run Cancellation Test:** During an active multi-stop run, trigger an agent emergency cancel. Verify the entire run is safely unassigned/cancelled in a single action, notifying the shop and freeing the agent to go off-duty.
