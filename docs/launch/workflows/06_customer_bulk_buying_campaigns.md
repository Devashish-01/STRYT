# 06 — Customer: Bulk-Buying Campaigns

**Priority:** P0 — this is the newest, least-tested surface in the app.
**Status:** built 2–3 Sep 2026 this cycle, **zero device testing, zero live-DB
testing** (no Supabase MCP access during the build session). Verified only by
`tsc`/`eslint`/`vitest`/`npm run build`.
**Screens:** `CommunityHub` (Bulk buying tab + rail), `BulkDealCard`,
`BulkOrderSheet` (now a pledge+deposit sheet, not an instant-order sheet),
`CommunityActivity`, `GroupBuyClaimPassModal`.
**Services:** `bulkService.ts` (`deals`, `enrichMyPledges`, `pledgeJoin`,
`pledgeLeave`, `claimDeposit`, `myTokens`, `redeemToken`).

## Before you start — migrations

This whole flow is dead on arrival if these two migrations haven't been
applied to the live database. **A migration file existing in the repo is not
proof it ran** — see `CODEBASE_MAP.md` §12.

- `supabase/migrations/20260900_bulk_deal_campaigns.sql` — the data model
  (pledges, tokens, deposit RPCs, closing logic).
- `supabase/migrations/20260901_bulk_deals_fulfillment_type.sql` — adds a
  column `20260900` referenced but never created (`bulk_deals.fulfillment_type`).
  Without this, the very first pledge on any deal throws a Postgres error
  ("record has no field 'fulfillment_type'").

Confirm both via Supabase MCP `list_migrations` or the SQL editor before
running anything below.

## What changed vs. the old flow (context for whoever's testing)

The old bulk deal was **instant order**: pick a quantity, pay the full total,
get an appointment immediately, no pooling. All of that is gone. The new
model is **pledge → optional deposit → business closes the pool → claim
pass**. Nothing is charged for the goods themselves at pledge time — only an
optional flat deposit the business set when creating the campaign.

---

## Flow A — Discover and pledge (no deposit required)

Use a business (A2) whose campaign has **no deposit set** for this pass, and
one **with** a deposit for Flow B.

| # | Step | Expected |
|---|------|----------|
| 1 | As A6 (customer), open `/community-hub` → "Bulk buying" filter (or scroll the rail on the "All" tab) | Section header reads **"Bulk-buying campaigns nearby"**, not "Bulk deals from shops nearby" |
| 2 | Look at a campaign card | Amber left border, progress bar showing "**N of TARGET** confirmed" (or similar — pool progress, not a "Min N" MOQ badge), tier table if the business set volume tiers, savings badge, distance |
| 3 | Tap **Join deal** (not "Book bulk" — that label is retired) | Pledge sheet opens, title "Pledge to this campaign" |
| 4 | Quantity stepper | Starts at **1**, not the campaign's target quantity — you're one of many pledgers, you don't need to solo-hit the target |
| 5 | Tier table (if the deal has tiers) | Ticks off as you raise quantity; shows "your estimated total" — note the copy that this is an estimate, not a charge |
| 6 | If the campaign has a fulfilment mode set | Shown **read-only** as a badge — you cannot pick one (unlike the old flow's picker) |
| 7 | Notes field (optional) | Free text, ≤300 chars |
| 8 | Submit | Toast "You're pledged in"; sheet closes; card now shows **joined state** — "Joined · N units" in green |
| 9 | Re-open the same deal's sheet | Opens straight to a status view (or the pledge form pre-filled with your quantity) — you should be able to see your own pledge, not just a blank form |
| 10 | Tap **Leave this pledge** | Confirm/leave flow; toast "Left the campaign"; card reverts to not-joined |

## Flow B — Pledge with a deposit

| # | Step | Expected |
|---|------|----------|
| 1 | Join a campaign that has a deposit amount set | After submitting the quantity, the sheet **advances to a deposit step** — does not close |
| 2 | Deposit step | Shows the flat deposit amount (not scaled by quantity), UPI/Cash panel (`PaymentMethodPanel`) |
| 3 | Pick UPI, "I have paid" | Toast "Deposit submitted — the business will confirm it"; sheet closes |
| 4 | Re-open the sheet for this deal | Status view shows **"Deposit sent — waiting for the business to confirm"** (amber), with an option to edit quantity and a "Leave this pledge" button |
| 5 | Tap Leave **after** paying | Copy should warn the deposit isn't auto-refunded — confirms you understand before leaving |
| 6 | Have A2 (business) confirm the deposit from their console (workflow 16) | Return to the sheet | Status flips to **"Deposit confirmed — you're locked in"** (green) |
| 7 | Have A2 **reject** a different pledge's deposit instead | That pledger's sheet shows **"Your deposit wasn't confirmed. Try paying again"** and returns to the pledge form so they can re-submit |

## Flow C — Claim pass, after the business closes the campaign

Requires A2 to close the campaign as **Fulfilled** first (workflow 16).

| # | Step | Expected |
|---|------|----------|
| 1 | As a pledger whose deposit was **PAID** before close | Receive a notification "Claim pass ready" |
| 2 | Open `/community/activity` | Bulk-deal claim pass appears in the **same list** as group-buy claim passes (merged, not a separate section) |
| 3 | Tap it | `GroupBuyClaimPassModal` opens — QR code, token code starting **`STRYT-D-`** (not plain `STRYT-`) |
| 4 | `CommunityHub`'s claim-passes-ready banner | Counts this pass too (not group-buy-only) |
| 5 | Business scans it (workflow 16, "Validate a claim pass") | Redeems correctly — the scanner dispatches by the `STRYT-D-` prefix automatically |
| 6 | Pledger whose deposit was **never confirmed** before close | Gets **no** claim pass — confirm they weren't silently included |

## Edge cases to try

| # | Case | Expected |
|---|------|----------|
| 1 | Pledge into your **own** business's campaign (as A2, viewing your own card) | Blocked server-side (`OWNER_CANNOT_PLEDGE`) — should surface a toast, not a silent failure |
| 2 | Pledge into a campaign whose fulfilment is **Doorstep** without entering an address | Blocked with "Add a delivery address" |
| 3 | Two devices pledge into the same near-target campaign simultaneously | No double-close, no lost pledge — the server trigger is row-locked |
| 4 | Pledge, don't pay deposit, close the tab, come back a day later | Pledge still there, still UNPAID, sheet still lets you pay |
| 5 | Campaign closes (deadline or manual) while you have the pledge sheet open | Next action should error cleanly (`DEAL_CLOSED`), not hang |
| 6 | Guest (signed out) taps "Join deal" | `requireAuth()` gate — "Sign in to order in bulk" toast, returns here after sign-in |

## Known gaps (not bugs, documented limitations)

- A campaign with **no deposit required** never auto-closes on hitting its
  target — only `PAID` deposits count toward the server's auto-close
  threshold, and a no-deposit pledge never becomes `PAID`. The business must
  close it manually (or set a deadline). Confirm this doesn't read as "the
  progress bar hit 100% and nothing happened" without explanation — the
  customer-side card doesn't currently surface this nuance, only the
  business's detail screen does.
- The pledge sheet's tier-price preview is a client-side estimate
  (`calcBulkTotal`) at *your own* quantity — the actual price applied at
  fulfilment is resolved server-side off the **pool's total paid quantity**,
  which can land in a better tier than your individual pledge alone would.
  Confirm the claim pass's final `unitPrice` looks right, even if it differs
  from the sheet's earlier estimate.
