# Merchant Live Queue Counter Console — Bug & Gap Log

**Purpose:** Documenting every defect, operational hazard, state desynchronization, and architectural flaw in the **Merchant Live Queue Counter Console Flow** (`QueueManager.tsx`, `businessService.ts`, `queue_tokens`, `queue_settings`, and associated PostgreSQL triggers/RPCs). Strictly focused on **maturing the existing implementation** for shop owners, counter staff, and customers.

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **M1** | Toggling Queue to "OFF" Instantly Purges and Expels All Waiting Customers | 🔴 P0 (Operational Hazard) | Toggling the queue switch to OFF fires `trg_expire_on_queue_close`, immediately expiring all waiting customers and hiding the board. A merchant cannot pause new joins while finishing the current line. |
| **M2** | Non-Atomic `callNextToken` Causes Race Conditions on Multi-Staff Counters | 🔴 P0 (Concurrency Defect) | `callNextToken` does a client-side `select oldest -> update` with no row-locking (`FOR UPDATE`) or token ID verification. Multiple staff tapping "Call next" collide on the same token. |
| **M3** | Removing No-Show Customers Attributes Action as "Customer Left / You Cancelled" | 🟠 P1 (Data Inversion) | Clicking "Remove (no-show)" updates status to `LEFT`. The owner is notified that the customer walked away without paying, and the customer is told "You cancelled". |
| **M4** | Waiting Rows Only Allow "Mark Served", Skipping Call / Arrival Flow | 🟠 P1 (Workflow Limitation) | Individual waiting rows only have a "Mark served" button. The merchant cannot call an individual customer out-of-order without bypassing the `CALLED` state and sound notifications. |
| **M5** | Console Only Subscribes to `queue_tokens`, Ignoring `queue_settings` Updates | 🟠 P1 (Realtime Desync) | When another staff member toggles the queue open/closed or adjusts average service time, `QueueManager` remains stale because it only listens to `queue_tokens`. |
| **M6** | No Customer Phone Number or 1:1 Messaging on Queue Cards | 🟡 P2 (Missing Contact CTAs) | The owner has no way to call or message a customer who was called 10 minutes ago and hasn't arrived. Walk-in modal collects no phone number either. |
| **M7** | No Cooldown or Debounce on "Request Payment" Nudge | 🟡 P2 (Notification Spam) | `nudgeQueuePayment` has no timestamp check, allowing staff to repeatedly spam notifications to customers. |
| **M8** | Unbounded Party Size in Walk-In Modal | 🟡 P2 (Input Validation) | Walk-in modal accepts any numeric party size without clamping to `MAX_QUEUE_PARTY_SIZE = 8`, allowing corrupted wait-time math. |
| **M9** | Hardcoded `#fff` Color Literals in Buttons and Badges | 🟢 P3 (Design System) | Raw `#fff` color strings in `QueueManager.tsx` (lines 297, 300, 424) violate design system rules. |

---

## Detailed Gap Analyses

---

### #M1 — Toggling Queue to "OFF" Instantly Purges and Expels All Waiting Customers

**Area:** `src/screens/business/manage/QueueManager.tsx:162-172, 325-348`, `supabase/migrations/20260803_queue_auto_close_and_cancel.sql:147-175`  
**Severity:** 🔴 P0 (Critical Operational Disaster)

**Root cause:**
1. In `QueueManager.tsx`, the merchant has a prominent toggle: `"Queue is ON / OFF"`.
2. When a shop gets busy or nears closing time, the owner naturally turns the queue "OFF" to stop *new* customer joins from the street while they finish serving the customers already waiting.
3. However, updating `queue_settings.is_open = false` immediately triggers PostgreSQL function `expire_tokens_on_queue_close()`:
   ```sql
   update public.queue_tokens t
      set status = 'EXPIRED', closed_reason = 'SHOP_CLOSED'
    where t.business_id = new.business_id
      and t.status in ('WAITING', 'CALLED')
      and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
      and not (t.status = 'CALLED' and t.arrived_at is not null);
   ```
