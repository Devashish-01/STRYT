# 07 — Customer: Legacy Group Buys

**Priority:** P2 — this mechanism is intentionally winding down, not being
promoted, but **existing pools must keep working** for whoever already
joined one.
**Screens:** `GroupBuyCard`, `JoinGroupBuySheet`, `RequestDetail`,
`GroupBuyClaimPassModal`.
**Service:** `requestService.ts` (`joinGroupBuy`, `leaveGroupBuy`,
`groupBuyPledges`, `issueGroupBuyTokens`).

## What changed this cycle

Customer-initiated group buy **creation** was removed:
`AskCompose`'s "Make this a group buy" toggle is gone, and BottomNav's
create-sheet no longer has "Start a group buy". **Nothing else changed** —
`group_buy_join`/`_leave`/`_issue_tokens`, `requests.is_group_buy`, and every
existing pool's join/negotiate/claim-pass flow is untouched.

## Flow A — Confirm creation is really gone

| # | Step | Expected |
|---|------|----------|
| 1 | `/ask` | No group-buy toggle, no target-quantity/target-price/fulfilment fields |
| 2 | BottomNav's **+** create sheet | Only 3 tiles: Post a request, Share a story, Post to community — **no** "Start a group buy" |
| 3 | Try the old deep link `/ask?groupBuy=1` directly | Should land on a normal `AskCompose` with no group-buy pre-arm (the param is simply ignored now, not handled) |

## Flow B — Existing pool still works end to end

Needs a request that was created as a group buy **before** this cycle (or
one seeded for testing with `is_group_buy = true`).

| # | Step | Expected |
|---|------|----------|
| 1 | `CommunityHub` → Bulk buying tab → Group buys section | Existing pool still listed with its progress bar |
| 2 | Tap it | `JoinGroupBuySheet` opens, quantity stepper, estimated total |
| 3 | Join | Pledge recorded, pool progress updates |
| 4 | Update your pledge (re-open, change quantity) | Upserts, doesn't duplicate |
| 5 | Leave | Pledge removed, pool total decreases |
| 6 | Negotiate a proposal on that request, accept (workflow 04) | `issueGroupBuyTokens` mints a claim pass (plain `STRYT-` prefix, not `STRYT-D-`) for every pledger |
| 7 | Claim pass in `/community/activity` | Shows correctly, redeemable by the responding business/provider |

## Edge cases

- A group buy pool that's still **open** (never closed) from before this
  cycle — should remain joinable exactly as before; nothing about the retire
  should have touched its live state.
- `GroupBuyCard` and `BulkDealCard` rendered in the same feed — visually
  distinguishable (brand/violet vs. amber) so a reader can tell peer-pool
  from business-campaign at a glance.
