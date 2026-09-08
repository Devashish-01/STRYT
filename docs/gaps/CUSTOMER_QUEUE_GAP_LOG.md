# Customer Digital Token & Live Queue — Bug & Gap Log

**Purpose:** Documenting every defect, broken state, missing validation, security vulnerability, and operational hazard in the **Customer Digital Token & Live Queue Flow** (`MyQueues.tsx`, `BusinessDetail.tsx` live queue strip, `QueuePaymentSheet.tsx`, `PaymentMethodPanel.tsx`, `businessService.ts`, and associated Supabase migrations/RLS). Strictly focused on **maturing the existing implementation** for customers and shop owners.

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **Q1** | Customer Can Arbitrarily Update `queue_tokens` Status and Payment Status | 🔴 P0 (Critical Security) | `queue_tokens_owner_update` RLS policy has no `WITH CHECK` and no trigger restricting customer updates. Customers can mark their token `PAID` or `SERVED` via client update. |
| **Q2** | Live Queue Realtime Listener Filters on `customer_user_id`, Freezing Live Queue Position | 🔴 P0 (Realtime Sync) | `MyQueues` subscribes to Realtime with `customer_user_id=eq.${user.id}`. It never receives events when others ahead are called or leave, leaving the queue position frozen. |
| **Q3** | `BusinessDetail` Quick-Pay Banner Triggers on `WAITING` and `EXPIRED` Queue Tokens | 🔴 P0 (Critical Logic) | `payableQueue` checks `q.status !== 'LEFT'`, so a customer who just joined and is waiting (or whose visit expired) is prompted to pay before even receiving service. |
| **Q4** | Dismissing a Served Unpaid Card Makes It Disappear Completely from Both Tabs | 🟠 P1 (UX Defect) | Because `history` only includes `!isActiveEntry(q)`, dismissing a served-unpaid token hides it from `active` AND drops it from `history`. Card vanishes permanently. |
| **Q5** | Unbounded Party Size Skews Queue Math Across Entire Shop | 🟠 P1 (Math Integrity) | `parsePartySize` does not clamp to `MAX_QUEUE_PARTY_SIZE = 8`. A tampered or large party size (e.g. 5000) causes estimated wait times to blow up into thousands of hours. |
| **Q6** | `QueuePaymentSheet` Allows Claiming Null or Zero Amount | 🟠 P1 (Validation) | Customers can submit payment claims with empty amount. Updates token with `payment_amount = null` and sends notification without an amount to the merchant. |
| **Q7** | 1-Tap Permanent Queue Leave with No Confirmation for Waiting Customers | 🟡 P2 (Accidental Action) | An accidental touch on the (x) icon while scrolling immediately abandons the user's queue spot without confirmation or undo. |
| **Q8** | `useQueryWithRealtime` Reconnects WebSocket on Every Render | 🟡 P2 (Performance) | Unstable `refetch` dependency causes channel teardown and resubscription on every render. |
| **Q9** | Missing Directions & Merchant Contact CTAs on "Called" Queue Card | 🟡 P2 (Missing CTAs) | When called ("It's your turn!"), there is no direct directions button or message shortcut on the card to reach the merchant. |
| **Q10** | Hardcoded `#fff` Color Literals in Queue Sheets & Panels | 🟢 P3 (Design System) | Raw `#fff` color strings in `QueuePaymentSheet.tsx`, `PaymentMethodPanel.tsx`, `MyQueues.tsx`, and `BusinessDetail.tsx`. |

---

## Detailed Gap Analyses

---

### #Q1 — Customer Can Arbitrarily Update `queue_tokens` Status and Payment Status

**Area:** `supabase/migrations/20260728_queue_arrival_and_write_policies.sql:28-36`, `supabase/migrations/20260829_fix_can_manage_business_overreach.sql:163-176`, `src/services/marketplace/businessService.ts:24-31`  
**Severity:** 🔴 P0 (Critical Security Vulnerability)

**Root cause:**
1. In `20260829_fix_can_manage_business_overreach.sql`:
   ```sql
   create policy queue_tokens_owner_update on public.queue_tokens for update
     using (
       ...
       or (
         (select auth.role()) = 'authenticated'
         and customer_user_id = (select auth.uid())::text
       )
     );
   ```
2. There is no `WITH CHECK` clause restricting what fields an authenticated customer can update.
3. The only trigger on `queue_tokens` update is `trg_enforce_queue_cancel`, which only validates that `status = 'LEFT'` is not set when `payment_status` is `PENDING_CONFIRM` or `PAID`.
4. Any customer can run:
   ```js
   supabase.from('queue_tokens').update({ payment_status: 'PAID', status: 'SERVED' }).eq('id', tokenId);
   ```
   PostgreSQL permits this update with zero errors, letting customers mark their own visits as paid and served without merchant confirmation.