4. All waiting customers in line are abruptly expired, kicked out of the queue, and sent a push notification: *"The shop closed its queue — you've been removed from the line."*
5. Simultaneously, `QueueManager.tsx:348` wraps the entire management board in `{live && ( ... )}`. Turning `live` off completely hides the waiting line, called customers, and summary stats from the merchant screen.

**Recommended Fix:**
- Decouple **Accepting New Joins** (`is_open`) from **Clearing the Active Line**.
- Closing/pausing joins should simply stop new customer registrations (`enforce_queue_open_on_join`), but allow the owner to continue managing and serving existing `WAITING` and `CALLED` customers.
- Provide an explicit, deliberate "Close & Expire Remaining Queue" modal action if the shop genuinely needs to shut down and dismiss everyone.
- Keep the management board rendered in `QueueManager.tsx` even when `live === false` so active customers can be finished.

---

### #M2 — Non-Atomic `callNextToken` Causes Race Conditions on Multi-Staff Counters

**Area:** `src/services/marketplace/businessService.ts:465-480`, `src/screens/business/manage/QueueManager.tsx:183-202`  
**Severity:** 🔴 P0 (Concurrency & Data Integrity Hazard)

**Root cause:**
1. In `businessService.callNextToken(businessId)`:
   ```ts
   const { data, error: fetchErr } = await sb
     .from("queue_tokens")
     .select("id")
     .eq("business_id", businessId)
     .eq("status", "WAITING")
     .order("created_at", { ascending: true })
     .limit(1)
     .maybeSingle();
   ...
   await updateQueueToken(data.id, { status: "CALLED" });
   ```
2. The operation is split into two non-atomic client-side network round trips with no database transaction and no `FOR UPDATE SKIP LOCKED`.
3. If two counter staff or tablets tap "Call next" at approximately the same time, both client queries select the exact same token ID and update the exact same row.
4. One customer is called twice, while the other staff member's UI shows an erroneous optimistic state or fails to call the second customer.

**Recommended Fix:**
Implement an atomic PostgreSQL RPC function `queue_token_call_next(p_business_id text)` with row-level locking (`FOR UPDATE SKIP LOCKED`) that atomically selects and updates the next waiting token to `CALLED`, returning the updated record.

---

### #M3 — Removing No-Show Customers Attributes Action as "Customer Left / You Cancelled"

**Area:** `src/screens/business/manage/QueueManager.tsx:245-254`, `src/services/marketplace/businessService.ts:524-527`, `supabase/migrations/20260803_queue_auto_close_and_cancel.sql:217-227`  
**Severity:** 🟠 P1 (Audit Trail Inversion & Confusing UX)

**Root cause:**
1. When a called customer does not show up, the owner clicks the (X) button with title `"Remove (no-show)"`.
2. This invokes `removeToken`, which calls `businessService.leaveQueueToken(token.id)`, updating `status = 'LEFT'`.
3. The database trigger `trg_on_queue_token_update` assumes `status = 'LEFT'` is initiated by the customer, and immediately inserts a notification to the **owner**:
   *"Customer left the queue: Rohit left before paying."*
4. Meanwhile, no notification is sent to the customer explaining they missed their turn.
5. In `MyQueues.tsx`, the customer's past card displays: `"You cancelled"`, falsely asserting that the customer chose to leave.

**Recommended Fix:**
- Add an explicit `NO_SHOW` status or `closed_reason = 'NO_SHOW'` support in `queue_tokens`.
- Add an RPC or service method `markQueueNoShow(tokenId)` that distinguishes an owner removal from a customer cancellation.
- Notify the customer: *"You were marked as a no-show for your visit at {Shop}."*

---

### #M4 — Waiting Rows Only Allow "Mark Served", Skipping Call / Arrival Flow

