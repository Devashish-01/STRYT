# Launch plan — live progress log

**Read this first if you are picking up the work.** It is updated as work happens, newest entry at the bottom.
Plan: `docs/plan/README.md` and `docs/plan/phases/P00…P15`. Rules: `docs/plan/AGENT_RULES.md`, database rules:
`docs/database/HANDOFF.md` (§5 procedure for every production change).

## Where things stand (2026-09-16, late)

| Phase | State |
|---|---|
| P03–P06 | Done, merged to `develop` |
| **P07 E2E suite** | Full run #1 green: **134 passed, 0 failed** (with reseed, 9.8 min). 17 critical journeys (queue console added); breadth spec 103 screens; `tests/e2e/COVERAGE.md` maps all 52 flows. Left: action specs for screen-only flows, 2 more consecutive green full runs, P07 report. |
| **P08 gap ledger** | 487 rows. Verified domains: booking (2), queue (3), chat (6), safety (10) — 0 unverified left in each; 41 E2E rows. 361 legacy rows still UNVERIFIED. |
| **P09 fixes** | 102 FIXED (app + 8 DB migrations on staging), 19 OPEN, 4 DECISION, 1 DEFERRED. |
| P10–P12 | Not started |
| P13–P15 | Owner-led |

All work is committed on `phase/07-e2e` (local; push refused by the tool — owner to push).

### Waiting on the owner

1. **Apply on production, in order: `20260973` → `20260980`** (`supabase/APPLY_LOG.md` → Pending). Broken for every
   production user today: chat send + emergency live share (73), owner review replies, story reactions, provider
   recommendations (74), request notifications to shops/providers (75, 77), counter-offers (76), bulk campaigns never
   close (79); plus the admin audit trail (78). A read-only production scan shows exactly the 6 broken functions these
   fix and nothing else. `20260980` additionally closes a notification-spoofing hole (E2E-040) and must ship together
   with the app change that moves payment reminders to the new server function.
2. Push `phase/07-e2e`; release to `main` (ships every app fix), then the pending phone-column lockdown.
3. Decisions: **E2E-028** restore or retire "Me too"; **E2E-037** what "Take action" does for reported reviews/users.
4. `ci_readonly` login + `DRIFT_DATABASE_URL` secret; Sentry, Play Console, lawyer, testers, devices (P13–P15).
5. Migrate existing base64 image rows to storage (E2E-015 follow-up, production writes).

### Bugs found (see `docs/gaps/GAP_LEDGER.csv` for evidence)

E2E-001…039. Highlights beyond the earlier list: E2E-019 requests never reached shops/providers (category level),
E2E-022 console deep links kept the personal identity, E2E-026/027 agreement name and ratings went to the person not
the provider, E2E-029 account gates skipped on Home/Explore/shop pages (incl. terms clickwrap), E2E-031 no admin audit
trail, E2E-033 190 unlabeled form fields (a11y, OPEN), E2E-035 shops couldn't send proposals, E2E-038 "New campaign"
lost its form, E2E-039 campaigns never closed.

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
- 2026-09-16 — Journeys added: account deletion, admin moderation (with audit assertions), business onboarding,
  customer onboarding (newcomer numbers on staging auth), bulk deal (new seeded shop Test Kirana One). Bugs found and
  fixed on the way: E2E-005 (real root cause: .catch on a query builder), E2E-029…039. Migrations 20260978 (audit
  log) and 20260979 (bulk close) applied on staging. Static audits: `select-columns.mjs` (0 unknown), extended
  `function-dead-refs.mjs` (staging 0; production = the 6 fixed functions). Full E2E run #1 started.
- 2026-09-16 — Full E2E run #1 green (134 passed, 0 failed, reseeded). P08 verification of the booking domain (41
  rows) and the queue domain (19 rows) — both now have no unverified rows. Two new bugs found while verifying the
  queue: **E2E-040** (P1 security) any signed-in user could write an in-app notification *and* a push into anyone's
  inbox with any text — the insert policy only checked that the caller was signed in; **E2E-041** "Message customer"
  on a booking, job or pledge opened an empty chat thread that could not send. Migration `20260980` (built via §5,
  forced-rollback tested, applied to staging) restricts notification inserts to yourself or an admin and moves the
  three "Request payment" reminders to `request_payment_nudge()` with a manager check and a server-side cooldown
  (MERCHANT_QUEUE M7), and fixes no-show attribution (M3). App side: `useMessageUser` hook, queue-close confirmation
  (M1), honest "Call next" under two counters (M2), payment claims need an amount (Q6), dismissed served-unpaid cards
  move to History (Q4), directions/message on a called card (Q9), colour tokens (Q10/M9). New specs
  `critical/queue-console` and `critical/notifications-authorized`; booking-accept now checks the message button.
