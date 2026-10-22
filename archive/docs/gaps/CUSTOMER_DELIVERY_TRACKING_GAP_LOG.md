# Customer Live Delivery Tracking — Bug & Gap Log

**Purpose:** Documenting every architectural defect, realtime sync failure, mobile usability trap, communication void, and workflow blocker in **Flow 5.3: Customer Live Delivery Tracking** (`src/components/delivery/DeliveryTrackControl.tsx`, `src/screens/TrackingPage.tsx`, `src/components/delivery/DeliveryStepper.tsx`, `src/screens/requests/MyAppointments.tsx`, `src/services/engagement/deliveryService.ts`, and Supabase migrations `20260845_delivery_agent_phase1_groundwork.sql`, `20260847_delivery_agent_phase3_handoff_and_tracking.sql`, `20260848_delivery_batches_phase4.sql`, `20260853_customer_delivery_progress_only.sql`, `20260872_delivery_cancellation.sql`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **T1** | Missing Realtime & Polling in `DeliveryTrackControl.tsx` Traps Customers Without Handoff Code | 🔴 P0 (Realtime Sync & Delivery Blocker) | In `DeliveryTrackControl.tsx:19`, `useQuery(() => deliveryService.myProgress(appointmentId), ...)` has no Supabase Realtime subscription and no interval polling. When a customer opens `/appointments` while the order is in `ASSIGNED`, the 6-digit handoff code card is hidden behind `d.status === "EN_ROUTE" \|\| d.status === "ARRIVED"`. As the driver travels and arrives at the door, the customer's screen never updates. The driver asks for the code, but the customer cannot see it unless they perform a manual pull-to-refresh or page reload. |
| **T2** | Zero In-App Generation or Sharing of Appointment Tracking Tokens | 🔴 P0 (Dead Architecture & Feature Void) | While Postgres defines `appointment_create_tracking_token(p_appointment_id text)` (`20260847_delivery_agent_phase3_handoff_and_tracking.sql:67-89`), it is **never called or exposed anywhere in `deliveryService.ts` or any frontend UI**. Neither `DeliveryTrackControl.tsx`, `MyAppointments.tsx`, nor `BusinessDeliveries.tsx` provides a button or action to generate or copy a public tracking link (`/track/:token`). Users cannot share tracking with colleagues, roommates, or family members. |
| **T3** | Premature "On the Way" State & Premature Expiration on Public `TrackingPage.tsx` | 🟠 P1 (Misleading Status & Broken Delivery UX) | In `TrackingPage.tsx:42, 80`, `liveStatus` defaults to `"ON_THE_WAY"`. For an order in `ASSIGNED`, `row.live_status` in Postgres is `NULL`, causing `TrackingPage.tsx` to announce `"Provider is on the way"` before the driver has even picked up or started the trip. Furthermore, in `20260853_customer_delivery_progress_only.sql:52`, `get_tracking` joins strictly on `d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')`. Once marked `DELIVERED`, `get_tracking` returns 0 rows, causing `TrackingPage.tsx:76` to display `"🔗 Tracking link has expired"` instead of a successful completion screen! Finally, line 221 says `"Ask your delivery agent for the handoff code"`, which is backwards and confuses customers. |
| **T4** | Inability to Contact Shop or Courier During Dispatch Delays | 🟠 P1 (Customer Support Void) | In `DeliveryTrackControl.tsx:65-78`, courier details and the "Call" button are strictly hidden until `d.agentRevealed && d.agentName` (only once `EN_ROUTE` or `ARRIVED`). If an order is delayed for hours in `ASSIGNED` status, the customer has no courier contact and no button to call or chat with the merchant from the delivery card. |
| **T5** | Abrupt Vanishing of Cancelled Deliveries Without Customer Explanation | 🟡 P2 (Silent Disappearance of Delivery Status) | In `DeliveryTrackControl.tsx:36`, `if (d.status === "CANCELLED") return null;`. If the courier or merchant cancels the delivery via `cancel_delivery` (`20260872_delivery_cancellation.sql`) due to an address issue, safety concern, or driver emergency, the delivery tracking card silently vanishes from `/appointments`. The customer receives zero cancellation reason, zero attribution, and zero guidance on next steps. Furthermore, `my_delivery_progress` RPC does not return `cancel_reason` or `cancel_note`. |
| **T6** | Hardcoded `#fff` Tokens in Tracking Controls Breaking Dark Mode | 🟢 P3 (Theme & Visual Polish) | In `DeliveryTrackControl.tsx:66, 82`, `background: "#fff"` is hardcoded instead of CSS variables (`var(--surface)` / `var(--card)`). In dark mode, these cards render as glaring bright white rectangles. In `TrackingPage.tsx:191`, `<path fill="#fff"/>` is hardcoded. |

---

## Detailed Gap Analyses

---

### #T1 — Missing Realtime & Polling in `DeliveryTrackControl.tsx` Traps Customers Without Handoff Code

**Area:** `src/components/delivery/DeliveryTrackControl.tsx:18-20`  
**Severity:** 🔴 P0 (Realtime Sync & Delivery Blocker)

**Root cause:**
1. In `DeliveryTrackControl.tsx:18-20`:
   ```tsx
   export default function DeliveryTrackControl({ appointmentId, fallbackEtaText }: { appointmentId: string; fallbackEtaText?: string | null }) {
     const { data: d } = useQuery(() => deliveryService.myProgress(appointmentId), [appointmentId], `delivery:my-progress:${appointmentId}`);
   ```
2. `useQuery` executes a one-time fetch when the component mounts or when `appointmentId` changes. It establishes **no** Supabase Realtime subscription (`supabase.channel().on('postgres_changes', ...)`) and **no** interval polling timer (`setInterval`).
3. Notice the lifecycle of an order:
   - Order is accepted: Merchant assigns an agent -> status is `ASSIGNED`.
   - Customer opens `/appointments`: `myProgress` fetches and caches `d.status = "ASSIGNED"`.
   - At line 81:
     ```tsx
     {(d.status === "EN_ROUTE" || d.status === "ARRIVED") && d.handoffCode && !d.handoffVerified && (
       <div className="row gap-8 center-v" style={{ ... }}>
         <div className="grow tiny muted">Show this code to the agent</div>
         <div className="semi" style={{ letterSpacing: 3, fontSize: 16, color: "var(--delivery-600)" }}>{d.handoffCode}</div>
       </div>
     )}
     ```
   - Because `d.status` is `"ASSIGNED"`, the 6-digit handoff code is **not rendered**.
   - The rider starts the run (`EN_ROUTE`), drives to the customer's location, and arrives at the door (`ARRIVED`).
   - The customer's screen remains permanently stuck on `"A delivery agent is assigned"`.
   - The rider rings the doorbell and asks: *"Can I have your 6-digit delivery PIN?"*
   - The customer looks at their phone: the PIN code is not there! Unless the customer happens to pull down to refresh or navigate away and back, they have no way to see the handoff code.
   - Because the rider's console strictly enforces `confirmHandoff` (`20260848_delivery_batches_phase4.sql:215-217`), the rider cannot complete the delivery without this code!

**Remediation Plan:**
1. In `DeliveryTrackControl.tsx`, add an active polling interval (e.g., poll every 10–15 seconds while `d.status !== "DELIVERED"` and `d.status !== "CANCELLED"`), or subscribe to Postgres changes on `appointment_deliveries` for `appointment_id = eq.${appointmentId}`.
2. Invalidate or refetch `delivery:my-progress:${appointmentId}` whenever a notification arrives or when window gains focus (`focus` event listener).

---

### #T2 — Zero In-App Generation or Sharing of Appointment Tracking Tokens

**Area:** `src/services/engagement/deliveryService.ts`, `src/components/delivery/DeliveryTrackControl.tsx`, `src/screens/requests/MyAppointments.tsx`  
**Severity:** 🔴 P0 (Dead Architecture & Feature Void)

**Root cause:**
1. In Supabase migration `20260847_delivery_agent_phase3_handoff_and_tracking.sql:67-89`:
   ```sql
   CREATE OR REPLACE FUNCTION public.appointment_create_tracking_token(p_appointment_id text)
    RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
   AS $function$
   ...
     if not (public.has_business_scope(v_biz, v_uid, 'appointments')
             or v_uid = v_customer
             or exists (select 1 from public.appointment_deliveries d
                        where d.appointment_id = p_appointment_id and d.agent_user_id = v_uid)) then
       raise exception 'NOT_ALLOWED';
     end if;
     ...
     insert into public.tracking_tokens (appointment_id, expires_at)
       values (p_appointment_id, now() + interval '4 hours') returning id into v_token;
     return v_token;
   ```
   The backend provides a fully functional, secure RPC allowing customers, merchants, and couriers to generate shareable 4-hour tracking tokens (`/track/:token`).
2. However, in `src/services/engagement/deliveryService.ts`, `appointment_create_tracking_token` was **never mapped**. Only `agreement_create_tracking_token` exists in `requestService.ts:612`.
3. In `DeliveryTrackControl.tsx` and `MyAppointments.tsx`, there is zero "Share tracking link" button, zero "Copy link" button, and zero native share sheet invocation (`navigator.share`).
4. Result:
   - The public tracking page (`/track/:token`) can **never be used** for appointments/deliveries because no user or business can ever generate a token for it from the UI!
   - Customers ordering for family members or office colleagues cannot share the live delivery progress with the recipient.

**Remediation Plan:**
1. In `deliveryService.ts`, add `createTrackingToken(appointmentId: string): Promise<string>` calling `sb.rpc("appointment_create_tracking_token", { p_appointment_id: appointmentId })`.
2. In `DeliveryTrackControl.tsx`, add a "Share tracking link" action (with clipboard copy and `navigator.share` fallback) so customers can share live delivery status.

---

### #T3 — Premature "On the Way" State & Premature Expiration on Public `TrackingPage.tsx`

**Area:** `src/screens/TrackingPage.tsx:42, 80, 211-224`, `supabase/migrations/20260853_customer_delivery_progress_only.sql:35-54`  
**Severity:** 🟠 P1 (Misleading Status & Broken Delivery UX)

**Root cause:**
1. **Premature "On the Way" Status:**
   - In `TrackingPage.tsx:42`: `const [liveStatus, setLiveStatus] = useState("ON_THE_WAY");`.
   - In `TrackingPage.tsx:80`: `setLiveStatus(row.live_status ?? "ON_THE_WAY");`.
   - In Postgres, when a delivery is first assigned, `d.live_status` is `NULL`. `row.live_status ?? "ON_THE_WAY"` evaluates to `"ON_THE_WAY"`.
   - On the UI (`TrackingPage.tsx:203`), the header says:
     `{providerName} is on the way`
     even though the delivery is still in `ASSIGNED` and the rider hasn't even acknowledged or started the run!
   - In `DeliveryStepper.tsx:16-28`, `liveStatusToDeliveryStatus(null)` maps to `"ASSIGNED"`, but because `liveStatus` was forced to `"ON_THE_WAY"`, `liveStatusToDeliveryStatus("ON_THE_WAY")` returns `"EN_ROUTE"`, highlighting Step 2 prematurely!
2. **Premature "Link Expired" Error on Delivery Completion:**
   - In `20260853_customer_delivery_progress_only.sql:52`:
     ```sql
     join public.appointment_deliveries d
       on d.appointment_id = t.appointment_id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
     ```
   - The query filter only includes `'ASSIGNED'`, `'EN_ROUTE'`, and `'ARRIVED'`.
   - When the driver enters the handoff code and completes the delivery (`d.status = 'DELIVERED'`), `get_tracking` returns **0 rows**.
   - On `TrackingPage.tsx:76`:
     ```tsx
     if (error || !row) { setExpired(true); setLoading(false); return; }
     ```
   - When the user refreshes or opens the link after delivery, the page displays:
     `🔗 Tracking link has expired. Ask the requester to share a new link.`
     The customer thinks their delivery failed or the link was revoked, rather than seeing that their parcel was delivered!
3. **Inverted Handoff Instructions:**
   - In `TrackingPage.tsx:221`:
     `{liveStatus === "ARRIVED" && " Ask your delivery agent for the handoff code to confirm."}`
   - In STRYT's delivery architecture, the **customer** receives the handoff code, and the **agent** must ask the customer for it. Telling the customer to ask the agent creates complete confusion at the doorstep.

**Remediation Plan:**
1. In `20260853_customer_delivery_progress_only.sql`, update `d.status in ('ASSIGNED','EN_ROUTE','ARRIVED','DELIVERED')` so that completed deliveries return the delivered status with `live_status = 'DONE'`.
2. In `TrackingPage.tsx`, support `ASSIGNED` status properly: default to `"ASSIGNED"` when `live_status` is null, and render `ASSIGNED: { emoji: "📦", label: "Order assigned" }`.
3. On `TrackingPage.tsx:221`, correct the guidance text to: `"Your delivery agent has arrived. Show them your 6-digit handoff code when receiving your order."`

---

### #T4 — Inability to Contact Shop or Courier During Dispatch Delays

**Area:** `src/components/delivery/DeliveryTrackControl.tsx:65-78`  
**Severity:** 🟠 P1 (Customer Support Void)

**Root cause:**
1. In `DeliveryTrackControl.tsx:65-78`:
   ```tsx
   {d.agentRevealed && d.agentName && (
     <div className="row gap-9 center-v" style={{ ... }}>
       ...
       {d.agentPhone && (
         <a className="btn btn-delivery btn-sm row gap-6 center" href={`tel:${d.agentPhone}`}>
           <Phone size={13} /> Call
         </a>
       )}
     </div>
   )}
   ```
2. By design, `d.agentRevealed` is false until `status === "EN_ROUTE" || status === "ARRIVED"`. This protects the agent's privacy while they are waiting or commuting to the store.
3. However, if the order remains in `ASSIGNED` or pending dispatch for 45+ minutes past the promised ETA, the customer has **no contact method whatsoever** on the delivery control card.
4. `DeliveryTrackControl` does not accept the merchant's phone number or business ID, and does not render a "Call Store" or "Message Shop" shortcut. The customer is forced to leave `/appointments`, find the store profile on the directory or search feed, and look for a contact number.

**Remediation Plan:**
1. Pass the store's contact information (or business phone from the parent `apt`) into `DeliveryTrackControl`.
2. When the agent is not yet revealed or if the order is delayed, provide a clear "Contact Store" button so the customer can query their order status directly.

---

### #T5 — Abrupt Vanishing of Cancelled Deliveries Without Customer Explanation

**Area:** `src/components/delivery/DeliveryTrackControl.tsx:36`, `supabase/migrations/20260872_delivery_cancellation.sql`  
**Severity:** 🟡 P2 (Silent Disappearance of Delivery Status)

**Root cause:**
1. In `DeliveryTrackControl.tsx:36`:
   ```tsx
   if (d.status === "CANCELLED") return null;
   ```
2. When a delivery attempt is cancelled by an agent or merchant using `cancel_delivery` (`20260872_delivery_cancellation.sql`)—for example, if the rider had a vehicle breakdown (`AGENT_EMERGENCY`) or there was an address issue (`ADDRESS_PROBLEM`)—`my_delivery_progress` returns `status: 'CANCELLED'`.
3. `DeliveryTrackControl` simply returns `null`!
4. The delivery status card abruptly disappears from the customer's appointment screen. If `apt.deliveryEtaText` was set, the fallback banner (`Delivery accepted`) might render, falsely suggesting the delivery is still arriving soon.
5. Furthermore, `my_delivery_progress` (`20260853_customer_delivery_progress_only.sql:61-96`) does not select `cancel_reason` or `cancel_note` from `appointment_deliveries`, so the frontend has no access to why the delivery was halted.

**Remediation Plan:**
1. Update `my_delivery_progress` RPC to include `cancel_reason` and `cancel_note`.
2. In `DeliveryTrackControl.tsx`, replace `if (d.status === "CANCELLED") return null;` with a styled cancellation alert:
   - Display a clear badge: "Delivery attempt cancelled".
   - Show human-readable reason (e.g., "Address verification required" or "Delivery rescheduled by store").
   - Offer action: "Contact Store" to arrange re-dispatch or pickup.

---

### #T6 — Hardcoded `#fff` Tokens in Tracking Controls Breaking Dark Mode

**Area:** `src/components/delivery/DeliveryTrackControl.tsx:66, 82`, `src/screens/TrackingPage.tsx:191`  
**Severity:** 🟢 P3 (Theme & Visual Polish)

**Root cause:**
1. In `DeliveryTrackControl.tsx:66` and `line 82`:
   ```tsx
   <div className="row gap-9 center-v" style={{ background: "#fff", borderRadius: 10, padding: "8px 10px" }}>
   ...
   <div className="row gap-8 center-v" style={{ background: "#fff", borderRadius: 10, padding: "8px 10px" }}>
   ```
   Hardcoded `#fff` produces stark, blinding white boxes inside the delivery card when running in dark theme mode.
2. In `TrackingPage.tsx:191`:
   ```tsx
   <path d="..." fill="#fff"/>
   ```
   Hardcoded SVG fill colors violate styling token guidelines.

**Remediation Plan:**
1. Replace `#fff` in `DeliveryTrackControl.tsx` with `var(--surface)` or `var(--card)`.
2. Ensure border and ink colors adjust smoothly with the app's dark theme palette.
