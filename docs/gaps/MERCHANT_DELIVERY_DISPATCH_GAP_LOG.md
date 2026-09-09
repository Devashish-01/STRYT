# Merchant Order Delivery Dispatch — Bug & Gap Log

**Purpose:** Documenting every architectural defect, permission blocker, multi-agent batch corruption bug, real-time map tracking failure, and dispatching UX hazard in **Flow 5.1: Merchant Order Delivery Dispatch** (`src/screens/business/manage/BusinessDeliveries.tsx`, `src/screens/business/manage/BusinessAppointments.tsx`, `src/components/delivery/DeliveryAssignControl.tsx`, `src/components/delivery/CantDeliverSheet.tsx`, `src/services/engagement/deliveryService.ts`, and Supabase migrations `20260845_delivery_agent_phase1_groundwork.sql`, `20260848_delivery_batches_phase4.sql`, `20260852_business_active_deliveries.sql`, `20260853_customer_delivery_progress_only.sql`, `20260863_business_active_deliveries_agent_position.sql`, `20260871_team_console_delivery.sql`, `20260872_delivery_cancellation.sql`, `20260873_delivery_solo_position.sql`, `20260879_complete_appointment_on_delivery.sql`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **D1** | Reassigning a Batched Delivery Corrupts Batch Tracking & Permanently Traps Couriers On-Duty | 🔴 P0 (State & Run Integrity Corruption) | In `assign_delivery` (`20260871_team_console_delivery.sql:40-42`), when an owner reassigns an active stop via `DeliveryAssignControl`, the query updates `agent_user_id = p_agent_user_id` but **never clears `batch_id` or `stop_order`**. The reassigned stop remains bound to the old courier's batch. Consequently: (1) The old courier's batch can never complete because one stop is held by a new agent; (2) The old courier is permanently trapped on duty (`my_duty_blockers` sees active batch `IN_PROGRESS`); (3) In `business_active_deliveries`, the stop displays the old courier's GPS location; (4) In `my_deliveries`, the new courier is locked out of delivering the order because it awaits batch acceptance by the old courier. |
| **D2** | Criss-Crossing Multi-Agent Polyline Spiderweb & Frozen Map Center | 🟠 P1 (Map & Route Visual Corruption) | In `BusinessDeliveries.tsx:126-129`, `routeLine` flattens all `agentPoints` and `stopPoints` into a single polyline array (`[...agentPoints, ...stopPoints]`). When multiple riders are active, Leaflet draws a bizarre line connecting Rider A to Rider B across town, and then connecting Rider B to Rider A's customer stop. Additionally, `MapContainer` does not re-center when selecting different cards or changing agent filters because Leaflet requires dynamic controller hooks (`useMap().setView`). |
| **D3** | Zero Realtime Movement Updates for Batched Delivery Runs | 🟠 P1 (Broken Realtime Tracking) | In `BusinessDeliveries.tsx:63-68`, `useQueryWithRealtime` only subscribes to table `"appointment_deliveries"`. When an agent rides with a batched delivery run, GPS coordinates are streamed via `update_delivery_batch_position`, which exclusively updates `public.delivery_batches` (`20260848_delivery_batches_phase4.sql:184-186`). Because `BusinessDeliveries.tsx` does not listen to `delivery_batches`, the store owner's "Live Deliveries" map never receives real-time GPS pings while couriers are riding, remaining frozen until a status button is tapped. |
| **D4** | Missing Customer Phone & Order Items on Delivery Cards | 🟠 P1 (Merchant Contact & Dispatch Blindspot) | In `business_active_deliveries` (`20260863_business_active_deliveries_agent_position.sql:18-31`), the RPC returns `agent_phone` and `customer_name`, but completely omits `customer_phone` and order details (package/service name, quantity, price). In `BusinessDeliveries.tsx:300-315`, there is only a "Call agent" button; the merchant has zero customer phone numbers, no in-context chat link, and no order summary if a delivery runs late or faces address issues. |
| **D5** | Silent Cancellation Reason Stripping in Storefront Console | 🟠 P1 (Audit & Operations Blindspot) | While migration `20260872_delivery_cancellation.sql` added `cancel_reason`, `cancel_note`, `cancelled_by`, and `cancelled_at` to `appointment_deliveries`, `business_active_deliveries` was never updated to return these columns. In `BusinessDeliveries.tsx:224-243`, cancelled orders appear under "Recently finished" with a generic checkmark icon and no explanation, leaving the merchant blind to driver emergencies or customer refusals. |
| **D6** | Scope & RLS Disparity Locks Out Front Desk & Store Managers from `delivery_batches` | 🟠 P1 (Role Permission Blocker) | In `20260848_delivery_batches_phase4.sql:39-43`, `delivery_batches_select` policy strictly requires `agent_user_id = auth.uid()` or `public.has_business_scope(business_id, auth.uid(), 'delivery')`. The "Front Desk" preset (`['appointments', 'queue']`) and "Full Access" preset (`['appointments', 'queue', 'catalog', 'leads']`) omit `'delivery'`. Front-desk team members who manage bookings at `/business/:id/manage/deliveries` (gated by `appointments` scope in `App.tsx:681`) cannot read or subscribe to `delivery_batches`. |
| **D7** | Batch Creation Fails Blindly on Already-Assigned Bookings | 🟡 P2 (Silent Batch Dispatch Failure) | In `BusinessAppointments.tsx:657`, in `deliverySelectMode`, checkboxes are enabled for any appointment with `apt.status === "ACCEPTED"`. If an appointment already has an active delivery assigned, the backend RPC `assign_delivery_batch` (`20260871_team_console_delivery.sql:85`) aborts with `SOME_APPOINTMENTS_NOT_ELIGIBLE`. The UI does not mark or disable already-assigned appointments, resulting in a generic failure toast with no explanation. |
| **D8** | N+1 Query Avalanche on Deliveries Tab in `BusinessAppointments.tsx` | 🟡 P2 (Performance & Rate Limit Threat) | On `BusinessAppointments.tsx:525`, every rendered delivery card mounts `<DeliveryAssignControl appointmentId={apt.id} businessId={id} />`. Each instance initiates queries to `deliveryService.forAppointment(apt.id)` and `deliveryService.deliveryTeam(id)`. For 30 delivery appointments, 90+ concurrent database requests fire on opening the Deliveries tab. |
| **D9** | Navigation Disconnection Between Appointment Dispatching and Live Tracking | 🟡 P2 (Navigation Dead End) | In `BusinessAppointments.tsx` (the Deliveries tab), there is no CTA or link to "View Live Map / Track Deliveries" (`/business/:id/manage/deliveries`). In `BusinessDeliveries.tsx`, the empty state instructs the user to "Assign a delivery from the Bookings → Deliveries tab", but provides no button or route link. In `ManageNav.tsx`, `/manage/deliveries` is omitted from bottom navigation. |
| **D10** | Single `assign_delivery` Allows Disagreeing Fulfillment Types & Terminal Bookings | 🟡 P2 (Data Integrity Violation) | Unlike `assign_delivery_batch` (which validates `a.fulfillment_type = 'DELIVERY' AND a.status = 'ACCEPTED'`), single `assign_delivery` (`20260871_team_console_delivery.sql:24-46`) performs no checks on `fulfillment_type` or appointment status. A merchant can invoke `assign_delivery` on an `IN_STORE` walk-in or a cancelled appointment. |
| **D11** | Hardcoded `#fff` Tokens in Batch Selection UI and Sheets | 🟢 P3 (Design System) | In `BusinessAppointments.tsx:665, 669, 884, 892` and `CantDeliverSheet.tsx:170, 220`, hardcoded `#fff` values for checkbox backgrounds, button text, and sheet surfaces break dark mode styling. |

---

## Detailed Gap Analyses

---

### #D1 — Reassigning a Batched Delivery Corrupts Batch Tracking & Permanently Traps Couriers On-Duty

**Area:** `supabase/migrations/20260871_team_console_delivery.sql:37-46`, `src/components/delivery/DeliveryAssignControl.tsx:24-36`, `src/screens/business/manage/BusinessDeliveries.tsx:321-324`  
**Severity:** 🔴 P0 (State & Run Integrity Corruption)

**Root cause:**
1. In `supabase/migrations/20260871_team_console_delivery.sql`:
   ```sql
   select * into v_row from public.appointment_deliveries
     where appointment_id = p_appointment_id and status in ('ASSIGNED','EN_ROUTE','ARRIVED') for update;
   if found then
     update public.appointment_deliveries
        set agent_user_id = p_agent_user_id, status = 'ASSIGNED', handoff_verified = false, handoff_code = v_code
      where id = v_row.id returning * into v_row;
   else
     insert into public.appointment_deliveries (appointment_id, business_id, agent_user_id, status, handoff_code)
     values (p_appointment_id, v_biz, p_agent_user_id, 'ASSIGNED', v_code) returning * into v_row;
   end if;
   ```
2. When an owner reassigns a delivery that was originally dispatched as part of a batch (`v_row.batch_id IS NOT NULL`):
   - `assign_delivery` updates `agent_user_id = p_agent_user_id` (the new courier).
   - It **does not set `batch_id = NULL` or `stop_order = NULL`**!
3. This creates a severe foreign-state collision:
   - The delivery row now has `agent_user_id = NewAgent`, but `batch_id = OldAgent_Batch`.
   - In `20260848_delivery_batches_phase4.sql:193-206` (`appointment_update_delivery_status`) and `20260879_complete_appointment_on_delivery.sql`, batch auto-completion counts active stops:
     ```sql
     select count(*) into v_remaining
       from public.appointment_deliveries
      where batch_id = v_row.batch_id
        and status in ('ASSIGNED','EN_ROUTE','ARRIVED');
     ```
     Because this stop is now assigned to `NewAgent`, `OldAgent` cannot update or deliver it (`appointment_update_delivery_status` enforces `v_uid = v_row.agent_user_id`).
   - `OldAgent`'s batch status can never reach `COMPLETED` while `NewAgent` is handling the delivery.
   - In `20260872_delivery_cancellation.sql:202-208` (`my_duty_blockers`), `set_delivery_duty` blocks `OldAgent` from going off duty because `OldAgent_Batch` remains in `IN_PROGRESS` indefinitely!
   - In `business_active_deliveries` (`20260863_business_active_deliveries_agent_position.sql:50`), the query executes:
     `coalesce(batch.lat, d.lat), coalesce(batch.lng, d.lng), batch.heading`
     Because `batch_id` still points to `OldAgent_Batch`, the map displays **OldAgent's live GPS coordinates** under **NewAgent's avatar and name**!
   - In `my_deliveries` (`20260848_delivery_batches_phase4.sql:434`), `NewAgent` receives `batch_status = OldAgent_Batch.status`. If `OldAgent_Batch` was still `PENDING_ACCEPTANCE`, `NewAgent` cannot deliver their stop because the agent console disables actions until the batch is accepted—which `NewAgent` cannot do!

**Fix Recommendation:**
1. In `assign_delivery`, explicitly reset batch linkage upon reassignment:
   ```sql
   if found then
     -- Check if this delivery was previously part of a batch
     if v_row.batch_id is not null and v_row.agent_user_id is distinct from p_agent_user_id then
       -- Disassociate from old batch
       v_row.batch_id := null;
       v_row.stop_order := null;
     end if;

     update public.appointment_deliveries
        set agent_user_id = p_agent_user_id,
            status = 'ASSIGNED',
            handoff_verified = false,
            handoff_code = v_code,
            batch_id = null,
            stop_order = null
      where id = v_row.id returning * into v_row;
   ```
2. If removing a stop from `OldAgent_Batch` leaves that batch with zero remaining active deliveries, automatically mark the batch as `COMPLETED`.

---

### #D2 — Criss-Crossing Multi-Agent Polyline Spiderweb & Frozen Map Center

**Area:** `src/screens/business/manage/BusinessDeliveries.tsx:99-130, 161-181`  
**Severity:** 🟠 P1 (Map & Route Visual Corruption)

**Root cause:**
1. In `BusinessDeliveries.tsx:126-129`:
   ```tsx
   const routeLine: [number, number][] = [
     ...agentPoints.map((a) => [a.lat, a.lng] as [number, number]),
     ...stopPoints.map((s) => [s.deliveryLat!, s.deliveryLng!] as [number, number]),
   ];
   ```
2. When the merchant is viewing "All agents" (`agentFilter === "ALL"`):
   - If Agent 1 is in Indiranagar and Agent 2 is in Koramangala, `routeLine` draws a line from Agent 1 to Agent 2.
   - It then continues the line from Agent 2 across the city to Agent 1's customer in Indiranagar, and then back to Agent 2's customer in Koramangala.
   - The resulting polyline is a criss-crossing spiderweb with zero navigational or operational meaning.
3. In `BusinessDeliveries.tsx:162-179`:
   - React-Leaflet's `<MapContainer center={mapCenter} ...>` only initializes the center on first render.
   - When the merchant filters by an agent or taps on a specific delivery card (`focusedId`), the map does NOT pan or fly to that delivery location.
   - Markers have no click listeners, tooltips, or popups, making the map completely static and non-interactive.

**Fix Recommendation:**
1. In `BusinessDeliveries.tsx`, only draw `routeLine` when filtering to a single agent (`agentFilter !== "ALL"`), and sort stops strictly by `stopOrder` for that agent:
   ```tsx
   const routeLine: [number, number][] = useMemo(() => {
     if (agentFilter === "ALL" || agentPoints.length === 0) return [];
     const agent = agentPoints[0];
     return [
       [agent.lat, agent.lng],
       ...stopPoints.map((s) => [s.deliveryLat!, s.deliveryLng!] as [number, number]),
     ];
   }, [agentFilter, agentPoints, stopPoints]);
   ```
2. Add a `MapController` helper using Leaflet's `useMap()` to smoothly pan and zoom when `mapCenter` or `focusedId` changes.
3. Add `Popup` or `Tooltip` components to markers displaying customer name, address, and stop number.

---

### #D3 — Zero Realtime Movement Updates for Batched Delivery Runs in Storefront Console

**Area:** `src/screens/business/manage/BusinessDeliveries.tsx:63-68`, `supabase/migrations/20260848_delivery_batches_phase4.sql:174-188`  
**Severity:** 🟠 P1 (Broken Realtime Tracking)

**Root cause:**
1. In `BusinessDeliveries.tsx:63-68`:
   ```tsx
   const { data, loading, error, refetch } = useQueryWithRealtime<BusinessDeliveryItem[]>(
     () => deliveryService.businessDeliveries(id),
     "appointment_deliveries",
     [id],
     `business_id=eq.${id}`,
   );
   ```
2. When couriers are on a batched delivery run, background GPS updates invoke `deliveryService.updateBatchPosition(batchId, lat, lng)`.
3. In `20260848_delivery_batches_phase4.sql:184`:
   ```sql
   update public.delivery_batches
      set lat = p_lat, lng = p_lng, accuracy = p_accuracy, heading = p_heading
    where id = p_batch_id and agent_user_id = v_uid and status in ('ACCEPTED','IN_PROGRESS');
   ```
4. `update_delivery_batch_position` updates `public.delivery_batches` table. It does **not touch `public.appointment_deliveries`**.
5. Because `BusinessDeliveries.tsx` only listens to Supabase Realtime postgres changes on `appointment_deliveries`, GPS position updates from active batched runs **never trigger a re-render or refetch**!
6. The store owner watching the live map sees delivery riders frozen at their pickup locations throughout their entire trip, until the rider physically reaches a destination and clicks "Arrived".

**Fix Recommendation:**
1. Either:
   - Add a realtime listener on `delivery_batches` for `business_id=eq.${id}` alongside `appointment_deliveries`; OR
   - Have `update_delivery_batch_position` bump an `updated_at` timestamp on child `appointment_deliveries` rows with status `EN_ROUTE` so that existing realtime subscriptions fire; OR
   - Implement polling fallback (e.g. 10s-15s interval) on `BusinessDeliveries.tsx` while active deliveries exist.

---

### #D4 — Missing Customer Phone & Order Items on Delivery Cards

**Area:** `supabase/migrations/20260863_business_active_deliveries_agent_position.sql:18-31`, `src/screens/business/manage/BusinessDeliveries.tsx:300-315`  
**Severity:** 🟠 P1 (Merchant Contact & Dispatch Blindspot)

**Root cause:**
1. `business_active_deliveries` defines the following return structure:
   ```sql
   returns table(
     id text, appointment_id text,
     status text, live_status text,
     agent_user_id text, agent_name text, agent_avatar text, agent_phone text,
     customer_name text, delivery_address_line text,
     delivery_lat double precision, delivery_lng double precision,
     delivery_eta_text text,
     scheduled_for timestamptz, date_label text, time_label text,
     batch_id text, stop_order int, batch_status text,
     agent_lat double precision, agent_lng double precision, agent_heading double precision,
     handoff_verified boolean,
     created_at timestamptz, delivered_at timestamptz
   )
   ```
2. The RPC selects `a.customer_name`, but completely ignores `a.customer_phone` or `cu.phone` and appointment service details (`a.package_name`, `a.package_price`, `a.notes`).
3. In `BusinessDeliveries.tsx:301-305`:
   ```tsx
   {d.agentPhone && (
     <a className="btn btn-outline btn-sm grow row gap-6 center" href={`tel:${d.agentPhone}`}>
       <Phone size={13} /> Call agent
     </a>
   )}
   ```
4. If a delivery agent calls the shop reporting that the customer's gate is locked, or if the customer calls asking where their food/parcel is, the merchant has:
   - No customer phone number to dial.
   - No way to see what items or packages are in this order without opening another tab, navigating to Appointments, and searching for the customer.

**Fix Recommendation:**
1. In `business_active_deliveries`, add `customer_phone text`, `package_name text`, and `package_price numeric` to the return signature.
2. In `BusinessDeliveryItem`, add `customerPhone`, `packageName`, and `packagePrice`.
3. In `DeliveryRow`, render a "Call customer" button (`href={`tel:${d.customerPhone}`}`) and display the order items and total.

---

### #D5 — Silent Cancellation Reason Stripping in Storefront Console

**Area:** `supabase/migrations/20260872_delivery_cancellation.sql:31-36`, `supabase/migrations/20260863_business_active_deliveries_agent_position.sql:18-31`, `src/screens/business/manage/BusinessDeliveries.tsx:224-243`  
**Severity:** 🟠 P1 (Audit & Operations Blindspot)

**Root cause:**
1. Migration `20260872_delivery_cancellation.sql` introduced cancellation tracking:
   ```sql
   alter table public.appointment_deliveries
     add column if not exists cancelled_at  timestamptz,
     add column if not exists cancelled_by  text,
     add column if not exists cancel_reason text,
     add column if not exists cancel_note   text;
   ```
2. However, `business_active_deliveries` was created in `20260863` and **was never updated to return these 4 cancellation columns**.
3. In `BusinessDeliveries.tsx:224-243`:
   ```tsx
   {done.map((d) => (
     <div key={d.id} className="card row gap-10 center-v" style={{ padding: 11, opacity: 0.72 }}>
       <CheckCircle size={16} color={d.status === "DELIVERED" ? "var(--green-500)" : "var(--ink-400)"} />
       <div className="grow" style={{ minWidth: 0 }}>
         <div className="semi small ellipsis">{d.customerName}</div>
         <div className="tiny muted ellipsis">
           {d.agentName}
           {d.deliveredAt ? ` · ${new Date(d.deliveredAt).toLocaleString([], ...)}` : ""}
         </div>
       </div>
       <DeliveryStatusPill status={d.status} />
     </div>
   ))}
   ```
4. Cancelled deliveries show up in "Recently finished" with a gray checkmark (`CheckCircle`). The merchant sees no cancel reason (e.g. "CUSTOMER_UNAVAILABLE", "UNSAFE"), no note from the driver, and no cancellation timestamp.

**Fix Recommendation:**
1. Update `business_active_deliveries` to return `d.cancel_reason`, `d.cancel_note`, `d.cancelled_by`, and `d.cancelled_at`.
2. Update `BusinessDeliveryItem` interface and mapping in `deliveryService.businessDeliveries`.
3. In `BusinessDeliveries.tsx`, render an `AlertTriangle` icon with red pill for `CANCELLED` orders, displaying the formatted reason and driver note.

---

### #D6 — Scope & RLS Disparity Locks Out Front Desk & Store Managers from `delivery_batches`

**Area:** `supabase/migrations/20260848_delivery_batches_phase4.sql:39-43`, `src/screens/BusinessAccess.tsx:23-35`, `src/App.tsx:681-686`  
**Severity:** 🟠 P1 (Role Permission Blocker)

**Root cause:**
1. In `supabase/migrations/20260848_delivery_batches_phase4.sql`:
   ```sql
   CREATE POLICY delivery_batches_select ON public.delivery_batches
     FOR SELECT USING (
       agent_user_id = (auth.uid())::text
       OR public.has_business_scope(business_id, (auth.uid())::text, 'delivery')
     );
   ```
2. In `src/App.tsx:681-686`:
   ```tsx
   <Route element={<RequireScope scope="appointments" />}>
     <Route path="/business/:id/manage/appointments" element={<BusinessAppointments />} />
     <Route path="/business/:id/manage/deliveries" element={<BusinessDeliveries />} />
   </Route>
   ```
3. In `src/screens/BusinessAccess.tsx:30-35`, the "Front desk" preset grants `['appointments', 'queue']`, and the "Full access" preset grants `MANAGEMENT_SCOPES` (`['appointments', 'queue', 'catalog', 'leads']`). Neither grants `'delivery'`.
4. In `20260853_customer_delivery_progress_only.sql:106-111`, `appointment_deliveries_select` was fixed to allow scope `'appointments'`.
5. However, `delivery_batches_select` was **never updated**. Any team manager or front-desk staff with `'appointments'` scope is blocked by RLS from querying or listening to `delivery_batches`.

**Fix Recommendation:**
1. Update `delivery_batches_select` policy:
   ```sql
   DROP POLICY IF EXISTS delivery_batches_select ON public.delivery_batches;
   CREATE POLICY delivery_batches_select ON public.delivery_batches
     FOR SELECT TO authenticated USING (
       agent_user_id = (auth.uid())::text
       OR public.has_business_scope(business_id, (auth.uid())::text, 'delivery')
       OR public.has_business_scope(business_id, (auth.uid())::text, 'appointments')
     );
   ```

---

### #D7 — Batch Creation Fails Blindly on Already-Assigned Bookings

**Area:** `src/screens/business/manage/BusinessAppointments.tsx:657-670`, `supabase/migrations/20260871_team_console_delivery.sql:80-87`  
**Severity:** 🟡 P2 (Silent Batch Dispatch Failure)

**Root cause:**
1. In `BusinessAppointments.tsx:657`:
   ```tsx
   {deliverySelectMode && apt.status === "ACCEPTED" && (
     <button
       type="button"
       onClick={() => toggleSelectedForBatch(apt.id)}
       aria-label="Select for batch assignment"
       ...
     >
   ```
2. Any appointment with `apt.status === "ACCEPTED"` can be checked for a batch.
3. In `assign_delivery_batch` (`20260871_team_console_delivery.sql:80-87`):
   ```sql
   select count(*) into v_count
     from public.appointments a
     where a.id = any(p_appointment_ids)
       and a.target_type = 'BUSINESS' and a.target_id = v_biz
       and a.fulfillment_type = 'DELIVERY' and a.status = 'ACCEPTED'
       and not exists (
         select 1 from public.appointment_deliveries d
         where d.appointment_id = a.id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
       );
   if v_count <> array_length(p_appointment_ids, 1) then
     raise exception 'SOME_APPOINTMENTS_NOT_ELIGIBLE';
   end if;
   ```
4. If an owner checks 4 orders, and order #2 was already assigned to a courier earlier, the entire batch call throws `SOME_APPOINTMENTS_NOT_ELIGIBLE`.
5. The UI shows `"SOME_APPOINTMENTS_NOT_ELIGIBLE"`, giving no indication which order was already assigned.

**Fix Recommendation:**
1. Join active delivery status into the appointments list query, or check `appointment_deliveries` before allowing selection.
2. In `BusinessAppointments.tsx`, disable the checkbox for orders that already have active deliveries, displaying `"Already assigned to {agentName}"`.

---

### #D8 — N+1 Query Avalanche on Deliveries Tab in `BusinessAppointments.tsx`

**Area:** `src/components/delivery/DeliveryAssignControl.tsx:19-20`, `src/screens/business/manage/BusinessAppointments.tsx:524-526`  
**Severity:** 🟡 P2 (Performance & Rate Limit Threat)

**Root cause:**
1. In `DeliveryAssignControl.tsx:19-20`:
   ```tsx
   const { data: delivery, loading: deliveryLoading, refetch } = useQuery(() => deliveryService.forAppointment(appointmentId), [appointmentId], `delivery:for-apt:${appointmentId}`);
   const { data: team, loading: teamLoading } = useQuery(() => deliveryService.deliveryTeam(businessId), [businessId], `delivery:team:${businessId}`);
   ```
2. When the merchant opens the `DELIVERIES` tab on `BusinessAppointments.tsx`, every single delivery card mounts `DeliveryAssignControl`.
3. If 25 deliveries are visible, 25 queries execute to `deliveryService.forAppointment(apt.id)` and 25 queries execute to `deliveryService.deliveryTeam(businessId)`.
4. While `useQuery` caches by key after resolution, simultaneous mount fires all 25 requests before the first one completes, causing an N+1 storm of 50+ network requests.

**Fix Recommendation:**
1. Lift `deliveryTeam` fetching up to `BusinessAppointments.tsx` and pass `team={deliveryTeam}` down as a prop to `DeliveryAssignControl`.
2. Add bulk fetching for active deliveries (`deliveryService.forAppointments(appointmentIds)`) instead of firing single-row queries per card.

---

### #D9 — Navigation Disconnection Between Appointment Dispatching and Live Tracking

**Area:** `src/screens/business/manage/BusinessAppointments.tsx:637-677`, `src/screens/business/manage/BusinessDeliveries.tsx:206-210`, `src/screens/business/manage/ManageNav.tsx:63-68`  
**Severity:** 🟡 P2 (Navigation Dead End)

**Root cause:**
1. In `BusinessAppointments.tsx` (the Deliveries tab), merchants assign orders individually or in batches. Once assigned, there is no button or link to "View Live Map / Track Deliveries" (`/business/:id/manage/deliveries`).
2. In `BusinessDeliveries.tsx:206-210`, when no deliveries are active, the empty state reads:
   `text="Assign a delivery from the Bookings → Deliveries tab and track it here."`
   There is no button or interactive link to navigate to Bookings.
3. In `ManageNav.tsx:63-68`, the bottom navigation has an entry for `my-deliveries` (for delivery riders), but zero entry for `deliveries` (the merchant's live dispatch console).

**Fix Recommendation:**
1. In `BusinessAppointments.tsx` (Deliveries tab), add a top header action: `"🗺️ Live map"` navigating to `/business/${id}/manage/deliveries`.
2. In `BusinessDeliveries.tsx`, add an action button to the `EmptyState`: `"Go to Bookings"` (`nav('/business/${id}/manage/appointments')`).
3. In `ManageNav.tsx`, when `hasScope("appointments")`, provide quick navigation to the live tracking console.

---

### #D10 — Single `assign_delivery` Allows Disagreeing Fulfillment Types & Terminal Bookings

**Area:** `supabase/migrations/20260871_team_console_delivery.sql:24-46`  
**Severity:** 🟡 P2 (Data Integrity Violation)

**Root cause:**
1. In `assign_delivery` (`20260871_team_console_delivery.sql:31-34`):
   ```sql
   select a.target_id into v_biz from public.appointments a
     where a.id = p_appointment_id and a.target_type = 'BUSINESS';
   if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
   if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
   if not public.has_business_access(v_biz, p_agent_user_id) then raise exception 'AGENT_NOT_TEAM_MEMBER'; end if;
   ```
2. Notice that `assign_delivery` does not verify:
   - `a.fulfillment_type = 'DELIVERY'` (it allows assigning couriers to `IN_STORE` walk-ins!).
   - `a.status = 'ACCEPTED'` (it allows dispatching couriers for `PENDING`, `CANCELLED`, or `REJECTED` bookings!).
3. In contrast, `assign_delivery_batch` properly checks `a.fulfillment_type = 'DELIVERY' AND a.status = 'ACCEPTED'`.

**Fix Recommendation:**
1. Add strict appointment precondition validation in `assign_delivery`:
   ```sql
   select a.target_id into v_biz from public.appointments a
     where a.id = p_appointment_id
       and a.target_type = 'BUSINESS'
       and a.fulfillment_type = 'DELIVERY'
       and a.status = 'ACCEPTED';
   if v_biz is null then raise exception 'APPOINTMENT_NOT_ELIGIBLE'; end if;
   ```

---

### #D11 — Hardcoded `#fff` Tokens in Batch Selection UI and Sheets

**Area:** `src/screens/business/manage/BusinessAppointments.tsx:665, 669, 884, 892`, `src/components/delivery/CantDeliverSheet.tsx:170, 220`  
**Severity:** 🟢 P3 (Design System)

**Root cause:**
1. In `BusinessAppointments.tsx`:
   - Line 665: `background: selectedForBatch.has(apt.id) ? "var(--delivery-600)" : "#fff"`
   - Line 669: `<Check size={13} color="#fff" />`
   - Line 884: `color: "#fff"`
   - Line 892: `background: "#fff"`
2. In `CantDeliverSheet.tsx`:
   - Line 170: `background: selected ? "var(--delivery-50)" : "var(--surface, #fff)"`
   - Line 220: `color: armed ? "#fff" : ...`
3. These hardcoded white hex codes break theme compliance in dark mode.

**Fix Recommendation:**
1. Replace `#fff` with `var(--bg)` or `var(--surface)`.

---

## Verification Plan

### Automated Regression & RPC Tests
```bash
# Verify TypeScript compilation and type alignment
npx tsc --noEmit
```

### Manual Flow Verification
1. **Batch Reassignment Test:** Dispatch a 3-stop delivery run to Agent A. Using `DeliveryAssignControl`, reassign stop #2 to Agent B. Verify that stop #2's `batch_id` is reset to null, Agent A's batch can successfully finish upon completing stops #1 and #3, Agent A can go off-duty, and Agent B can execute stop #2 as a solo run.
2. **Multi-Agent Map Line Test:** Dispatch deliveries to two agents at distinct locations. Open `/business/:id/manage/deliveries` with "All agents" selected. Verify that no criss-crossing polyline connects the two riders. Select Agent A and verify the route polyline connects Agent A to their respective stops in route order.
3. **Realtime Batch Movement Test:** Initiate a batched run in `DeliveryConsole.tsx`. Push GPS updates via `deliveryService.updateBatchPosition`. Verify that the marker moves in real time on `/business/:id/manage/deliveries`.
4. **Cancellation Reason Test:** In `BusinessDeliveries.tsx`, cancel an active delivery using `CantDeliverSheet` with reason "Customer unavailable" and a note. Verify that the order moves to "Recently finished" with the cancellation reason and note visible.
