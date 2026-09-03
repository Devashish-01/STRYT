# 12 — Roles & Switching

**Priority:** P0 — this is where the privilege-escalation regression lives
(full script in `MANUAL_TEST_PLAN.md` §1.1 and workflow 23; this file covers
the happy path, 23 covers the security regression in depth).
**Screens:** `AccountSwitcher`, `ManageHub`.
**Concept:** `activeContext` ("hat") in `store.tsx` — `customer` /
`business` / `provider`, plus an unrouted `delivery` hat deferred to v1.1.

## Flow A — Switching hats

| # | Step | Expected |
|---|------|----------|
| 1 | Open the account switcher | Rows for every owned business/provider + "Add a business"/"Become a provider" |
| 2 | Switch into an owned business | Console opens (password/PIN gate first if one is set — see Flow B) |
| 3 | Bottom nav / Home while in business hat | Reflects the business context, not the customer one |
| 4 | Switch into an owned provider | Same shape |
| 5 | Switch back to customer | Returns to the plain customer experience |
| 6 | Deep link to a `/business/:id/manage/*` URL while in the **wrong** hat (customer, or a different business) | Guard behaviour is correct — either switches context or bounces, not a broken half-loaded console |
| 7 | Unmatched path (typo'd URL) | `ContextHomeRedirect` — lands on home of whichever hat is currently active |
| 8 | Delivery hat, for any account | Does **not** appear anywhere in the switcher, even for an account holding a standing `delivery` grant — deferred for v1.0, confirm it's truly invisible not just unreachable |

## Flow B — Console password gate

| # | Step | Expected |
|---|------|----------|
| 1 | Owner sets a business console password (Security settings) | Required on next switch-in |
| 2 | Enter it correctly | Console opens |
| 3 | Enter it wrong | Rejected, attempt tracked (`entity_password_attempts`) |
| 4 | Forgot password → recovery flow | **Owner only** — see workflow 23 item 1.1/#10, a team member must never be offered this |
| 5 | Owner clears the password | Subsequent switch-ins skip the gate |

## Flow C — Team member scoped access

Full script: `MANUAL_TEST_PLAN.md` §1.1 / workflow 23. Minimum happy-path
here:

| # | Step | Expected |
|---|------|----------|
| 1 | A2 grants A3 a SCOPED grant (e.g. `appointments` only) | Grant succeeds |
| 2 | A3 switches into that business | Console opens, nav shows **only** the granted scope's screens |
| 3 | A3 tries a direct URL for an ungranted screen (`/manage/settings`, `/manage/payments`) | Bounced with a toast, every time, even after full app restart |
| 4 | A2 revokes A3 | A3 bounced within seconds, no manual reload needed |