**Area:** `src/screens/business/manage/QueueManager.tsx:482-490`  
**Severity:** 🟠 P1 (Workflow Restriction)

**Root cause:**
1. In the "Up next" list in `QueueManager.tsx`, each waiting row only has one action button: `<button title="Mark served" onClick={() => serveToken(t, "waiting")}><Check /></button>`.
2. There is no individual "Call" button for waiting items.
3. If customer #2 is present at the counter while customer #1 is missing, the owner cannot call customer #2 directly without either:
   - Calling customer #1 first (who is absent), OR
   - Clicking "Mark served" on customer #2, which completely skips `CALLED` and `arrived_at`, depriving customer #2 of their "It's your turn!" notification and chime.

**Recommended Fix:**
Add an individual "Call" action on waiting list cards so counter staff can selectively call any present customer forward.

---

### #M5 — Console Only Subscribes to `queue_tokens`, Ignoring `queue_settings` Updates

**Area:** `src/screens/business/manage/QueueManager.tsx:73-79`  
**Severity:** 🟠 P1 (Realtime Desynchronization on Multi-Staff Terminals)

**Root cause:**
`QueueManager` subscribes to Realtime events on table `"queue_tokens"` with filter `business_id=eq.${businessId}`. It does not subscribe to `"queue_settings"`. If another staff member toggles the queue open/closed or modifies the average service time, this screen never receives the change.

**Recommended Fix:**
Subscribe to both `queue_tokens` and `queue_settings` for `businessId`, or refetch settings on window focus.

---

### #M6 — No Customer Phone Number or 1:1 Messaging on Queue Cards

**Area:** `src/screens/business/manage/QueueManager.tsx:416-452, 572-595`, `src/services/marketplace/businessService.ts:314-325`  
**Severity:** 🟡 P2 (Operational Friction)

**Root cause:**
1. When a customer is called and doesn't appear, the merchant card displays only their name and party size.
2. There is no phone number displayed and no click-to-call link.
3. There is no direct 1:1 chat button to send a message ("Your seat is ready").
4. In the "Add a walk-in" modal, only "Name" and "Party size" are collected—no phone number field is provided.

**Recommended Fix:**
- Add optional phone number to walk-in modal.
- For registered app users, join `users(phone)` and provide a click-to-call link and direct chat shortcut on called cards.

---

### #M7 — No Cooldown or Debounce on "Request Payment" Nudge

**Area:** `src/screens/business/manage/QueueManager.tsx:510-514`, `src/services/marketplace/businessService.ts:409-432`  
**Severity:** 🟡 P2 (Spam Hazard)

**Root cause:**
`nudgeQueuePayment` sends a push notification to the customer requesting payment. There is no rate limit, cooldown, or record of `last_nudged_at`. An impatient staff member can click "Request payment" repeatedly, flooding the customer's notifications.

**Recommended Fix:**
Add a 60-second cooldown in local state and/or record `last_nudged_at` to prevent repeated nudges.

---

### #M8 — Unbounded Party Size in Walk-In Modal

**Area:** `src/screens/business/manage/QueueManager.tsx:583-585`  
**Severity:** 🟡 P2 (Input Validation Defect)

**Root cause:**
The walk-in party size input `<input type="number" min={1} value={walkInParty} />` has no upper limit. If staff accidentally type `120`, the wait-time formula skews heavily, showing hours of wait time for anyone joining behind them.

**Recommended Fix:**
Enforce `max={MAX_QUEUE_PARTY_SIZE}` (8) on the input and clamp it in `addWalkIn`.

---

### #M9 — Hardcoded `#fff` Color Literals in Buttons and Badges

**Area:** `src/screens/business/manage/QueueManager.tsx:297, 300, 424`  
**Severity:** 🟢 P3 (Design System)

**Root cause:**
Raw `#fff` color strings in action buttons and avatar icons violate the design system tokenization rule.

**Recommended Fix:**
Replace `#fff` with `var(--surface)`.
