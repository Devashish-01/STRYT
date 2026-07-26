# STRYT Audit — Requests / Proposals / Agreements + Appointments / Booking

**Scope:** `AskCompose`, `RequestDetail`, `SubmitProposal`, `Agreements`, `AgreementScreen`, `RateScreen`, `MyAppointments`, `BusinessAppointments`, `AppointmentSheet`, `requestService`, `appointmentService`, `utils/availability.ts`, and the backing Supabase schema/RLS/RPCs (`schema.sql`, `migration_launch_hardening.sql`, `migration_r17_agreement_expiry.sql`, `20260701_appointments.sql`, `20260703_appointment_console.sql`, `20260707_agreement_payment_confirmation.sql`, `20260708_appointment_payment_timing.sql`, `20260717_delete_fix_indexes_expiry.sql`).

**Method:** every screen, service method, and RPC in this slice was read in full; cross-referenced against the DB schema/RLS/triggers to confirm claims made in code comments (e.g. "atomic RPC", "notified via trigger") are actually true rather than aspirational.

---

## Executive summary

This is the most mature subsystem in the app. It shows real engineering discipline: the accept-proposal race condition was fixed with an atomic SECURITY DEFINER RPC, the one-sided payment-claim bug was caught and fixed identically for both appointments and agreements, expiry sweeps were throttled to avoid a latency tax, and RLS is scoped correctly on every table touched (`appointments`, `agreements`, `blocked_slots`, `payments`). The self-healing housekeeping pass (auto-cancel stale PENDING, auto-complete past ACCEPTED) is a genuinely good pattern most marketplace apps skip.

That said, there are real gaps: the escrow/payment system is split-brained (a dead Razorpay-shaped `payments` table alongside a working self-reported claim/confirm system that the UI still partially surfaces as "escrow held"), the request feed's pagination is built but unused (users silently only ever see the first ~20 requests), the boost feature charges nothing (₹49 is décor), disputes have no evidence attachment and resolve on admin's word alone, and the daily-appointment-limit check has a client-server race that lets it be bypassed by double-tapping or two devices. None of these are launch-blocking on their own, but taken together they represent the gap between "works for a demo" and "survives 100,000 real users with real money and real disputes."

---

## P0 — Critical (fix before/at launch)

**P0-1. Escrow status is fabricated UI, not a real payment state.**
`AgreementScreen.tsx` renders a `payment_held_escrow` / `payment_released` badge sourced from `requestService.paymentForAgreement()`, which reads the `payments` table. That table (`migration_launch_hardening.sql`) is written **only** by a Razorpay Edge Function that, per the code comments in `20260707_agreement_payment_confirmation.sql`, "was never deployed." So in production this badge will never appear — dead code that silently does nothing, which is fine — but the real payment status lives on `agreements.payment_status` (`UNPAID | PENDING_CONFIRM | PAID | REJECTED`) and is rendered by different UI in the same screen. Two payment-status systems coexist in one screen with no visible reconciliation. If a future dev wires the Razorpay function without removing the old badge path, users will see conflicting payment states.
*Fix:* delete the dead `payments`/escrow read path from `AgreementScreen` and `paymentForAgreement()`, or clearly gate it behind a feature flag that's off. Pick one payment-status source of truth.

**P0-2. Daily appointment limit (5/day) is enforced client-side with a read-then-write race.**
Both `appointmentService.create()` and `AppointmentSheet` independently recompute `aptsTodayCount` by listing existing appointments and comparing to `DAILY_APPOINTMENT_LIMIT = 5`. There is no DB constraint or serialized check. Two rapid taps, two tabs, or two devices can each pass the check against the same stale count and insert 6+ bookings. For a shop with limited slots this directly causes overbooking incidents that generate support tickets and angry customers standing in a queue that doesn't exist.
*Fix:* enforce via a Postgres `check` + trigger (`count(*) where customer_user_id = X and date_trunc('day', scheduled_for) = Y and status not in (...)`) or a partial unique index, not just client logic.

**P0-3. No server-side double-booking guard on `appointments.scheduled_for`.**
`generateWorkingSlots()` marks a slot unavailable if a **local, already-fetched** list of appointments contains one at that exact timestamp — this is a race identical to P0-2. Two customers who load the sheet within the same few seconds can both see the 3:00 PM slot as free and both successfully insert a booking for it, because there's no unique constraint on `(target_id, scheduled_for)` (excluding cancelled/rejected) at the DB level.
*Fix:* add a partial unique index: `create unique index on appointments (target_id, scheduled_for) where status not in ('CANCELLED','REJECTED')`. Handle the resulting insert error gracefully client-side ("that slot was just taken — pick another").