**Recommended Fix:**
Add a `BEFORE UPDATE` trigger or explicit `WITH CHECK` constraint ensuring that if the updater is `customer_user_id` (and not a business owner/team member):
- They can ONLY transition `status` from `WAITING`/`CALLED`/`SERVED` to `LEFT` (if unpaid).
- They can ONLY transition `payment_status` from `UNPAID`/`REJECTED` to `PENDING_CONFIRM` (or cancel an unconfirmed claim back to `UNPAID`).
- They cannot set `payment_status = 'PAID'` or `status = 'CALLED'` or `status = 'SERVED'` or alter `arrived_at`.

---

### #Q2 — Live Queue Realtime Listener Filters on `customer_user_id`, Freezing Live Queue Position

**Area:** `src/screens/MyQueues.tsx:63`, `src/services/marketplace/businessService.ts:548-605`  
**Severity:** 🔴 P0 (Realtime Synchronization Failure)

**Root cause:**
1. In `MyQueues.tsx`:
   ```tsx
   const { data, loading, error, refetch } = useQueryWithRealtime(
     () => businessService.myQueues(),
     "queue_tokens",
     [user.id],
     user.id ? `customer_user_id=eq.${user.id}` : undefined
   );
   ```
2. A customer's queue position (# in line, people ahead, estimated wait time) is calculated dynamically from all `WAITING` rows in that business's queue (`waitingRows`).
3. When the merchant calls the next token, or someone ahead leaves, or a walk-in is added, those events belong to other users (`customer_user_id != user.id` or `null`).
4. Because the Supabase Realtime channel filter is `customer_user_id=eq.${user.id}`, the client never receives these updates.
5. Furthermore, `MyQueues.tsx` contains no interval polling fallback.
6. The user stares at a frozen screen with AnimatedNumber and LivePulseDot that never update until they manually pull to refresh or their own token is called.

**Recommended Fix:**
- Remove the narrow `customer_user_id=eq.${user.id}` filter when the user has active queue tokens, OR subscribe to `queue_tokens` updates for the active `business_id`s, and/or add an active polling interval (e.g. every 15–20 seconds while on the screen with an active waiting token).

---

### #Q3 — `BusinessDetail` Quick-Pay Banner Triggers on `WAITING` and `EXPIRED` Queue Tokens

**Area:** `src/screens/business/BusinessDetail.tsx:222-226, 444-458`  
**Severity:** 🔴 P0 (Critical Business Logic Defect)

**Root cause:**
1. In `BusinessDetail.tsx:222-226`:
   ```tsx
   const payableQueue = !isOwner && !payableApt
     ? (myQueueEntries ?? []).find(
         (q) => q.businessId === b.id && q.status !== "LEFT" && (q.paymentStatus ?? "UNPAID") === "UNPAID"
       ) ?? null
     : null;
   ```
2. Everywhere else in the codebase (`queueMath.ts`, `Home.tsx`), a queue token is only payable when `isQueuePayable(q.status)` (`CALLED` or `SERVED`).
3. `BusinessDetail` checks `q.status !== "LEFT"`.
4. As soon as a customer joins the queue (`status === "WAITING"`), or if their token expired because the shop closed (`status === "EXPIRED"`), `payableQueue` evaluates to true.
5. The quick-pay banner immediately displays "Pay now" and opens `QueuePaymentSheet`, prompting the customer to pay for a service they have not yet received.

**Recommended Fix:**
Change the condition in `BusinessDetail.tsx:224` to:
```tsx
(q) => q.businessId === b.id && isQueuePayable(q.status) && (q.paymentStatus ?? "UNPAID") === "UNPAID"
```

---

### #Q4 — Dismissing a Served Unpaid Card Makes It Disappear Completely from Both Active and History Tabs

**Area:** `src/screens/MyQueues.tsx:101-103, 156-163`, `src/lib/dismissedCards.ts`  
**Severity:** 🟠 P1 (UX Flow Defect / Lost Records)

**Root cause:**
1. In `MyQueues.tsx`:
   ```tsx
   function isActiveEntry(q: MyQueueEntry): boolean {
     if (q.status === "WAITING" || q.status === "CALLED") return true;
     if (q.status === "SERVED") return (q.paymentStatus ?? "UNPAID") !== "PAID";
     return false;
   }
   const active = all.filter((q) => isActiveEntry(q) && !removedIds.has(q.tokenId) && !dismissedIds.has(q.tokenId));
   const history = all.filter((q) => !isActiveEntry(q));
   ```
2. When a customer taps "Dismiss" on a served-unpaid token, its ID is added to `dismissedIds`.
3. It is filtered out of `active` because `dismissedIds.has(q.tokenId)`.
4. But because `isActiveEntry(q)` remains `true` (since it is `SERVED` and unpaid), it is ALSO filtered out of `history` (`!isActiveEntry(q)` is `false`).
5. The card is excluded from both tabs and vanishes from the app. The customer cannot find it, view their visit, or pay.

