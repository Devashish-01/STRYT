# 16 — Business: Bulk-Buying Campaigns

**Priority:** P0 — newest feature, zero device testing.
**Screens:** `CommunityCompose` (creation toggle), `BulkDealsManager` (list +
scanner + quick edit), `BulkDealDetail` (new — status/roster/close screen).
**Services:** `bulkService.ts` (`createDeal`, `dealsForBusiness`,
`pledgesForDeal`, `confirmDeposit`, `rejectDeposit`, `closeDeal`,
`extendDeal`, `tokensForDeal`, `dealRedemptionStats`, `redeemToken`).
**Requires:** migrations `20260900` + `20260901` applied (see workflow 06)
and A2 must own a business whose package has `showCartStepper: true` — a
store/grocery-type package, not a salon/clinic/homeservice one. Check
`src/lib/businessPackages.ts` if unsure which of A2's businesses qualifies.

This is the direct fix for the original bug report: **"business can't tap a
bulk deal to see its status."** Confirm that specifically, not just that
campaigns exist.

---

## Flow A — Create a campaign

| # | Step | Expected |
|---|------|----------|
| 1 | As A2, Business Store hub → **"Bulk deals"** tile | Tile is present only because the package qualifies — if A2's business is a salon, this tile is **correctly absent**; switch to a qualifying business |
| 2 | `BulkDealsManager` → **"New campaign"** button | Navigates to `/community/new` under A2's business identity |
| 3 | Composer opens | Bulk-buying toggle is **already ON** (pre-armed from the button), header reads "📦 Bulk-buying campaign" |
| 4 | Toggle off, then on again manually | Same behaviour — type picker (six post-type tiles) disappears while it's on |
| 5 | Fill title, description, photo (shared fields — same as any community post) | Standard compose fields, nothing bulk-specific |
| 6 | Campaign details module: regular price, target qty, volume tiers, quota, deposit, closing deadline, fulfilment | All present; deposit and deadline are **optional** |
| 7 | Try to post with no regular price | Blocked, inline hint "Enter the regular price" |
| 8 | Set deposit **higher than** regular price | Blocked, "Deposit can't be more than the regular price" |
| 9 | Post button | "Publish campaign" (not "Post to your street") |
| 10 | Submit | Toast "Campaign published 🎉"; lands directly on **`BulkDealDetail`** for the new campaign — not the community feed |
| 11 | Go to a business whose package does **not** qualify (salon etc.) and open `/community/new` under that identity manually | Bulk-buying toggle does **not** appear at all — this is the intended gate, confirm it can't be bypassed by, say, editing a draft |

## Flow B — Status/detail screen (the bug-report fix)

| # | Step | Expected |
|---|------|----------|
| 1 | `BulkDealsManager`'s campaign list | Each row is **tappable** (previously did nothing — this was the bug), shows a live status line: "N of TARGET pledged" / "Fulfilled" / "Refunded" / "Needs a decision" |
| 2 | Tap a row | Opens `BulkDealDetail` at `/business/:id/manage/bulk-deals/:dealId` |
| 3 | Progress card | Shows **confirmed** (paid) quantity toward target, separately from total pledged if they differ, with a note when they diverge |
| 4 | Pledger roster | Every pledger listed: name (or "Customer" if no alias), quantity, deposit status badge, notes/address if given |
| 5 | A pledge in **"Awaiting confirm"** | Confirm / Reject buttons visible |
| 6 | Tap Confirm | Toast names the pledger; badge flips to **Paid**; roster + progress bar refresh |
| 7 | Tap Reject on a different one | Toast; badge flips to **Rejected**; that pledger can re-submit their deposit from their own sheet (workflow 06, Flow B step 7) |
| 8 | Deal with **no deposit configured** | Progress card shows an explanatory note that pledges don't auto-confirm here — close manually when ready |

## Flow C — Closing a campaign

| # | Step | Expected |
|---|------|----------|
| 1 | Campaign at or above target (confirmed quantity) | Single clear button: **"Close & fulfil — N pledges"** |
| 2 | Tap it | Toast "Closed — claim passes issued to paid pledgers"; every PAID pledger gets a `STRYT-D-` token; status banner turns green |
| 3 | Campaign **under** target → tap "Close campaign early" | Reveals three choices: **Fulfil anyway**, **Refund everyone**, Cancel |
| 4 | Fulfil anyway | Mints tokens for whoever's PAID even though under target; banner explains this |
| 5 | Refund everyone (on a different under-target campaign) | Banner: **"Closed as refunded — settle deposits with pledgers directly, nothing was auto-charged."** — confirm this reads as bookkeeping, not an automatic money-back, since STRYT has no payment gateway |
| 6 | A campaign closed under target **without** a decision yet (simulate: let the deadline pass without manually closing) | Amber "Closed under target — decide what happens" banner with Extend / Fulfil anyway / Refund everyone — this is the derived `PENDING_DECISION` state |
| 7 | Extend deadline | Date-time picker, saves, every existing pledger gets an "extended" notification, banner clears, campaign re-opens for pledges |
| 8 | Try to close an **already-resolved** (Fulfilled or Refunded) campaign again | No close/extend actions shown — read-only summary only |

## Flow D — Claim pass redemption (merchant side)

| # | Step | Expected |
|---|------|----------|
| 1 | `BulkDealsManager` → "Validate a claim pass" scanner | Same scanner used for group-buy passes |
| 2 | Scan/enter a **campaign** claim pass (`STRYT-D-XXXX-XXXX`) | Redeems correctly — dispatches by prefix automatically, no separate UI needed |
| 3 | Scan the same code twice | Second scan: "Already used" |
| 4 | Scan a group-buy pass (`STRYT-XXXX-XXXX`, no `D-`) on the same scanner | Also redeems correctly — confirms one scanner truly handles both sources |
| 5 | Redemption stats on `BulkDealDetail` for a Fulfilled campaign | Total / Redeemed / Pending chips match what you've scanned so far |

## Flow E — Editing an existing campaign

| # | Step | Expected |
|---|------|----------|
| 1 | `BulkDealsManager` → pencil icon on a campaign row | Opens a **restricted** editor — title, description, quota only |
| 2 | Confirm price/tiers/deposit/deadline are **not** editable here | Inline note explains why: those are locked once pledgers have joined under those terms; use the detail screen's Extend action for the deadline specifically |
| 3 | Save a title/description change | Applies; roster/pledges untouched |

## Edge cases to try

| # | Case | Expected |
|---|------|----------|
| 1 | Team member (A3, appointments-scope only) tries to reach `/business/:id/manage/bulk-deals` | Bulk deals is owner-only (`RequireOwner`) — bounced, same as Settings/Payments |
| 2 | Confirm a deposit, then immediately close the campaign as Fulfilled | That pledger gets a token |
| 3 | Confirm a deposit **after** the campaign already closed | Server allows the status flip but does **not** retroactively mint a token — the roster row shows a note explaining this so the business doesn't think they created a claim pass that doesn't exist |
| 4 | Delete a campaign that has pledges | Confirm what actually happens — pledges/tokens are FK-cascaded on `bulk_deals` delete; make sure this doesn't silently orphan a pledger who already paid a deposit without any notice |