**P0-4. Disputes resolve on admin's word with zero evidence trail.**
`AdminPanel.tsx`'s `AdminDisputes` shows only `dispute_reason` (free text from the requester) and two buttons: "Cancel job" / "Mark complete." There's no way for the responder to submit a counter-statement, no photo evidence, no chat log link, no partial-refund option — the admin is asked to arbitrate a real money dispute between two strangers based on one party's unchallenged claim. At scale this is a fairness/trust problem that will generate appeals and reputational damage, and currently there's no mechanism to even collect the other side's story.
*Fix:* at minimum, let the responder respond to a dispute (their own text field), and surface the agreement's chat thread / progress timeline to the admin inline. Partial-completion / partial-refund states would also close a real gap (a job that's 80% done shouldn't only ever resolve to "all money released" or "all money cancelled").

---

## P1 — High priority (workflow / architecture)

**P1-1. Request feed pagination exists in the service but is never consumed by the UI.**
`requestService.feed()` returns a proper `Page<RequestPost>` with `page.next_cursor` / `page.has_more`. `Requests.tsx` destructures `feedPage?.data` and never looks at `page` again — no "load more" button, no infinite scroll, no cursor stored in state. Once a neighborhood has more than `DEFAULT_LIMIT` (check `supabasePage.ts`, typically 20) open requests, everything past the first page is **invisible** to every user, forever, with no error and no indication anything is missing. This will look like "requests just stop showing up" to both customers and businesses hunting for leads once the network is a real neighborhood scale, not silently fail — it'll just be wrong.
*Fix:* wire an infinite-scroll or "load more" control using the existing cursor; this is close to a one-screen change since the service layer already does the work.

**P1-2. The ₹49 proposal boost charges nothing and has no visible outcome differentiation beyond sort order.**
`SubmitProposal.tsx` lets a responder toggle "Boost this proposal — ₹49," which sets `isBoosted: true` on the proposal row. There is no payment collection call anywhere in this flow (no `paymentService`, no UPI sheet, no charge). The only visible effect is a badge and a default sort weight in `RequestDetail`'s "Best" sort. This is either an unfinished monetization feature (revenue leak — providers get the boost for free) or intentionally free (in which case the "₹49" label is actively misleading and erodes trust the first time someone actually expects to be charged and isn't, or worse, expects a refund).
*Fix:* either wire real payment collection before allowing `isBoosted: true`, or remove the price label and reframe as a free "prioritize my offer" toggle if that's the intended state.

**P1-3. `AgreementScreen.tsx` is a single 500+ line component handling progress bar, live tracking, payment claim/confirm, dispute flow, and process guide.**
This is a maintainability risk, not a user-facing bug today — but the file mixes five distinct concerns (status stepper, live GPS tracking, two different payment UIs, dispute submission, and a "what happens next" guide) in one component with a giant inline `ActionArea()` switch statement keyed on 8 status values crossed with requester/responder perspective (16 effective branches). Every new agreement status added in the future multiplies this. A bug fix to one branch risks an unrelated regression in a sibling branch simply from proximity.
*Fix:* extract `ActionArea` per-status into named components (`PendingAction`, `ActiveAction`, `DepositPaidAction`, etc.) taking `{ agreement, isRequester, run }` as props. No behavior change required, pure refactor for maintainability.

**P1-4. Counter-offer negotiation has no cap and no "accept counter" action — it's a one-way ratchet toward confusion.**
In `RequestDetail.tsx`, both requester and responder can keep sending `submitCounter()` indefinitely. There is no button to "accept this counter" — the only way to close a negotiation is for the requester to hit the original **Accept** button on the *original* `Proposal`, which still uses `p.price`, not the latest countered amount. If a counter-offer chain settles on ₹800 instead of the original ₹1000 quote, accepting still creates the agreement at `p.price` (₹1000) via `accept_proposal(p_proposal_id)`, which reads `v_prop.price` directly (see `migration_launch_hardening.sql`). **The negotiated price is not what gets charged.** This is a genuine logic bug: a customer who negotiates down and then clicks Accept will be agreed at the wrong price, and the RPC has no way to know a counter was ever agreed to.
*Fix:* either (a) update `proposals.price` when a counter is accepted (needs an explicit "accept counter" action that both mutates price and triggers acceptance), or (b) have `accept_proposal` accept an optional `p_final_price` argument sourced from the latest counter, with ownership validated. Right now there is no accept-a-counter action at all — this needs a product decision plus a code fix, not just a fix.

