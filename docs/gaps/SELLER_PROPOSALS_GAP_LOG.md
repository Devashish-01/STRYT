# Seller Proposal & Quote Submission — Bug & Gap Log

**Purpose:** Documenting every architectural flaw, permission blocker, broken negotiation loop, and mobile UX defect in **Flow 4.2: Seller Proposal & Quote Submission** (`src/screens/requests/SubmitProposal.tsx`, `src/screens/requests/RequestDetail.tsx`, `src/services/engagement/requestService.ts`, `src/screens/business/manage/BusinessRequests.tsx`, `src/screens/provider/manage/ProviderFindWork.tsx`, `src/lib/quoteTemplates.ts`, and Supabase RPCs/migrations `20260909_notify_request_agreement_gaps.sql` / `20260836_request_flow_fixes.sql` / `20260841_business_team_scopes.sql`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **P1** | One-Way Broken Negotiation: Responders Cannot Accept Customer Counter-Offers | 🔴 P0 (Broken Core Transaction) | In `accept_proposal_counter` (`20260909_notify_request_agreement_gaps.sql:179, 195`), the server strictly requires `v_request.requester_user_id = v_uid` and `v_counter.by_user_id = v_proposal.responder_user_id`. In `RequestDetail.tsx:447-456`, only the requester gets an "Accept Counter" button. If a customer counters an ₹800 quote down to ₹600, the provider **cannot accept the customer's counter**—they are forced to send another redundant counter back and wait for the customer to accept their own counter. |
| **P2** | Business Owners & Team Mates Locked Out from Withdrawing or Countering Business Proposals | 🔴 P0 (Multi-User Console Crash) | In `withdraw_proposal` (`20260836_request_flow_fixes.sql:253-255`), it strictly enforces `v_proposal.responder_user_id = v_uid`. In `proposal_submit_counter` (`20260909_notify_request_agreement_gaps.sql:49-51`), it requires `v_uid in (requester, responder_user_id)`. If employee Alice submits a proposal for "Sharma Bakery", shop owner Bob cannot withdraw it from `BusinessRequests.tsx` (throws `NOT_YOUR_PROPOSAL`), nor counter back (`NOT_A_PARTY`), completely breaking delegated team access. |
| **P3** | Duplicate Proposal Submission Allowed on Same Request | 🟠 P1 (Spam & Bid Collision) | In `RequestDetail.tsx:516-529`, the bottom CTA button navigates to `/request/:id/propose` for all non-owners without checking if the user/entity already submitted a proposal. In `SubmitProposal.tsx` and the database `proposals` table, there is no unique constraint or duplicate check on `(request_id, responder_user_id)` or `(request_id, responder_entity_id)`, allowing duplicate conflicting quotes to be created. |
| **P4** | Proposals Permitted on Expired, Closed, and Cancelled Requests | 🟠 P1 (Dead Submissions & Spurious Alerts) | `SubmitProposal.tsx` does not check `r.status === 'OPEN'` or verify that `r.expiresAt` hasn't passed before rendering the form. The backend insert policy and trigger do not validate request status. Sellers waste time drafting quotes for closed requests, triggering zombie push notifications to customers. |
| **P5** | Counter-Offers Are Completely Non-Realtime (Omitted from Publication) | 🟠 P1 (Silent Negotiation Desync) | In `20260822_booking_and_deal_integrity.sql`, `proposal_counters` was never added to `supabase_realtime` publication. In `RequestDetail.tsx:39-51`, subscriptions only listen to `requests` and `proposals`. Neither user's screen updates in real time when counter-offers are sent; without pull-to-refresh on `RequestDetail`, users remain desynced until full page reload. |
| **P6** | Silent Identity Downgrade to Personal Profile on Permission Failures | 🟠 P1 (Identity Hijacking / De-anonymisation) | In `requestService.ts:322-328`, if verification for a business or provider entity fails (e.g. token refresh delay or session scope check), the service silently overwrites `responderType = "user"` and removes `responderEntityId`. The proposal is posted publicly under the employee's personal user name and avatar without warning. |
| **P7** | Quote Templates Completely Inaccessible in Proposal Flow | 🟡 P2 (Feature Disconnect) | `src/lib/quoteTemplates.ts` provides saved proposal templates managed in `ProviderFindWork.tsx:88, 146-160`. However, `SubmitProposal.tsx` does not integrate or load quote templates, forcing providers to manually retype prices and pitches on every bid. |
| **P8** | Irreversible Instant Proposal Acceptance Without Confirmation Sheet | 🟡 P2 (Accidental Mobile Tap Hazard) | In `RequestDetail.tsx:130-142`, clicking "Accept" immediately executes the atomic RPC `accept_proposal`, permanently creating an agreement and cancelling all sibling proposals. There is no confirmation dialog or modal sheet to prevent accidental thumb taps while scrolling. |
| **P9** | Single-Sided Budgets Display as Misleading "Open Budget" | 🟡 P2 (Misleading Budget Display) | In `SubmitProposal.tsx:104` and `RequestDetail.tsx:103`, budget evaluation uses `r.budgetMin && r.budgetMax ? ... : "Open budget"`. If a requester specifies only `budgetMax = 1000` ("Up to ₹1,000"), the screen displays "Open budget", misleading sellers into quoting inflated prices. |
| **P10** | Responder Tagline Never Populated in Proposal Submission | 🟡 P2 (Visual Gap) | In `requestService.ts:311, 337-346`, `submitProposal` never queries or writes `responder_tagline`. Consequently, `{p.responderTagline}` in `RequestDetail.tsx:372` is always `undefined`, leaving an awkward blank space on proposal cards. |
| **P11** | Raw Error Swallowing Masks Server Rejection Reasons | 🟡 P2 (Opaque Error UX) | In `SubmitProposal.tsx:49-52`, `catch { showToast("Couldn't send. Try again."); setSending(false); }` drops the exception, hiding informative API messages (authentication required, request expired, permission denied). |
| **P12** | Hardcoded `#fff` Tokens and Missing Safe-Area Inset on Fixed Bottom Bar | 🟢 P3 (Design System & Mobile Polish) | Hardcoded `#fff` in `SubmitProposal.tsx:112, 142, 162, 174` and `RequestDetail.tsx:335, 465, 482, 520` break dark mode. The fixed bottom bar (`SubmitProposal.tsx:174`) lacks `env(safe-area-inset-bottom)` padding, risking overlap with Android gesture navigation bars. |

---

## Detailed Gap Analyses

---

### #P1 — One-Way Broken Negotiation: Responders Cannot Accept Customer Counter-Offers

**Area:** `src/screens/requests/RequestDetail.tsx:447-456, 476-500`, `supabase/migrations/20260909_notify_request_agreement_gaps.sql:179-197`  
**Severity:** 🔴 P0 (Broken Core Transaction)

**Root cause:**
1. In `supabase/migrations/20260909_notify_request_agreement_gaps.sql`:
   ```sql
   create or replace function public.accept_proposal_counter(
     p_proposal_id text, p_counter_id text
   ) returns text ...
   begin
     ...
     if v_request.requester_user_id is distinct from v_uid then
       raise exception 'NOT_REQUEST_OWNER';
     end if;
     ...
     if v_counter.by_user_id is distinct from v_proposal.responder_user_id then
       raise exception 'COUNTER_NOT_OFFERED_BY_RESPONDER';
     end if;
   ```
2. The RPC strictly enforces that:
   - Only the request owner (`requester_user_id`) can call `accept_proposal_counter`.
   - The counter being accepted must have been offered by the responder (`by_user_id = responder_user_id`).
3. In `RequestDetail.tsx`:
   ```tsx
   // Lines 447-456: Only rendered for isMine (requester)!
   {isMine && r.status === "OPEN" && !accepted && (p.counters ?? []).length > 0
     && (p.counters ?? [])[(p.counters ?? []).length - 1].by === "responder" && (
     <button className="btn btn-green btn-sm btn-block" onClick={() => acceptCounter(p, ...)}>
       {tf("accept_at_amount", { amount: inr(...) })}
     </button>
   )}
   ```
4. For the responder (`!isMine`), lines 476-500 only render a "Counter back" input. There is **no "Accept Counter" button** at all.
5. If a customer counters an ₹800 quote with ₹600, the seller cannot accept the deal! Even if the seller is completely satisfied with ₹600, they are forced to type "600" as a counter back to the customer, hoping the customer opens the app and accepts their own initial number.

**Fix Recommendation:**
1. Update `accept_proposal_counter` RPC to support bilateral acceptance:
   - If `v_uid` is the requester, the counter being accepted must have been offered by the responder.
   - If `v_uid` is the responder (or authorized business member with `leads` scope), the counter being accepted must have been offered by the requester (`v_counter.by_user_id = v_request.requester_user_id`).
2. Update `RequestDetail.tsx` to render an `Accept at {amount}` button for the responder when the latest counter was submitted by the requester (`c.by === "requester"`).

---

### #P2 — Business Owners & Team Mates Locked Out from Withdrawing or Countering Business Proposals

**Area:** `supabase/migrations/20260836_request_flow_fixes.sql:253-255`, `supabase/migrations/20260909_notify_request_agreement_gaps.sql:49-51`, `src/screens/business/manage/BusinessRequests.tsx:127-136`  
**Severity:** 🔴 P0 (Multi-User Console Crash)

**Root cause:**
1. In `withdraw_proposal` (`20260836_request_flow_fixes.sql:253-255`):
   ```sql
   if v_proposal.responder_user_id is distinct from v_uid then
     raise exception 'NOT_YOUR_PROPOSAL';
   end if;
   ```
2. In `proposal_submit_counter` (`20260909_notify_request_agreement_gaps.sql:49-51`):
   ```sql
   if v_uid not in (v_request.requester_user_id, v_proposal.responder_user_id) then
     raise exception 'NOT_A_PARTY';
   end if;
   ```
3. In `BusinessRequests.tsx:35-39, 118-140`, proposals are queried by business entity (`requestService.myProposals(id)`), where all proposals submitted on behalf of the business are shown to any manager or owner viewing the console.
4. If employee Alice submitted the proposal as "Sharma Bakery", `v_proposal.responder_user_id` is Alice's UID.
5. When business owner Bob (or manager Charlie) opens `BusinessRequests.tsx` and clicks "Withdraw", `withdraw_proposal` throws `NOT_YOUR_PROPOSAL`!
6. Similarly, if Bob attempts to negotiate or send a counter back on that business proposal, `proposal_submit_counter` throws `NOT_A_PARTY`.
7. Neither RPC checks `public.has_business_scope(v_proposal.responder_entity_id, v_uid, 'leads')`.

**Fix Recommendation:**
1. In `withdraw_proposal`, allow withdrawal if:
   `v_proposal.responder_user_id = v_uid OR (v_proposal.responder_type = 'business' AND public.has_business_scope(v_proposal.responder_entity_id, v_uid, 'leads'))`.
2. In `proposal_submit_counter`, allow countering if:
   `v_uid in (v_request.requester_user_id, v_proposal.responder_user_id) OR (v_proposal.responder_type = 'business' AND public.has_business_scope(v_proposal.responder_entity_id, v_uid, 'leads'))`.

---

### #P3 — Duplicate Proposal Submission Allowed on Same Request

**Area:** `src/screens/requests/RequestDetail.tsx:516-529`, `src/screens/requests/SubmitProposal.tsx:34-53`, `src/services/engagement/requestService.ts:286-350`  
**Severity:** 🟠 P1 (Spam & Bid Collision)

**Root cause:**
1. In `RequestDetail.tsx:516-529`, the bottom action bar displays:
   ```tsx
   {!isMine && r.status === "OPEN" && (
     <button className="btn btn-primary btn-block" onClick={() => nav(`/request/${r.id}/propose`)}>
       <Send size={17} /> {t("send_proposal")}
     </button>
   )}
   ```
   It checks only `!isMine && r.status === "OPEN"`. It never checks if the current user or active entity already has an existing proposal in `r.proposals`.
2. In `SubmitProposal.tsx`, there is no validation checking if an active proposal already exists.
3. In `proposals` table, there is no unique constraint on `(request_id, responder_user_id)` or `(request_id, responder_entity_id)`.
4. A provider can repeatedly open `/request/:id/propose` and insert multiple proposals, cluttering the customer's offers list with conflicting quotes from the same provider.

**Fix Recommendation:**
1. In `RequestDetail.tsx`, detect if the current user / active entity already submitted a proposal:
   - If a proposal exists and is `SUBMITTED`, display a "View Your Proposal" or "Proposal Sent (₹X)" button leading to their proposal card or allowing a quote edit.
2. In `SubmitProposal.tsx`, if an active proposal already exists, prefill current quote details and change the action to "Update Proposal" or warn the user.
3. Add a partial unique index in Supabase:
   `create unique index if not exists idx_proposals_active_user on public.proposals (request_id, responder_user_id) where status = 'SUBMITTED';`

---

### #P4 — Proposals Permitted on Expired, Closed, and Cancelled Requests

**Area:** `src/screens/requests/SubmitProposal.tsx:16, 55-85`, `src/services/engagement/requestService.ts:286-350`  
**Severity:** 🟠 P1 (Dead Submissions & Spurious Alerts)

**Root cause:**
1. In `SubmitProposal.tsx`, `useQuery(() => requestService.get(id))` loads request data.
2. The screen checks if `!r` ("Request not found"), but does not check `r.status !== 'OPEN'` or if `new Date(r.expiresAt).getTime() < Date.now()`.
3. The full submission form is rendered even if the request is `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, or `EXPIRED`.
4. Neither `requestService.submitProposal` nor the database before-insert triggers verify that the parent request is in `OPEN` status.
5. The insert succeeds, and `trg_notify_proposal` triggers a push notification to the customer for a job that was already awarded or expired.

**Fix Recommendation:**
1. In `SubmitProposal.tsx`, if `r.status !== 'OPEN'` or the request is expired, display an `EmptyState` ("Request Closed / Expired — This request is no longer accepting proposals") and disable the form.
2. In database trigger `enforce_proposal_responder_entity_owner` or a before-insert check on `proposals`, enforce:
   `if (select status from public.requests where id = new.request_id) <> 'OPEN' then raise exception 'REQUEST_NOT_OPEN'; end if;`.

---

### #P5 — Counter-Offers Are Completely Non-Realtime (Omitted from Publication)

**Area:** `src/screens/requests/RequestDetail.tsx:39-51`, `supabase/migrations/20260822_booking_and_deal_integrity.sql:60-70`  
**Severity:** 🟠 P1 (Silent Negotiation Desync)

**Root cause:**
1. In `supabase/migrations/20260822_booking_and_deal_integrity.sql`, `proposal_counters` table was created with RLS, but was **never added to `supabase_realtime` publication**:
   `alter publication supabase_realtime add table public.proposal_counters;` is missing from all migrations.
2. In `RequestDetail.tsx:39-51`, the component subscribes to `postgres_changes` on `proposals` and `requests`, but has no channel for `proposal_counters`.
3. When Party A submits a counter-offer, the RPC inserts into `proposal_counters` without touching `proposals.updated_at`.
4. As a result, Party B's screen receives zero realtime events. Because `RequestDetail.tsx` also lacks pull-to-refresh, Party B is unaware of new counter-offers until navigating away and returning.

**Fix Recommendation:**
1. Add `alter publication supabase_realtime add table public.proposal_counters;` to a migration.
2. In `RequestDetail.tsx`, subscribe to `postgres_changes` on `proposal_counters` filtered by `proposal_id in (...)` or touch `proposals.updated_at` in `proposal_submit_counter` so existing proposal subscriptions trigger a refetch.
3. Integrate `usePullToRefresh` into `RequestDetail.tsx`.

---

### #P6 — Silent Identity Downgrade to Personal Profile on Permission Failures

**Area:** `src/services/engagement/requestService.ts:322-328`  
**Severity:** 🟠 P1 (Identity Hijacking / De-anonymisation)

**Root cause:**
1. In `requestService.ts:311-329`:
   ```ts
   if (allowed && entity) {
     responderName = (entity as any)[nameCol] ?? undefined;
     responderAvatar = (entity as any)[avatarCol] ?? "";
   } else {
     responderType = "user";
     responderEntityId = undefined;
   }
   ```
2. If `allowed` fails (e.g. transient network glitch checking `my_business_access_scope`, or newly assigned team member whose session hasn't refreshed), the code silently falls back to `responderType = "user"`.
3. It then fetches the employee's personal user record (`users.name, users.avatar`) and submits the proposal under the employee's personal identity.
4. The proposal is public. The customer sees a personal user with 0 business credentials quoting on their job. The business owner sees nothing in the business console.

**Fix Recommendation:**
If the user explicitly selected a business or provider identity (`respondingAs`), throw an error (`UNAUTHORIZED_RESPONDER_ENTITY`, "You do not have permission to respond on behalf of this business") rather than silently falling back to a personal profile.

---

### #P7 — Quote Templates Completely Inaccessible in Proposal Flow

**Area:** `src/screens/requests/SubmitProposal.tsx:110-127`, `src/lib/quoteTemplates.ts:14-46`, `src/screens/provider/manage/ProviderFindWork.tsx:146-160`  
**Severity:** 🟡 P2 (Feature Disconnect)

**Root cause:**
1. `ProviderFindWork.tsx` features a dedicated "⚡ Quote templates" tab where providers can create and save reusable quote snippets with a title, body, and standard price.
2. `src/lib/quoteTemplates.ts` provides `loadQuoteTemplates(providerId)`.
3. However, `SubmitProposal.tsx` has no imports or UI elements referencing quote templates.
4. When a provider clicks "Send Proposal", they are presented with empty text inputs and must manually retype their pitch and price every time.

**Fix Recommendation:**
In `SubmitProposal.tsx`, if `respondingAs?.type === 'provider'`, load saved templates using `loadQuoteTemplates(respondingAs.id)`. Render a horizontal carousel of quick-pick template chips (e.g. `⚡ Standard Visit`, `⚡ Inspection & Repair`) that autofill `price`, `eta`, and `message` on tap.

---

### #P8 — Irreversible Instant Proposal Acceptance Without Confirmation Sheet

**Area:** `src/screens/requests/RequestDetail.tsx:130-142`  
**Severity:** 🟡 P2 (Accidental Mobile Tap Hazard)

**Root cause:**
1. In `RequestDetail.tsx:410`:
   `<button className="btn btn-green btn-sm" onClick={() => acceptProposal(p)}>Accept</button>`
2. When tapped, `acceptProposal()` immediately executes:
   `await requestService.acceptProposal(p.id)`
3. Server RPC `accept_proposal` atomically:
   - Changes proposal status to `ACCEPTED`.
   - Creates an agreement.
   - Transitions request to `IN_PROGRESS`.
   - Rejects all competing proposals (`status = 'REJECTED'`).
4. On mobile devices, users scrolling through a list of 5-10 proposals can easily trigger an accidental tap on the green button, irreversibly closing the deal and rejecting all other candidates without any confirmation modal or summary sheet.

**Fix Recommendation:**
Add a confirmation bottom sheet or modal: "Accept offer of ₹X from {responderName}?", summarizing terms and noting that sibling quotes will be closed, requiring user confirmation before calling the RPC.

---

### #P9 — Single-Sided Budgets Display as Misleading "Open Budget"

**Area:** `src/screens/requests/SubmitProposal.tsx:104`, `src/screens/requests/RequestDetail.tsx:103`  
**Severity:** 🟡 P2 (Misleading Budget Display)

**Root cause:**
1. In `RequestDetail.tsx:103`:
   `const budget = r.budgetMin && r.budgetMax ? `${inr(r.budgetMin)} – ${inr(r.budgetMax)}` : t("open_budget");`
2. In `SubmitProposal.tsx:104`:
   `{r.budgetMin && r.budgetMax ? `${inr(r.budgetMin)}–${inr(r.budgetMax)}` : t("open_word")}`
3. When posting a request in `AskCompose.tsx`, a customer often fills only `budgetMax` (e.g. "Max ₹1,500") or only `budgetMin`.
4. Because the condition strictly requires both `budgetMin && budgetMax`, any single-sided budget renders as "Open budget" / "Open".
5. Sellers believe the customer has unlimited budget and submit quotes significantly exceeding the customer's actual budget cap.

**Fix Recommendation:**
Format budget helper:
```ts
function formatBudget(min?: number, max?: number): string {
  if (min && max) return `${inr(min)} – ${inr(max)}`;
  if (max) return `Up to ${inr(max)}`;
  if (min) return `From ${inr(min)}`;
  return "Open budget";
}
```

---

### #P10 — Responder Tagline Never Populated in Proposal Submission

**Area:** `src/services/engagement/requestService.ts:311, 337-346`, `src/screens/requests/RequestDetail.tsx:372`  
**Severity:** 🟡 P2 (Visual Gap)

**Root cause:**
1. The `proposals` table schema has column `responder_tagline text`.
2. In `RequestDetail.tsx:372`, the UI renders:
   `<span className="tiny muted">{p.responderTagline}</span>`
3. In `requestService.ts:submitProposal()`, when querying entity details from `businesses` or `providers`, it only selects `name` and `cover_image`/`avatar`. It does not query `tagline` or `bio`.
4. In `row`, `responder_tagline` is completely omitted.
5. Consequently, `p.responderTagline` is always undefined on every proposal card, creating an uneven visual gap beneath the responder name.

**Fix Recommendation:**
In `requestService.submitProposal()`, select `tagline` from `businesses`/`providers` (or user bio for personal profiles) and populate `responder_tagline` on insert.

---

### #P11 — Raw Error Swallowing Masks Server Rejection Reasons

**Area:** `src/screens/requests/SubmitProposal.tsx:49-52`  
**Severity:** 🟡 P2 (Opaque Error UX)

**Root cause:**
1. In `SubmitProposal.tsx:49-52`:
   ```ts
   try {
     await requestService.submitProposal(...);
     showToast(boost ? "Proposal sent & prioritized!" : "Proposal sent!");
     setTimeout(() => nav(-1), 600);
   } catch {
     showToast("Couldn't send. Try again.");
     setSending(false);
   }
   ```
2. The `catch` clause ignores the caught error entirely.
3. If submission fails because the user is unauthenticated, the request was closed, the price was invalid, or delegated leads scope was missing, the user receives only a generic "Couldn't send. Try again." without any actionable explanation.

**Fix Recommendation:**
Inspect `error?.message` or error codes and display helpful feedback (e.g. `showToast(e?.message || "Couldn't send proposal. Try again.")`).

---

### #P12 — Hardcoded `#fff` Tokens and Missing Safe-Area Inset on Fixed Bottom Bar

**Area:** `src/screens/requests/SubmitProposal.tsx:112, 142, 162, 174`, `src/screens/requests/RequestDetail.tsx:335, 465, 482, 520`  
**Severity:** 🟢 P3 (Design System & Mobile Polish)

**Root cause:**
1. Multiple form inputs and cards use raw `#fff` background strings:
   `SubmitProposal.tsx:112` (`background: "#fff"`), `174` (`background: "#fff"`), `RequestDetail.tsx:465`, `482`, `520`.
2. In `SubmitProposal.tsx:174`:
   `style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}`
   The fixed bottom container lacks `paddingBottom: "calc(12px + env(safe-area-inset-bottom))"`. On Android devices with navigation bars or gesture pills, the primary CTA button overlaps with the system navigation area.

**Fix Recommendation:**
Replace raw `#fff` with `var(--card-bg)` or `var(--bg)` tokens, and add safe-area inset padding to fixed bottom action containers.
