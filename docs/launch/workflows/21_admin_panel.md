# 21 — Admin Panel

**Priority:** P0.
**Screens:** `AdminLogin`, `AdminPanel`.
**Service:** `adminService.ts`.

## Flow A — Access control

| # | Step | Expected |
|---|------|----------|
| 1 | `/admin/login` as A7 | Logs in |
| 2 | `/admin` as a **non-admin** account (try A2, A6) | **Cannot reach it** — bounced/blocked, not just hidden-but-reachable-by-URL |
| 3 | `/admin` while signed out | Bounced to `/admin/login`, not the regular customer auth flow |

## Flow B — Verification queue

| # | Step | Expected |
|---|------|----------|
| 1 | Pending business/provider verification docs | Listed with the actual uploaded documents visible |
| 2 | Approve | Owner's status flips, notified |
| 3 | Reject with a reason | Owner sees the reason, can resubmit |
| 4 | Suspend an account with a reason | Account loses access, reason recorded/shown |

## Flow C — Business approval queue

Full loop already in workflow 13 Flow B — this is the admin-side half of it.
Specifically re-verify **Feedback #9** here: the review screen must show
what was actually submitted, not blank/default fields.

## Flow D — Location-change approvals

| # | Step | Expected |
|---|------|----------|
| 1 | Owner-submitted location change request | Appears in queue |
| 2 | Approve | Business's live location updates |
| 3 | Reject | Owner notified, location unchanged |

## Flow E — Disputes, appeals, reports, bugs

| # | Step | Expected |
|---|------|----------|
| 1 | A user's suspension appeal (`appealService`) | Appears in admin queue, resolvable |
| 2 | A reported post/review/user | Appears, actionable (dismiss / remove / escalate) |
| 3 | Any in-app bug report mechanism | Reaches admin correctly |

## Flow F — Profile controls / account deletion (admin side)

| # | Step | Expected |
|---|------|----------|
| 1 | Admin views a flagged profile | Can adjust visibility controls if the app exposes that |
| 2 | Admin-initiated account deletion (if supported) | Follows the same purge pipeline as self-service deletion (workflow 11 Flow E) |