**P1-5. `submitCounter` has no ownership/party validation.**
`requestService.submitCounter(proposalId, amount, message)` inserts into `proposal_counters` stamped with `by_user_id: uid`, with no check that `uid` is actually the requester or the responder on that proposal's parent request. Combined with `rowToProposal`'s `by: c.by_user_id === requesterUserId ? "requester" : "responder"` labeling logic, any authenticated user could, in principle, insert a counter on someone else's proposal thread (RLS permitting — verify the `proposal_counters` RLS policy explicitly restricts to participants; it wasn't found in the reviewed migrations, meaning it may be relying on the generic `write_proposals`-style authenticated-role policy from `rls.sql`, which allows **any authenticated user** to write, not just the two parties).
*Fix:* add an explicit RLS policy on `proposal_counters` restricting insert to the request's requester or the proposal's responder, mirroring the `agreements` tightening already done in `migration_launch_hardening.sql`.

**P1-6. Appointment cash payments require seller confirmation — correct, but the UX doesn't explain why to first-time users.**
This was clearly a deliberate anti-fraud fix (per the code comments: cash used to auto-mark PAID on the customer's say-so alone). It's the right call security-wise, but from a product standpoint, a customer who hands over cash and taps "I've paid in cash" now sees a "waiting for confirmation" state for something that already physically happened in front of the seller. Without an in-context explainer at that exact moment (there is a brief note, but it's easy to miss), this will generate "why hasn't my payment cleared, I paid in person" support tickets at scale.
*Fix:* keep the security model; strengthen the copy at the exact confirm-tap moment, and consider letting the seller confirm cash in the *same physical moment* via a QR/one-tap-on-owner's-phone handoff rather than an async wait.

**P1-7. Two structurally identical payment-claim systems (`agreements` and `appointments`) are implemented as fully separate, hand-duplicated code paths.**
`claimAgreementPayment`/`confirmAgreementPayment`/`rejectAgreementPaymentClaim` in `requestService.ts` and `claimPayment`/`confirmPayment`/`rejectPaymentClaim` in `appointmentService.ts` do the same state machine (UNPAID → PENDING_CONFIRM → PAID/REJECTED) against two different tables with copy-pasted logic. This isn't a bug today, but every future fix (e.g. the repeat-offender tracking already built for appointments in `BusinessAppointments.tsx`'s `rejectedClaimsCount`) has to be re-implemented twice, and already has been forgotten once — `AgreementScreen` has no equivalent "this responder has N past rejected claims" trust signal that `BusinessAppointments` has for owners.
*Fix:* extract a shared `paymentClaimFlow(table, id, method, amount, reference)` helper, or a shared React hook for the claim/confirm/reject UI, so both surfaces get feature parity by construction.

---

## P2 — Medium priority (usability / correctness edge cases)

**P2-1. `AskCompose`'s auto-expire cap is silently enforced but the UI implies otherwise.**
The comment says "capped at 24h" and `post()` does `Math.min(expiryHrs, 24)`, but the chip options are literally `[3, 6, 12, 24]` — so the cap can never actually trigger from the UI. This is currently harmless (dead code, not a bug) but is a maintenance trap: if someone adds a `48` chip later expecting the cap to protect them, it will silently clamp to 24h with zero user-facing indication, producing a request that expires earlier than the UI told the user it would.

**P2-2. Voice-to-text in `AskCompose` guesses the category from a transcript substring match — silently wrong category selection.**
`toggleVoice()`'s `onresult` handler does `lower.includes(c.name.toLowerCase())`. A transcript like "I need someone to fix my *home* theater, not a repair job" would false-match "home-repair" on the substring "home." The user is not shown *why* a category got auto-selected, so a wrong pick from an ambient word match is invisible until they notice the wrong chip highlighted, if they notice at all.
*Fix:* show a "Did we get this right?" confirmation microcopy immediately after auto-selecting via voice, don't just silently set state.

**P2-3. Group-buy ("me too") flow has no actual bulk-price mechanism — it's a progress bar with no payoff.**
`RequestDetail.tsx` shows "`{groupBuyTarget - meTooCount}` more unlocks bulk price," but nothing in `requestService` or the proposal/agreement flow changes price, notifies the requester of threshold-crossing, or does anything when the target is hit. It's a progress bar that promises an outcome the system never delivers. Users who "me too" a request expecting a price change and never see one will learn not to trust the feature, which poisons a potentially good group-buying mechanic before it's even finished.
*Fix:* either finish the mechanic (server-side threshold trigger that notifies the requester + proposers, and lets proposers submit a "bulk price" that only activates group-wide) or remove the promise-of-bulk-price copy until it's real.

**P2-4. `MyAppointments`'s reschedule flow can silently double-cancel or leave a stray original if the new booking fails.**
`handleBooked()` cancels the original appointment only *after* `AppointmentSheet`'s `onBooked` fires, which only fires after the new booking insert succeeds. That ordering is actually correct (good — it avoids the "cancelled but rebooking failed" trap). However, if the *cancel* call itself fails (caught with a bare `catch { /* best-effort */ }`), the user now has **two live appointments** with no error surfaced, and no reconciliation UI to notice or merge them. Given `appointmentService.create()`'s daily-limit check counts non-cancelled appointments, this could also spuriously trip the daily limit on a later booking attempt with no visible cause.
*Fix:* surface the cancel failure with a toast even though the new booking succeeded — "Booked! (Couldn't cancel your old slot — please cancel it manually.)" rather than swallowing it.

**P2-5. `RateScreen`'s tip is decorative — no payment collection, and the label undersells that.**
"Add a tip? (paid in person)" is honest in small print, but the big buttons (`₹20/₹50/₹100`) read like an in-app charge until you notice the caption. Combined with `requestService.rate()` storing the tip only as a `comment` string suffix concatenation (`[comment, ...tags].filter(Boolean).join(" • ")`) rather than a structured field — the tip amount isn't even queryable/reportable later; it's buried in free text.
*Fix:* store `tip` as its own column on `ratings` if it's meant to be tracked/reported on, not string-concatenated into the comment.

**P2-6. `RequestDetail`'s edit flow lets the owner edit title/description/budget/urgent freely on an OPEN request with active proposals, with no notice to responders whose quotes were based on the old details.**
A provider who quoted ₹1000 based on the original description has no signal that the requester silently changed scope afterward. This is a fairness gap for responders: they could show up to a rescoped job at their old price with no chance to re-quote.
*Fix:* on save, if there are existing SUBMITTED proposals, either block substantive edits, or notify all responders that the request changed and let them requote/withdraw.

**P2-7. `AppointmentSheet`'s "book again" flow re-fetches live availability but the same 5-per-day limit check re-runs from a screen that doesn't visibly reflect *why* rebooking might be blocked** until the button is disabled with generic copy. Minor, but worth folding into the P0-2 fix since it's the same root cause surfacing twice.

---

## P3 — Low priority (polish)

- `AgreementScreen`'s countdown timer (`PENDING` → 10 min auto-cancel) recalculates from `agreement.createdAt` client-side every second but only calls `refetch()` once it hits zero — if the tab is backgrounded past the deadline and refocused, there's a visible stale "0:00" flash before the refetch resolves. Cosmetic, but on a slow connection this could look like a bug rather than a housekeeping lag.
- `SubmitProposal`'s ETA field is a free-text input (`"e.g. Deliver by Saturday 5 PM"`) with no structured date/time — this loses the ability to sort/filter by actual delivery time and is a missed opportunity given `AskCompose` already has a proper date+slot picker for the *request* side. Structurally inconsistent input paradigms for the same concept (when will this happen) across the two ends of the same flow.
- `RequestDetail`'s "Report this request" is only shown to non-owners — reasonable — but there's no equivalent for a responder to report a *requester* who posted something abusive/fraudulent without opening a proposal first.
- `Requests.tsx`'s category chip list is built by deriving `Array.from(new Set(feed.map(r => r.categoryName)))` from the **current page's** results only — since pagination is broken (P1-1) this compounds: category filters can only ever reflect categories present in the first page, so a category with only page-2+ requests never appears as a filter option at all.
- Copy inconsistency: `AgreementScreen` labels a party "them"/"you" in `ProcessGuide` via i18n keys, but `Agreements.tsx`'s list view says "with {otherName}" — both correct, but worth a design pass to ensure first/third-person framing is consistent across the same feature.

---

## Broken / incomplete user flows (summary table)

| Flow | Current behavior | Expected behavior | Root cause | Fix | Impact |
|---|---|---|---|---|---|
| Negotiated (countered) price → Accept | Agreement is created at the **original** proposal price, ignoring any accepted counter-offer | Agreement price should reflect the last agreed counter | `accept_proposal` RPC reads `proposals.price` directly; no "accept this counter" action ever updates it | Add accept-counter action that updates `proposals.price` (or passes final price into the RPC) before/at acceptance | **High** — wrong money changes hands |
| Browse requests beyond page 1 | Feed silently shows only the first page forever | Infinite scroll / load more | Service returns pagination info the screen never reads | Wire cursor-based load-more in `Requests.tsx` | **High** — requests become invisible at scale |
| Proposal boost (₹49) | Sets a flag, no charge | Provider is charged ₹49, proposal is pinned | No payment call in `SubmitProposal.submitProposal` boost path | Wire `paymentService`/UPI collection, or remove price framing | **Medium** — revenue leak / trust risk |
| Group-buy "me too" threshold | Progress bar advances, nothing happens at 100% | Bulk price unlocks / requester notified | No server trigger on threshold-crossing | Add threshold trigger + bulk-price proposal support | **Medium** — broken promise to users |
| Daily appointment limit / double-booking a slot | Client-side count check only; two near-simultaneous bookings can both pass | Server rejects the 6th booking / the second same-slot booking | No DB constraint enforcing either limit | Add partial unique index + trigger-enforced count | **High** — real-world overbooking |
| Dispute resolution | Admin sees only requester's `dispute_reason`, picks Complete/Cancel | Both sides heard, evidence considered, partial outcomes possible | No responder-response field, no partial state | Add responder rebuttal + partial resolution | **Medium** — fairness/trust at scale |

---

## UX improvements (screen-by-screen)

- **AskCompose:** Progressive disclosure (Advanced options collapsed by default) is good UX. Add a live preview of what "Auto-expire after Xh" actually implies for a *scheduled* request (e.g. "needed Saturday" with a 3h expiry could expire before Saturday even arrives — no validation currently stops a self-defeating combination of schedule + expiry).
- **RequestDetail:** The counter-offer thread visual (chat-bubble style) is genuinely nice UX for a P2P negotiation. Add an explicit "Accept this counter" affordance directly on the latest counter bubble instead of forcing the user back to the top-level Accept button (ties into P1-4).
- **AgreementScreen:** The step progress bar + "what happens next" guide is one of the best patterns in the app — it removes ambiguity about whose turn it is. Extend the same guide pattern to the dispute state (currently disputes just show a static banner with no "what happens next for me" guidance).
- **MyAppointments:** Payment states (`PAID`/`PENDING_CONFIRM`/`REJECTED`/`UNPAID`) are clearly badge-differentiated — good. The "Retry" button on a rejected claim is a nice recovery path. Consider surfacing *why* it might have been rejected (amount mismatch? wrong reference?) since the seller's rejection reason isn't collected anywhere to show back to the customer.
- **BusinessAppointments:** The repeat-offender / no-show tracking surfaced inline to the owner (`rejectedClaimsCount`, `noShowCount`) is a strong trust-and-safety feature most competitors lack at this stage. Consider extending equivalent visibility to the customer side too ("this business has X rejected claims disputed by other customers") for symmetry — right now the trust signal is one-directional (protects sellers, not buyers).

## UI improvements (component-by-component)

- `AppointmentSheet`: the payment-timing banner ("This seller requires payment upfront") appears *below* the confirm button's data but the confirm button itself doesn't visually change color/urgency to reflect that the next step is a payment, not just a confirmation — a customer skimming could tap "Confirm & Pay" without registering the "& Pay" part.
- `RateScreen`: tip buttons visually look identical in weight/prominence to the star rating and tag chips above — for a purely optional, offline-settled amount, consider de-emphasizing (smaller, less saturated) so it doesn't compete visually with the core rating action.
- `Agreements.tsx` list: badge tone mapping (`amber`/`blue`/`green`/`gray`/`red`) is consistent and good. The "Rate {otherName}" button appearing inline in a `COMPLETED` card is a nice reduction of navigation friction.

## Code quality / architecture recommendations

1. Extract `AgreementScreen`'s `ActionArea()` into per-status components (P1-3).
2. Deduplicate the appointment/agreement payment-claim state machine into a shared hook (P1-6/P1-7).
3. Add the missing `proposal_counters` RLS policy scoping to the two parties (P1-5) — verify this explicitly in the Supabase dashboard, since it wasn't found as an explicit policy in any reviewed migration.
4. Wire `requestService.feed()`'s existing pagination into `Requests.tsx` (P1-1) — this is the single highest ROI fix in this slice: the backend work is already done.
5. Consider consolidating `DealUpiSheet` and `PaymentSheet` — they are near-identical UPI QR/deep-link components with different data-fetching wrappers around the same rendering logic.

## Performance notes

- `sweepExpired()`'s 120-second throttle on the two RPC calls (`cancel_expired_agreements`, `close_expired_requests`) is a good, deliberate fix already in place — no action needed, called out here because it's a genuinely good pattern worth preserving as new sweeps are added elsewhere.
- `RequestDetail.tsx` opens a *second* realtime channel (`rt:proposals:${id}`) in addition to the `useQueryWithRealtime` subscription on `requests`. Both refetch the same full `REQUEST_SELECT` (which includes nested proposals + counters) on any proposal insert — for a request with many proposals/counters this refetches the entire joined payload on every single new proposal, rather than patching just the new row into local state. At high proposal volume on a popular request this is an avoidable N-refetch pattern.
- `AppointmentSheet` fetches `listForTarget`, `listForCustomer`, and `slotBlockService.list` in parallel on mount — good use of `Promise.all`. No issue found here.

## Security notes

- The ownership check in `submitProposal` (verifying `responderEntityId`'s owner matches the caller before letting them claim a business/provider identity) is correctly implemented server-side in the service layer, not just trusted from the client — good practice, explicitly called out as intentional in the code comments and verified correct on read.
- `proposal_counters` (P1-5) needs an explicit RLS audit — this is the one open security question in this slice that could not be fully resolved from the migrations reviewed and should be checked directly against the live database policies.
- `get_tracking()` RPC correctly exposes only the minimal live-location fields to anonymous users via a token, without opening the underlying `agreements` table — good pattern for the public share-link use case.

---

## Feature suggestions

- **Structured negotiation close-out:** a first-class "accept counter #N" action that atomically updates price and creates the agreement (closes P1-4 and turns the counter-offer feature from partially-broken into a real strength).
- **Dispute evidence:** allow both parties to attach photos/chat excerpts to a dispute; let admin partially resolve (e.g. 50% release) instead of a binary complete/cancel.
- **Bulk-price group buys:** finish the "me too" mechanic with an actual price step-down and threshold notification — this is a distinctive, hard-to-copy feature if it worked end-to-end.
- **Symmetric trust signals:** show customers a business/provider's own rejected-claim/no-show history (aggregated, anonymized) mirroring what owners already see about customers.

---

## Scorecard (this slice only)

| Dimension | Score /10 | Notes |
|---|---|---|
| UX | 7 | Strong step-by-step guidance; broken group-buy promise and hidden pagination limit hurt trust |
| UI | 7.5 | Consistent badge/card language; a few visual-weight mismatches (tip, pay-first CTA) |
| Code quality | 6.5 | Good service-layer discipline; `AgreementScreen` is overloaded; duplicated payment state machines |
| Architecture | 7 | Correct RLS-first design, atomic RPCs for critical writes; escrow split-brain is a real flaw |
| Security | 7.5 | Ownership checks done right where it matters; one unverified RLS gap on `proposal_counters` |
| Performance | 7 | Sensible throttling; some avoidable full-payload refetches on realtime events |
| Data integrity | 5.5 | Two P0-level race conditions (double-booking, daily-limit bypass) with no DB-level guard |
| Product completeness | 6 | Boost and group-buy are half-built promises; negotiation doesn't actually change the price paid |

**Overall for this slice: 6.8/10 — solid engineering foundation with two real money-affecting bugs (wrong-price acceptance, unenforced booking limits) that should be fixed before scaling traffic.**

---

## Verdict for this slice

If this shipped to 100,000 users tomorrow: the double-booking race and the "accept ignores the negotiated price" bug are what would actually generate angry support tickets and real financial disputes first — both are silent, both involve money, and neither has any error surfaced to the user when they happen. The step-by-step agreement flow, the two-sided payment claim/confirm system, and the owner-side no-show/rejected-claim trust signals are what would delight power-user businesses managing bookings daily — this part of the app is genuinely better thought-through than most single-shop SaaS booking tools. Fix the two P0 race conditions and the counter-offer price bug before scaling; everything else in this slice can be improved incrementally without user-facing risk.
