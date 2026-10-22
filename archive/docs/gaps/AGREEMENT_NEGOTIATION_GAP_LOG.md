# Agreement Negotiation & Completion — Bug & Gap Log

**Purpose:** Documenting every architectural defect, permission blocker, broken role perspective, security vulnerability, and mobile UX flaw in **Flow 4.3: Agreement Negotiation & Completion** (`src/screens/requests/AgreementScreen.tsx`, `src/screens/requests/Agreements.tsx`, `src/screens/requests/RateScreen.tsx`, `src/components/DealUpiSheet.tsx`, `src/services/engagement/requestService.ts`, and Supabase migrations `20260824_booking_and_rpc_security.sql` / `20260825_agreement_cancel_and_expiry.sql` / `20260910_notify_payment_claim_gaps.sql` / `20260822_booking_and_deal_integrity.sql` / `migration_launch_hardening.sql`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **A1** | Business Owners & Team Mates Completely Locked Out of Agreements | 🔴 P0 (Multi-User Console Crash) | In `read_agreements` (`20260824_booking_and_rpc_security.sql:37-49`) and all lifecycle RPCs (`agreement_confirm`, `agreement_complete`, `agreement_confirm_payment`, `agreement_start_work`, `agreement_submit_review`, `agreement_dispute`, `agreement_cancel`), authorization strictly enforces `auth.uid() in (requester_user_id, responder_user_id)`. When an employee (e.g. Alice on behalf of "Sharma Bakery") submits a proposal, `responder_user_id` is set to Alice. Shop owner Bob and all other team members get `Agreement not found` on `/agreement/:id`, cannot see the agreement in `/agreements`, and cannot confirm or manage payment. |
| **A2** | Broken Profile Navigation on Agreement Cards (404 Crash) | 🔴 P0 (Broken Navigation & 404) | In `AgreementScreen.tsx:657`, clicking the user card executes `nav('/u/${targetUserId}')`. The `/u/:id` route **does not exist** in `App.tsx`. Clicking anywhere on the party card (outside the small inner avatar) crashes into a 404 page, navigating the user out of the active contract. |
| **A3** | 10-Minute PENDING Expiry Window Destroys Legitimate Deals | 🔴 P0 (Deal Destruction Hazard) | In `AgreementScreen.tsx:178-198` and `cancel_expired_agreements` (`20260825_agreement_cancel_and_expiry.sql:76-84`), agreements that are not confirmed by BOTH parties within 10 minutes (600 seconds) are automatically marked `CANCELLED`. In a real-world local service marketplace, tradespeople driving or working lose ~90% of won deals before they can open their phones. |
| **A4** | Severe Blanket Direct UPDATE Vulnerability on Agreements | 🟠 P1 (Security & Integrity Breach) | In `supabase/legacy/migration_launch_hardening.sql:53-55`, policy `upd_agreements` grants unrestricted client-side `UPDATE` to authenticated users where `auth.uid() in (requester_user_id, responder_user_id)`. Any participant can directly send a Supabase REST PATCH request modifying `agreed_price: 1`, `payment_status: "PAID"`, `status: "COMPLETED"`, or `requester_confirmed: true`, completely bypassing every server-side RPC check. |
| **A5** | Rate Screen Inverted Role Bug (Responder Rates Themselves) | 🟠 P1 (Corrupted Ratings & Self-Review) | In `RateScreen.tsx:51, 64-66`, the screen hardcodes `a.responderUserId`, `a.responderName`, and `a.responderAvatar`. When a provider taps "Rate {customerName}" from `Agreements.tsx:94`, the screen displays the provider's own face, asks "How was {provider}?", and calls `requestService.rate(a.responderUserId, ...)`. The provider submits a self-review instead of rating the customer. |
| **A6** | Zero In-Context Communication Channels on Active Agreements | 🟠 P1 (Communication Deadlock) | On `AgreementScreen.tsx`, there is NO chat button, NO phone call link, and NO direct messaging trigger. Once a proposal becomes an active contract, parties have no in-context way to coordinate arrival, share gate codes, or clarify job requirements without exiting to `/chats` and manually searching for the user. |
| **A7** | Silent Dead-End Disputes (Zero Notifications to Admin or Counterparty) | 🟠 P1 (Unresolved Dispute Deadlock) | In `agreement_dispute` (`20260822_booking_and_deal_integrity.sql:177-186`), raising a dispute sets `status = 'DISPUTED'` but does not insert any notification to the other party or the admin. On `AgreementScreen.tsx:304-315`, a disputed agreement becomes a permanent dead end with no actions for either party. |
| **A8** | Deal UPI Payment Sheet Fails for Team-Submitted Deals | 🟡 P2 (Payment Blocker) | In `DealUpiSheet.tsx:17-24`, `fetchUpiForUser(payeeUserId)` queries `businesses.owner_user_id = payeeUserId` or `providers.user_id = payeeUserId`. If an agreement was initiated by team member Alice on behalf of a business owned by Bob, `fetchUpiForUser` finds no UPI ID under Alice, falsely displaying "{Business} hasn't set up UPI yet" and blocking UPI checkout. |
| **A9** | Fixed Action Bar Overlaps and Clips Page Content in ACTIVE Status | 🟡 P2 (UI Clipping) | In `AgreementScreen.tsx:617, 622`, `actionAreaHeight` defaults to 72px for `status === "ACTIVE"`. The actual action area in `ACTIVE` status contains 4 rows (height ~190px). Over 100px of page content (including the payment status card and terms) is cut off underneath the fixed bar, with no safe-area inset padding. |
| **A10** | Infinite Unthrottled Payment Nudges | 🟡 P2 (Notification Spam) | In `requestService.ts:617-639`, `nudgeAgreementPayment` has no rate limiting or deduplication. A provider can repeatedly spam the payment request button, firing dozens of push notifications to the customer. |
| **A11** | Blind Proposal Status Overwrite on Agreement Cancellation | 🟡 P2 (State Corruption) | In `cancel_expired_agreements` (`20260825_agreement_cancel_and_expiry.sql:83, 114`), cancelling an agreement executes `update public.proposals set status = 'SUBMITTED' where request_id = v_ag.request_id;`, blindly reactivating all proposals, including proposals that were deliberately `WITHDRAWN` by providers. |
| **A12** | Hardcoded `#fff` Tokens Across Agreement Surfaces | 🟢 P3 (Design System) | Multiple hardcoded `#fff` values in `AgreementScreen.tsx` (lines 73, 323, 354, 362, 389, 425, 456, 465, 520, 563, 582, 604, 697) and `DealUpiSheet.tsx:56, 93` break theme tokens and dark mode styling. |

---

## Detailed Gap Analyses

---

### #A1 — Business Owners & Team Mates Completely Locked Out of Agreements

**Area:** `supabase/migrations/20260824_booking_and_rpc_security.sql:37-49`, `src/services/engagement/requestService.ts:438-462`, `src/screens/requests/AgreementScreen.tsx:228-234`  
**Severity:** 🔴 P0 (Multi-User Console Crash)

**Root cause:**
1. In `supabase/migrations/20260824_booking_and_rpc_security.sql`:
   ```sql
   create policy read_agreements on public.agreements
     for select to authenticated
     using (
       (select auth.uid()) is not null
       and (
         (select auth.uid())::text in (requester_user_id, responder_user_id)
         or exists (select 1 from public.users u where u.id = (select auth.uid())::text and u.roles && array['admin', 'super_admin']::text[])
       )
     );
   ```
2. The `agreements` table schema (`schema.sql:224-239`) only contains `requester_user_id` and `responder_user_id`. It does not store `responder_entity_id`.
3. When a proposal is submitted by an employee (e.g. Alice on behalf of "Sharma Bakery"), `v_proposal.responder_user_id` is Alice's UID.
4. When the proposal is accepted, `accept_proposal` inserts `responder_user_id = Alice`.
5. When shop owner Bob (or manager Charlie) opens `/agreements` or `/agreement/:id`:
   - `read_agreements` RLS policy rejects Bob because `Bob != Alice`.
   - `AgreementScreen.tsx` displays `EmptyState` ("Agreement not found — This agreement may have been cancelled").
   - In all agreement lifecycle RPCs (`agreement_confirm`, `agreement_confirm_payment`, `agreement_start_work`, `agreement_submit_review`, `agreement_cancel`), authorization strictly enforces `v_uid = v_agreement.responder_user_id`. Neither Bob nor any other manager can confirm the deal, start work, or verify payments.

**Fix Recommendation:**
1. Add `responder_entity_id text` to `public.agreements`.
2. Update `accept_proposal` and `accept_proposal_counter` to propagate `v_proposal.responder_entity_id` into `public.agreements(responder_entity_id)`.
3. Update `read_agreements` policy to permit access if:
   `auth.uid()::text in (requester_user_id, responder_user_id) OR public.has_business_scope(responder_entity_id, auth.uid()::text, 'leads')`.
4. Update lifecycle RPCs to permit execution by authorized business delegates.

---

### #A2 — Broken Profile Navigation on Agreement Cards (404 Crash)

**Area:** `src/screens/requests/AgreementScreen.tsx:654-685`, `src/App.tsx`  
**Severity:** 🔴 P0 (Broken Navigation & 404)

**Root cause:**
1. In `AgreementScreen.tsx:654-658`:
   ```tsx
   <div className="card">
     <button
       className="row gap-12"
       style={{ width: "100%", textAlign: "left" }}
       onClick={() => nav(`/u/${isRequester ? agreement.responderUserId : agreement.requesterUserId}`)}
     >
   ```
2. The route `/u/:id` **does not exist** in `src/App.tsx`.
3. Clicking anywhere on the party card (e.g. party name, role badge, price block, or "View Profile" link) navigates the browser to `/u/{userId}`.
4. React Router matches no route, falling back to the 404 Not Found screen. The user is kicked out of their active agreement.
5. Meanwhile, the inner avatar image (lines 664-670) uses `openProfile(...)` sheet modal, proving the outer card navigation was an invalid dead link.

**Fix Recommendation:**
Remove the outer `onClick={() => nav('/u/...')}` wrapper and trigger `openProfile(targetId, "USER", { name: targetName, avatar: targetAvatar })` consistently on the card tap.

---

### #A3 — 10-Minute PENDING Expiry Window Destroys Legitimate Deals

**Area:** `src/screens/requests/AgreementScreen.tsx:178-198`, `supabase/migrations/20260825_agreement_cancel_and_expiry.sql:76-84`  
**Severity:** 🔴 P0 (Deal Destruction Hazard)

**Root cause:**
1. In `cancel_expired_agreements` (`20260825_agreement_cancel_and_expiry.sql:76-84`):
   ```sql
   for v_ag in
     select * from public.agreements
     where status = 'PENDING'
       and created_at < now() - interval '10 minutes'
   loop
     update public.agreements set status = 'CANCELLED' where id = v_ag.id;
     update public.requests set status = 'OPEN' where id = v_ag.request_id;
     update public.proposals set status = 'SUBMITTED' where request_id = v_ag.request_id;
   end loop;
   ```
2. In `AgreementScreen.tsx:179`:
   `const expiresAt = new Date(agreement.createdAt).getTime() + 10 * 60 * 1000;`
3. If a customer accepts a proposal while the tradesperson is working, driving, eating, or in a basement with low cellular coverage, the tradesperson has only 600 seconds to receive the notification, open the app, and tap "Confirm & Proceed".
4. After 10 minutes, the server sweep flips the agreement to `CANCELLED`, undoes the deal, and reopens the request.
5. In real-world service operations, 10 minutes is an unrealistic SLA that causes widespread deal drop-off and user frustration.

**Fix Recommendation:**
Increase the agreement confirmation window from 10 minutes to a realistic duration (e.g., 2 hours or 12 hours) with a 30-minute push reminder, or automatically treat the proposer's accepted bid as pre-confirmed by the responder so only the customer needs to confirm.

---

### #A4 — Severe Blanket Direct UPDATE Vulnerability on Agreements

**Area:** `supabase/legacy/migration_launch_hardening.sql:53-56`  
**Severity:** 🟠 P1 (Security & Integrity Breach)

**Root cause:**
1. In `supabase/legacy/migration_launch_hardening.sql:53-56`:
   ```sql
   create policy upd_agreements on public.agreements for update
     using     (auth.uid()::text in (requester_user_id, responder_user_id))
     with check (auth.uid()::text in (requester_user_id, responder_user_id));
   ```
2. This policy allows ANY authenticated requester or responder to update ANY column of the agreement via standard Supabase client calls (`supabase.from("agreements").update(...)`).
3. There are no column restrictions or check triggers. A malicious participant can directly PATCH:
   - `agreed_price: 1`
   - `payment_status: "PAID"`
   - `status: "COMPLETED"`
   - `requester_confirmed: true, responder_confirmed: true`
4. All the security checks in SECURITY DEFINER RPCs (`agreement_confirm`, `agreement_claim_payment`, `agreement_complete`) are completely bypassed because the underlying table permits direct client writes.

**Fix Recommendation:**
Drop `upd_agreements` policy. Ensure all agreement mutations strictly execute through vetted SECURITY DEFINER RPCs, or restrict `upd_agreements` using a BEFORE UPDATE trigger that forbids modifying `agreed_price`, `status`, `payment_status`, or confirmation flags outside trusted RPCs.

---

### #A5 — Rate Screen Inverted Role Bug (Responder Rates Themselves)

**Area:** `src/screens/requests/RateScreen.tsx:51, 64-66`, `src/screens/requests/Agreements.tsx:88-96`  
**Severity:** 🟠 P1 (Corrupted Ratings & Self-Review)

**Root cause:**
1. In `Agreements.tsx:88-96`:
   ```tsx
   {a.status === "COMPLETED" && (
     <button className="btn btn-ghost btn-sm btn-block" onClick={() => nav(`/rate/${a.id}`)}>
       {tf("rate_person", { name: otherName })}
     </button>
   )}
   ```
   Both the requester and responder can click "Rate {otherName}".
2. In `RateScreen.tsx:64-66`:
   ```tsx
   <SafeImg src={a.responderAvatar} ... />
   <h2 className="bold h2">How was {a.responderName}?</h2>
   ```
   And line 51:
   ```ts
   await requestService.rate(a.responderUserId, rating, ...);
   ```
3. `RateScreen.tsx` hardcodes `a.responderUserId`, `a.responderName`, and `a.responderAvatar`.
4. When a provider rates a completed agreement, the screen shows the provider's own name/avatar and writes the rating to the provider's own `user_id`. The provider rates themselves instead of reviewing the customer.

**Fix Recommendation:**
Determine ratee dynamically based on the current viewer:
```ts
const isRequester = user.id === a.requesterUserId;
const targetUserId = isRequester ? a.responderUserId : a.requesterUserId;
const targetName = isRequester ? a.responderName : a.requesterName;
const targetAvatar = isRequester ? a.responderAvatar : a.requesterAvatar;
```
Use `targetUserId`, `targetName`, and `targetAvatar` for all rendering and rating submission calls.

---

### #A6 — Zero In-Context Communication Channels on Active Agreements

**Area:** `src/screens/requests/AgreementScreen.tsx`  
**Severity:** 🟠 P1 (Communication Deadlock)

**Root cause:**
1. In `AgreementScreen.tsx`, there are no buttons or links to initiate a 1:1 chat or phone call with the other party.
2. In `RequestDetail.tsx:405`, a `MessageCircle` button exists before an offer is accepted. Once the deal is accepted and transitions to `/agreement/:id`, the chat entry point disappears.
3. During `ACTIVE` or `IN_PROGRESS` stages, parties must coordinate physical arrival, addresses, materials, and timing. Having no chat trigger in the agreement screen forces users to leave the screen, search through `/chats`, or use external apps.

**Fix Recommendation:**
Add a primary "Chat with {otherName}" button in the header and party card of `AgreementScreen.tsx`, triggering `chatService.getOrCreate(...)` and navigating to `/chat/:id`.

---

### #A7 — Silent Dead-End Disputes (Zero Notifications to Admin or Counterparty)

**Area:** `supabase/migrations/20260822_booking_and_deal_integrity.sql:177-186`, `src/screens/requests/AgreementScreen.tsx:304-315`  
**Severity:** 🟠 P1 (Unresolved Dispute Deadlock)

**Root cause:**
1. In `agreement_dispute` (`20260822_booking_and_deal_integrity.sql:177-186`):
   ```sql
   update public.agreements set status = 'DISPUTED', dispute_reason = p_reason where id = p_id;
   ```
2. The RPC does NOT insert a notification into `public.notifications` for the other party, nor does it alert platform administrators.
3. On `AgreementScreen.tsx:304-315`, a disputed agreement displays an orange warning banner with zero actionable buttons.
4. Neither party can submit evidence, cancel the deal, or message an arbitrator. The deal sits dead in the water indefinitely.

**Fix Recommendation:**
1. In `agreement_dispute`, notify the other party and platform administrators (`type: 'DISPUTE_RAISED'`).
2. Provide a "Contact Support" or "Cancel Job by Mutual Agreement" action on disputed agreement screens.

---

### #A8 — Deal UPI Payment Sheet Fails for Team-Submitted Deals

**Area:** `src/components/DealUpiSheet.tsx:17-24`  
**Severity:** 🟡 P2 (Payment Blocker)

**Root cause:**
1. In `DealUpiSheet.tsx:17-24`:
   ```ts
   async function fetchUpiForUser(userId: string): Promise<string | null> {
     const sb = getSupabase();
     const [prov, biz] = await Promise.all([
       sb.from("providers").select("upi_id").eq("user_id", userId)...,
       sb.from("businesses").select("upi_id").eq("owner_user_id", userId)...,
     ]);
     return (prov.data?.[0] as any)?.upi_id ?? (biz.data?.[0] as any)?.upi_id ?? null;
   }
   ```
2. `payeeUserId` passed to `DealUpiSheet` is `agreement.responderUserId`.
3. If employee Alice submitted the bid for "Sharma Bakery" (owned by Bob), `payeeUserId` is Alice.
4. Alice has no business row with `owner_user_id = Alice`, so `fetchUpiForUser` returns `null`.
5. The sheet informs the customer that "{payeeName} hasn't set up UPI yet", even though Sharma Bakery has an active UPI ID registered under Bob.

**Fix Recommendation:**
Query UPI ID using `agreement.responderEntityId` when `responderType === 'business'`, falling back to `businesses.upi_id` by business ID.

---

### #A9 — Fixed Action Bar Overlaps and Clips Page Content in ACTIVE Status

**Area:** `src/screens/requests/AgreementScreen.tsx:617-623, 465-513`  
**Severity:** 🟡 P2 (UI Clipping)

**Root cause:**
1. In `AgreementScreen.tsx:617`:
   `const actionAreaHeight = status === "CANCELLED" ? 150 : (status === "REVIEW" && isRequester ? 140 : 72);`
2. For `status === "ACTIVE"`, `actionAreaHeight` resolves to 72px.
3. In `ACTIVE` status, `ActionArea()` renders QR button, UPI & Cash claim buttons, payment instructions, and Cancel button—a total height of ~190px.
4. The scroll container padding is only `88px` (`72 + 16`). Over 100px of page content (including the `PaymentStatusCard` and terms) is cut off underneath the fixed bar.
5. In addition, `paddingBottom` does not include `env(safe-area-inset-bottom)`.

**Fix Recommendation:**
Calculate `actionAreaHeight` dynamically via a container ref or set `actionAreaHeight = 210` for `status === "ACTIVE"`, and include `env(safe-area-inset-bottom)` in bottom container padding.

---

### #A10 — Infinite Unthrottled Payment Nudges

**Area:** `src/services/engagement/requestService.ts:617-639`, `src/screens/requests/AgreementScreen.tsx:430-439`  
**Severity:** 🟡 P2 (Notification Spam)

**Root cause:**
1. In `requestService.ts:617-639`, `nudgeAgreementPayment` directly sends a push notification with no rate limiting or server-side cooldown.
2. A provider can tap "🔔 Request payment" repeatedly, flooding the customer's phone with notifications.

**Fix Recommendation:**
Enforce a cooldown (e.g. 1 nudge per 6 hours) tracked in `agreements.last_payment_nudge_at` or `localStorage`.

---

### #A11 — Blind Proposal Status Overwrite on Agreement Cancellation

**Area:** `supabase/migrations/20260825_agreement_cancel_and_expiry.sql:83, 114`  
**Severity:** 🟡 P2 (State Corruption)

**Root cause:**
1. When an agreement cancels or expires, the function executes:
   `update public.proposals set status = 'SUBMITTED' where request_id = v_ag.request_id;`
2. This blindly resets ALL proposals on the request to `SUBMITTED`, including proposals that were deliberately `WITHDRAWN` by responders prior to the deal.

**Fix Recommendation:**
Only revert proposals whose status was `ACCEPTED` or `REJECTED`:
`update public.proposals set status = 'SUBMITTED' where request_id = v_ag.request_id and status in ('ACCEPTED', 'REJECTED');`

---

### #A12 — Hardcoded `#fff` Tokens Across Agreement Surfaces

**Area:** `src/screens/requests/AgreementScreen.tsx:73, 323, 354, 362, 389, 425, 456, 465, 520, 563, 582, 604, 697`, `src/components/DealUpiSheet.tsx:56, 93`  
**Severity:** 🟢 P3 (Design System)

**Root cause:**
1. Multiple raw `#fff` background color literals violate theme token guidelines and break dark mode rendering.

**Fix Recommendation:**
Replace raw `#fff` strings with `var(--card-bg)` or `var(--bg)` CSS custom properties.
