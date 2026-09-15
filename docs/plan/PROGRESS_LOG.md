# Launch plan — live progress log

**Read this first if you are picking up the work.** It is updated as work happens, newest entry at the bottom.
Plan: `docs/plan/README.md` and `docs/plan/phases/P00…P15`. Rules: `docs/plan/AGENT_RULES.md`, database rules:
`docs/database/HANDOFF.md` (§5 procedure for every production change).

## Where things stand (2026-09-16)

| Phase | State |
|---|---|
| P03 DB guardrails | Done (owner step: `ci_readonly` login + `DRIFT_DATABASE_URL` secret) |
| P04 DB hardening | Done, merged to `develop` |
| P05 Authorization audit | Done, merged to `develop` (6 holes fixed on production) |
| P06 Baseline + staging | Done, merged to `develop` (staging `laswruzdyqehziyupmdm` = production copy) |
| **P07 E2E suite** | **In progress** on branch `phase/07-e2e` (not committed yet) |
| P08 Gap ledger | Started: `docs/gaps/GAP_LEDGER.csv` built (446 rows from the gap logs + E2E-### rows) |
| **P09 Fix gaps** | **Started early**: E2E findings being fixed in the working tree (see table below) |
| P10–P12 | Not started |
| P13–P15 | Owner-led (device QA, accounts, store/legal) |

### P07 — what exists

- Infra: `playwright.e2e.config.ts`, `tests/e2e/global-setup.ts` (staging guard + reseed), `tests/e2e/fixtures/`
  - `staging.ts` — personas as page fixtures (`customer`, `customer2`, `owner`, `staffQueue`, `staffAppointments`,
    `provider`, `admin`, `guest`); sessions saved in `.auth/` and reused until a reseed; `knownBug(id)` marks a test
    blocked by a logged bug (`E2E_RUN_FIXME=1` runs them anyway); `expectAfterReload()` for cross-person updates.
  - `db.ts` — read-only staging queries (Management API, read-only transaction).
  - `booking.ts` — booking-sheet helpers.
- Breadth: `tests/e2e/flows/screens.spec.ts` — 103 screens × 7 personas (land where expected, load, no page errors, no
  failing API calls). `flows/first-visit.spec.ts` (E2E-008).
- Critical journeys done (8/16) in `tests/e2e/critical/`: booking-accept, booking-decline-reason,
  booking-reschedule-paid, booking-daily-limit, queue, team-access, guest-wall, chat, ratings-reviews (partial).
- Remaining journeys: request-proposal-agreement, me-too-group-buy, bulk-deal, account-deletion, admin-moderation,
  business-onboarding, customer-onboarding. Then per-flow action specs, `tests/e2e/COVERAGE.md`, 3 green runs, report.
- Run: `npm run e2e` (builds staging app, reseeds, runs). Fast local loop against an already-running preview on 5174:
  `E2E_REUSE_SERVER=1 E2E_SKIP_SEED=1 npx playwright test -c playwright.e2e.config.ts <spec>`.

### Bugs found by the E2E work (all in `docs/gaps/GAP_LEDGER.csv`)

| Id | Sev | What | Fix state |
|---|---|---|---|
| E2E-001 | P3 | OTP boxes drop a digit on very fast per-box typing | open |
| E2E-002 | P3 | `is_entity_recovery_set` 401 right after sign-in | open (root cause not proven) |
| E2E-003 | P2 | Guest provider page → 401 `bump_provider_views` | **fixed in app** (`providerService.recordView`) |
| E2E-004 | P1 | Public profile quotes query uses `proposals.note` | **fixed in app** (`userService`) |
| E2E-005 | P2 | Random "Couldn't load" toast | likely caused by E2E-008; verify after rebuild |
| E2E-006 | P0 | Provider dashboard/Money query non-existent `appointments` columns | **fixed in app** (`providerService`) |
| E2E-007 | P2 | Handled booking notification still offers Accept/Decline; raw `INVALID_TRANSITION` | **fixed in app** (`notificationService` reconcile + friendly error) |
| E2E-008 | P2 | First visit reloads the page when the service worker takes control | **fixed in app** (`ServiceWorkerUpdater`) |
| E2E-009 | P0 | Booking "confirmed" but only saved on the device when the auth check blips | **fixed in app** (`currentUserId` uses local session; `appointmentService.create` refuses) + unit test |
| E2E-010 | P2 | Blank decline never tells the customer to try another slot | **fixed in app** (notification card + `CancelAttributionNote`) |
| E2E-011 | P2 | Shop page tells a queued customer "1 ahead · You're #1" | **fixed in app** (`BusinessDetail` queue card) |
| E2E-012 | P3 | Toggles/stars don't expose state to screen readers | **fixed in app** (`aria-pressed`, star labels) |
| E2E-013 | P0 | Open chat loops ~45 requests/second | **fixed in app** (`ChatThread` effect) |
| E2E-014 | P0 | **Nobody can send chat messages** (policy calls a revoked function; trigger reads a missing table) | migration `20260973` — **staging applied; production needs owner approval** |
| E2E-015 | P1 | Every image upload refused (upsert) and stored as base64 in DB rows since 2026-07-17; KYC doc uploads broken | **fixed in app** (`uploadService` plain insert, no data-URL fallback). Existing 36 data-URL rows still need migrating |
| E2E-016 | P1 | Owners can't reply to reviews | migration `20260974` — **staging applied; production needs owner approval** |
| E2E-017 | P1 | Story reactions fail | migration `20260974` (same) |
| E2E-018 | P2 | Recommending a provider on a post fails | migration `20260974` (same) |

App fixes are in the working tree, **not yet built into the staging preview, not committed, not released**. Next: rebuild
the staging preview, remove the matching `knownBug(...)` marks, re-run the specs to prove each fix, run `npm run verify`.

## Waiting on the owner (decisions / access)

1. **Apply `20260973` then `20260974` on production** (chat send, review replies, story reactions, provider
   recommendations are broken for all users today). Everything is prepared: `supabase/APPLY_LOG.md` → *Pending*.
   The agent's tool now refuses production writes, tests and reads, so a fresh restore point + snapshot are part of
   the apply.
2. Release to `main` (ships P05 app changes + these fixes), then the pending phone-column lockdown.
3. `ci_readonly` DB login + `DRIFT_DATABASE_URL` GitHub secret (P03).
4. Accounts/legal: Sentry, Play Console, lawyer review, 12+ closed testers, device testing (P13–P15).
5. Migrate the existing base64 image rows to storage (E2E-015) — needs production writes.

## Rules in force

- Never paste keys in chat. No Docker. Never push to `main`. No production data in staging.
- Production DB change only through HANDOFF §5 (backup → snapshot → migration + verbatim rollback → forced-rollback
  test → apply with name = file name → verify → snapshot → advisor → APPLY_LOG row). Never type hashes/counts by hand.
- Stage explicit paths only. A test failing because of a real bug gets `knownBug("E2E-### — …")`, never a weaker
  assertion.

## Log

- 2026-09-15 — P07 infra, crawler (106 route checks), breadth spec (96 green + 7 marked), gap ledger built (446 rows).
- 2026-09-15 — Journeys booking-accept/decline/reschedule-paid/daily-limit written; E2E-001…010 logged.
- 2026-09-16 — Queue, team-access, guest-wall journeys; E2E-011, E2E-012 logged.
- 2026-09-16 — Chat journey found E2E-013 (request loop) and E2E-014 (chat send broken on production). Migration
  `20260973` built via §5, tested on staging (before 42501 → after: participants send, stranger/spoof/blocked
  refused, notifications correct), applied to staging. Production test refused by tool → owner approval.
- 2026-09-16 — Image upload root cause proven (upsert → 403, plain insert → 200, both buckets): E2E-015.
- 2026-09-16 — Reviews journey found E2E-016; audit script `scripts/audit/function-dead-refs.mjs` found E2E-017/018.
  Migration `20260974` built from live definitions, forced-rollback tested (6/6 before-failures → all pass after,
  FORBIDDEN for non-leads staff/strangers), applied to staging; staging dead-reference scan clean.
- 2026-09-16 — Switched to fix-first (owner request "intelligent, fast, perfect fixes"): app fixes for E2E-003, 004,
  006, 007, 008, 009, 010, 011, 012, 013, 015 in the working tree; type-check + lint clean; engagement/lib unit tests
  506/506. Next: rebuild preview, prove fixes with the E2E specs, `npm run verify`.
- 2026-09-16 — Rebuilt the staging preview with the app fixes; removed `knownBug` marks for E2E-003/004/005/006/007/
  008/009/010/011/013/015/016 so the specs now prove the fixes; the first-visit warm-up in `fixtures/staging.ts` was
  dropped (E2E-008 fixed). Full unit suite 634/634. Full E2E run on a fresh reseed in progress
  (`full_run1`).
- 2026-09-16 — Full E2E run on rebuilt staging: 127/128 (the failure was the first-visit test counting a same-document
  route change as a reload; switched to document `load` events, 3/3 green). `npm run verify` exit 0. Ledger: 15 E2E
  rows FIXED with run evidence. Emergency live-location sharing proven broken on production by the same trigger as
  E2E-014 (added to APPLY_LOG). Committed locally on `phase/07-e2e`: d85f100 (app fixes), 8c41317 (DB migrations,
  staging only), a429fb2 (E2E suite + ledger). **Push was refused by the tool — owner to push or allow.**
- 2026-09-16 — Request journey found **E2E-019 (P0)**: requests carry a top-level category, shops/providers a
  speciality, and every match (notification trigger + 3 console screens) compared ids exactly, so no responder was ever
  notified or shown a request (production data confirms). App fix `src/lib/categoryMatch.ts` (+6 unit tests) in
  ProviderFindWork, ProviderDashboard, BusinessRequests; migration `20260975` for `notify_on_request` — staging applied
  (ledger 20260915203103) and tested; production pending owner (APPLY_LOG). Staging seed: test plumber now
  `c-home-plumb`. Commits so far are local only (push refused by the tool).
- 2026-09-16 — More bugs from the request journey, all fixed in the working tree (not yet committed):
  **E2E-020** proposals from a person always "Neighbor" (`users.bio` doesn't exist) → `requestService.submitProposal`;
  **E2E-021** admin pending-provider queue always empty (`providers.area/city` don't exist) → `adminService`;
  **E2E-022** a console opened from a notification/link kept the personal context, so proposals went out as a
  customer → `src/hooks/useAdoptConsoleContext.ts` in both console guards. New audit `scripts/audit/select-columns.mjs`
  (every literal select vs the staging catalog; now 0 unknown columns). Rate-screen stars and the proposal
  "Prioritize" toggle got accessible state. Rebuilding the staging preview to write the request-proposal-agreement spec.