**Recommended Fix:**
Include dismissed active entries in the `history` tab:
```tsx
const history = all.filter((q) => !isActiveEntry(q) || dismissedIds.has(q.tokenId));
```
This allows users to clear their Active tab without losing access to the card in History.

---

### #Q5 — Unbounded Party Size Skews Queue Math Across Entire Shop

**Area:** `src/lib/queueMath.ts:12, 19-24`, `src/services/marketplace/businessService.ts:494-522`  
**Severity:** 🟠 P1 (Math & Data Integrity)

**Root cause:**
1. In `queueMath.ts`, `MAX_QUEUE_PARTY_SIZE = 8` is declared with explicit documentation that it caps self-reported party size.
2. However, `parsePartySize(label)` only runs `parseInt(m[0], 10)` without clamping to `MAX_QUEUE_PARTY_SIZE`.
3. `queue_tokens.party_size` is a raw unconstrained text column.
4. If a user tampers with the request or if an old token has a large party size (e.g. 500), `weightedWaitMin` multiplies that count by `avgServiceMin * 0.25`, resulting in absurd wait times (thousands of minutes) for all customers behind them.

**Recommended Fix:**
Clamp party size in `parsePartySize`:
```ts
return Math.min(MAX_QUEUE_PARTY_SIZE, Math.max(1, n));
```
And add a check constraint on `queue_tokens` or validate party size in `joinQueueToken`.

---

### #Q6 — `QueuePaymentSheet` Allows Claiming Null or Zero Amount

**Area:** `src/components/QueuePaymentSheet.tsx:21-38`, `src/services/marketplace/businessService.ts:391-397`  
**Severity:** 🟠 P1 (Payment Flow Defect)

**Root cause:**
1. `amount` starts empty `""`. `numAmount = parseFloat(amount) || null`.
2. There is no validation requiring `numAmount && numAmount > 0` before calling `businessService.claimQueuePayment`.
3. A user can tap "I have paid" without entering an amount.
4. The database stores `payment_amount = null`, and the notification sent to the owner omits the payment amount.

**Recommended Fix:**
Disable the submit button or display a validation toast if `!numAmount || numAmount <= 0` in `QueuePaymentSheet`.

---

### #Q7 — 1-Tap Permanent Queue Leave with No Confirmation for Waiting Customers

**Area:** `src/screens/MyQueues.tsx:111-114, 250-259`  
**Severity:** 🟡 P2 (Accidental Action Hazard)

**Root cause:**
1. In `MyQueues.tsx`:
   ```tsx
   function requestCancel(q: MyQueueEntry) {
     if (q.status === "WAITING") leave(q.tokenId);
     else setConfirmCancel(q);
   }
   ```
2. A customer waiting in line (e.g. #2 in line after waiting 40 minutes) can accidentally brush the 34x34 cancel button while scrolling.
3. The queue token is immediately marked `LEFT` on the server and removed.
4. The customer permanently loses their spot with no confirmation modal and no undo.

**Recommended Fix:**
Route `WAITING` cancellations through `confirmCancel` or provide an undo toast, so a user cannot lose a long-awaited queue position by an accidental slip of the thumb.

---

### #Q8 — `useQueryWithRealtime` Reconnects WebSocket on Every Render

**Area:** `src/screens/MyQueues.tsx:63`, `src/hooks/useApi.ts:167`  
**Severity:** 🟡 P2 (Performance / Connection Churn)

**Root cause:**
`useQueryWithRealtime` has `[tableName, filter, refetch]` in its `useEffect` dependencies. `useQuery` returns a new `refetch` function reference on every render, causing the WebSocket subscription to unsubscribe and reconnect on every state change.

**Recommended Fix:**
Stabilize `refetch` with `useCallback` in `useQuery` or reference it via ref in `useQueryWithRealtime`.

---

### #Q9 — Missing Directions & Merchant Contact CTAs on "Called" Queue Card

**Area:** `src/screens/MyQueues.tsx:203-248`  
**Severity:** 🟡 P2 (Usability Hazard When Called)

**Root cause:**
When a customer is called (`status === "CALLED"`), urgency is peak ("Head in now!"). The card displays no directions button (to Google Maps), no phone number, and no 1:1 chat button to let the merchant know "I'm 1 min away". The user is forced to navigate through the shop profile.

**Recommended Fix:**
On called cards, include a quick "Directions" button and "Message" shortcut.

---

### #Q10 — Hardcoded `#fff` Color Literals in Queue Sheets & Panels

**Area:** `src/components/QueuePaymentSheet.tsx:46`, `src/components/PaymentMethodPanel.tsx:168`, `src/screens/MyQueues.tsx:320, 378`, `src/screens/business/BusinessDetail.tsx:558`  
**Severity:** 🟢 P3 (Design System)

**Root cause:**
Raw `#fff` color strings violate theme tokenization rules.

**Recommended Fix:**
Replace with `var(--surface)` or semantic variables.
