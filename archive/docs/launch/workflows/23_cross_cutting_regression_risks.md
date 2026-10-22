# 23 — Cross-Cutting Regression Risks

**Priority:** P0 for nearly everything here. This file is the **why** behind
`MANUAL_TEST_PLAN.md` §1 — a condensed pointer to every fix made across this
project's launch-hardening cycles, so a regression here is caught before it
reaches Play. If you only have time for one file besides the two bulk-buying
ones (06/16), make it this one.

Full step-by-step scripts for items 1–8 live in `MANUAL_TEST_PLAN.md` §1 —
this file is the index + the "why it matters" for each, plus what's new this
session.

## 1. Team access privilege escalation — `P0`

**Full script:** `MANUAL_TEST_PLAN.md` §1.1.
**Why it matters:** the original bug only appeared on the **second** page
load — a same-session test will not catch a regression here. A scoped team
member must never see, or reach by direct URL, a screen outside their
granted scope, even after a full app restart.

## 2. Delivery cancel path — `P0`, ⏸ deferred for v1.0

**Full script:** `MANUAL_TEST_PLAN.md` §1.2/1.3, indexed in workflow 20.
This release, only confirm the feature is genuinely unreachable.

## 3. Email-as-name leak — `P0`

**Full script:** `MANUAL_TEST_PLAN.md` §1.4, workflow 01 Flow B step 4.
Never show a raw email address anywhere a display name would normally
appear — greeting, public profile, community post author, review author,
booking customer name.

## 4. Live-location explainer gate — `P0`

**Full script:** `MANUAL_TEST_PLAN.md` §1.5, workflow 10 Flow A. Consent
must be explicit and sticky — dismissing the explainer is not consent,
starting once means never seeing it again.

## 5. Business soft-delete — `P1`

**Full script:** `MANUAL_TEST_PLAN.md` §1.6, workflow 18 Flow E. The
non-obvious part: a customer's **past** booking with a deleted business must
survive — history is never destroyed, only the live listing disappears.

## 6. Battery prompt re-scoping — `P0` (Play risk), ⏸ deferred for v1.0

**Full script:** `MANUAL_TEST_PLAN.md` §1.7, workflow 20/22. This release,
just confirm the prompt never fires for a plain customer.

## 7. Map — `P1`

**Full script:** `MANUAL_TEST_PLAN.md` §1.8, workflow 02 Flow E.

## 8. Deploy / update pipeline — `P0`

**Full script:** `MANUAL_TEST_PLAN.md` §1.10, workflow 22 Flow G.

## 9. Pre-Play-Store bug-hunt spot checks (3 Sep 2026 pass) — `P1`

**Full script:** `MANUAL_TEST_PLAN.md` §1.11. Highlights:
- Guest-signed-out community post cards hide the Share button.
- Guest tapping Community's **+** or Explore → Requests' **Ask** button gets
  a "Sign in to…" prompt that returns here after sign-in, not a silent
  bounce.
- Saving a coupon / adding a loyalty stamp in airplane mode shows a visible
  failure toast **and** the optimistic UI reverts (previously failed
  silently while claiming success).
- Rapid-tap liking a community post never flickers/reverts after settling.
- Chat read-state and unread counts don't bleed across customer/business/
  provider hats.
- Accepting a **countered** proposal creates the agreement at the countered
  price, not the original ask.
- The 6th same-day appointment for one customer is server-rejected —
  **requires migration `20260897` applied first**, verify that before
  testing this specific item.

## 10. Bulk-buying campaign rebuild (2–3 Sep 2026, this session) — `P0`

**Not yet in `MANUAL_TEST_PLAN.md` — add it there once run.** Full scripts:
workflow 06 (customer) and workflow 16 (business). The single biggest
regression risk in the app right now, because it has had **zero** device or
live-database testing:

- Two migrations must be applied first — `20260900`, `20260901` — or the
  entire feature 500s on the first pledge.
- The old instant-order bulk-deal flow no longer exists client-side
  (`bulkService.order`/`.quote()` were removed) — if any surface still tries
  to call them, that's a dead reference, not a soft failure.
- Customer-initiated group buy creation was removed (workflow 07) —
  `AskCompose`'s toggle and BottomNav's "Start a group buy" should both be
  gone; existing pools must still work unmodified.
- The merchant claim-pass scanner (`BulkDealsManager`) now dispatches by
  token-code prefix (`STRYT-D-` vs plain `STRYT-`) to redeem either a
  campaign pass or a legacy group-buy pass — test both through the **same**
  scanner instance, not separately.
- `bulkService.myTokens()` now merges group-buy and bulk-deal tokens into
  one list for `/community/activity` and the "claim passes ready" banner —
  confirm neither source silently drops out of the merge.

## 11. `reschedule_appointment` RPC — `P1`, standing caution

Not a currently-known regression, but a specific past failure mode worth
re-checking any time this RPC is touched: a same-session rewrite once
silently dropped four guards (walk-in rejection, an optimistic-concurrency
check, the "Rescheduled" note, notes truncation). If reschedule behaves oddly
in workflow 03 Flow C, check this RPC's current definition against what it's
supposed to guard, not against memory of what it used to do.
