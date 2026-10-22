# 04 — Requests, Proposals, Agreements

**Priority:** P1.
**Screens:** `AskCompose`, `RequestDetail`, `SubmitProposal`,
`AgreementScreen`, `Agreements`, `RateScreen`.
**Service:** `requestService.ts`.

> Note: `AskCompose`'s "Make this a group buy" toggle was **removed this
> cycle** (customer-initiated group buys are retired — see workflow 07). If
> you still see it, that's a regression.

## Flow A — Post a request

| # | Step | Expected |
|---|------|----------|
| 1 | `/ask` (from BottomNav's create sheet, or Explore → Requests tab) | Composer opens — templates strip, title, category, description, photos, budget/payment type |
| 2 | Confirm **no** group-buy toggle appears anywhere on this screen | Fields removed cleanly, no orphaned "Users" icon or dead state |
| 3 | Fill required fields (title, category) | "Post" enables |
| 4 | Advanced options (collapsed by default) | Scheduling, urgent/recurring/anonymous toggles, auto-expiry, radius |
| 5 | Submit | Toast, navigates to **`/explore?tab=requests`** (not `/community-hub` — that branch was for group buys and no longer applies) |
| 6 | Voice input (mic icon on description) | Transcribes, auto-fills category if a keyword matches |

## Flow B — Receive and negotiate a proposal

| # | Step | Expected |
|---|------|----------|
| 1 | As a business/provider, find the open request → submit a proposal | `SubmitProposal` — price, message |
| 2 | As the requester, open `RequestDetail` | Proposal shown |
| 3 | Counter-offer the proposal | Responder sees the counter |
| 4 | **Accept the counter (not the original)** | Agreement created at the **countered price**, not the original ask — this was a fixed regression, re-verify it |
| 5 | Accept the original instead (separate test) | Agreement at the original price |

## Flow C — Agreement lifecycle

| # | Step | Expected |
|---|------|----------|
| 1 | `/agreement/:id` after acceptance | Terms, both parties' identities, status |
| 2 | `/agreements` list | Shows all of the current user's agreements, both sides |
| 3 | Mark work complete / confirm (whichever this app's flow calls it) | Status updates for both sides |
| 4 | `/rate/:id` after completion | Star rating + review, submits, appears on the seller's profile |
| 5 | An agreement's natural expiry (deadline passes without action) | Auto-cancelled via the sweep (`cancel_expired_agreements`) — confirm it doesn't just hang forever in a stale state |

## Edge cases

- Guest taps a request's "respond"/propose action — sign-in wall.
- Multiple proposals on one request — requester can compare and accept only
  one; the rest should be clearly declined/closed, not left ambiguous.
- Cancel a request before any proposal — clean removal, no orphaned
  proposals left pointing at it.
