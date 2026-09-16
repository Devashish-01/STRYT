# Launch plan — live progress log

**Read this first if you are picking up the work.** It is updated as work happens, newest entry at the bottom.
Plan: `docs/plan/README.md` and `docs/plan/phases/P00…P15`. Rules: `docs/plan/AGENT_RULES.md`, database rules:
`docs/database/HANDOFF.md` (§5 procedure for every production change).

## Where things stand (2026-09-16, late)

| Phase | State |
|---|---|
| P03–P06 | Done, merged to `develop` |
| **P07 E2E suite** | Full run #1 green: **134 passed, 0 failed** (with reseed, 9.8 min). 17 critical journeys (queue console added); breadth spec 103 screens; `tests/e2e/COVERAGE.md` maps all 52 flows. Left: action specs for screen-only flows, 2 more consecutive green full runs, P07 report. |
| **P08 gap ledger** | **Done.** 488 rows, **0 unverified, 0 open**: 430 FIXED, 49 DEFERRED (v1.1, decision D17), 9 DECISION. Every domain verified against the code and, where it mattered, against the live database. |
| **P09 fixes** | 430 FIXED (app + 16 DB migrations on staging), 0 OPEN. |
| **P10 i18n** | P10.A done. P10.B under way: **1744 → 1181** strings (`npm run check-strings` is the ratchet, lowered with each batch). Converted so far: community post detail and composer, business settings, team & access (plus the shared scope labels), the shop dashboard, the listing flow, appointments, the queue board, provider settings, support, provider money, the place submission form and provider jobs. Every draft is queued for native review in `docs/i18n/REVIEW_QUEUE.md`. Left: the rest, biggest first (`--by-file`), then D9 review and `--max 0`. |
| **P11 performance/deps** | P11.A: no high/critical advisory in shipped code (maplibre-gl 6, react-map-gl 8.1.3). P11.B: guest /home first load 2136 KB → 1605 KB (JS 1924 → 1377 KB), measured on the staging build — Firebase and Leaflet load only when used, each device downloads only its language. Left: P11 report, Lighthouse on a deployed preview. |
| P12 | Not started |
| P13–P15 | Owner-led |

All work is committed on `phase/07-e2e` (local; push refused by the tool — owner to push).

### Waiting on the owner

1. **Apply on production, in order: `20260973` → `20260988`** (`supabase/APPLY_LOG.md` → Pending). Broken for every
   production user today: chat send + emergency live share (73), owner review replies, story reactions, provider
   recommendations (74), request notifications to shops/providers (75, 77), counter-offers (76), bulk campaigns never
   close (79); plus the admin audit trail (78). A read-only production scan shows exactly the 6 broken functions these
   fix and nothing else. `20260980` additionally closes a notification-spoofing hole (E2E-040) and must ship together
   with the app change that moves payment reminders to the new server function.
2. Push `phase/07-e2e`; release to `main` (ships every app fix), then the pending phone-column lockdown.
   Also **deploy the edge functions** `purge-deleted-accounts`, `admin-delete-profile` and `verification-review` — their
   audit writes went to a table PostgREST can't reach (E2E-042) and the purge could delete a login while leaving the
   shop live (DEL-2).
3. Decisions: **E2E-028** restore or retire "Me too"; **E2E-037** what "Take action" does for reported reviews/users.
4. `ci_readonly` login + `DRIFT_DATABASE_URL` secret; Sentry, Play Console, lawyer, testers, devices (P13–P15).
5. Migrate existing base64 image rows to storage (E2E-015 follow-up, production writes).
6. On a real phone after release: **Google sign-in** (Firebase now loads only when it is used) and **the map screen**
   (maplibre-gl 6 — basemap, pan/zoom, the pin-drop location picker). Both are proven on the staging build in a
   desktop browser; neither has device coverage.
7. Decision **D17** (the v1.1 deferrals list in `docs/plan/DECISIONS.md`) and native Hindi/Marathi review (D9).

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
- 2026-09-16 — Full run #2 green (136 passed). P08 verification of delivery (29 rows, all DEFERRED behind the v1
  feature flag) and of account deletion, admin moderation, notifications, profile privacy, role switching and console
  security (42 rows). Fixes made on the way: account purge could delete a login and leave the shop live (DEL-2);
  data export covered a fraction of the account (DEL-3); cancelling a deletion switched hidden profiles and shops back
  on (DEL-5, migration 20260981); deleting an account took one tap (DEL-6); moderation told authors nothing and left
  comment removals unaudited (MOD-1/3, migration 20260982); reported ratings and users were filed as "Action taken"
  with the content untouched (MOD-2); notifications had no paging, a stale badge and a 16px "Mark all read"
  (NOTIF-4/5/6/7); the phone field wrote an unverified number over the login identity (PROF-1); alias couldn't be
  cleared, avatars saved themselves, provider listings stayed at old coordinates, verification badges never showed
  (PROF-3/7/8/10); a delegated manager's /manage was blank (ROLE-4); five wrong console-password guesses by anyone
  locked the owner out and anyone could make them (SEC-2/4, migration 20260983); password changes told nobody
  (SEC-3, migration 20260984). New: **E2E-042** — every admin audit write from the edge functions was silently lost
  (private.admin_action_logs is unreachable through PostgREST).
- 2026-09-16 — **P08 finished: the gap ledger has no unverified and no open rows left.** Verified the remaining
  domains — requests/proposals (32), business console (64), provider console (49), community/ratings (51),
  onboarding (55), discovery (39) — and fixed what they turned up. Bigger ones: search matched only a listing's own
  name with no radius or ordering, so it couldn't find a shop by what it sells (20260986, with category counts moved
  into the database); restocking overwrote a colleague's count (20260985); the portfolio manager listed curated
  stand-in photos the owner couldn't really delete; answering a customer question could silently do nothing; a
  provider's reachouts screen had no link anywhere in the app. Then the last open rows: live location kept
  broadcasting after its last recipient was revoked (20260987), emergency contacts couldn't include anyone you
  hadn't chatted with (20260988), chat threads loaded every message ever sent, the OTP boxes dropped fast keystrokes,
  and 77 form labels weren't tied to their fields (new audit `scripts/audit/label-association.mjs`, now 0).
  Full run #3 caught three specs that my own changes had invalidated (search is a searchbox now; the review sheet is
  titled "Edit your review" when one exists) — fixed, and the suite re-run.
- 2026-09-16 — P10.A: `src/lib/i18n.parity.test.ts` (same keys, no blanks, matching placeholders in en/hi/mr) and
  `scripts/check-hardcoded-strings.mjs` wired into `npm run lint` as a ratchet; shared feed/result cards translated.
- 2026-09-16 — P11.A (4073960): maplibre-gl 5 → 6 (critical XSS advisory in 5.x), transitive highs fixed, unused
  `lucide-react` removed. Remaining advisories: react-router-dom (moderate, needs v7) and vite/vitest (dev-only).
- 2026-09-16 — P11.B (4b70f33, cbf0f10): Firebase is imported only when Google sign-in is used (and its redirect check
  only runs when a redirect is pending); the Vite `manualChunks` rules that pinned Firebase and Leaflet into every
  page load were removed; translations split into `src/lib/i18n/{en,hi,mr}.ts` with Hindi/Marathi loaded on demand
  before the first render (`src/lib/i18n/runtime.ts`). Probe: English loads no language chunk, Hindi/Marathi load
  only their own and paint Devanagari on first render.
- 2026-09-16 — **Map fix (d7f9636).** The maplibre-gl 6 upgrade had left the map blank under its pins: the tile
  worker wasn't in the build (fixed by passing a Vite-bundled `workerUrl` to the map), react-map-gl 8.1.1 crashed on
  camera events (→ 8.1.3), and the Mapbox fallback never rendered (style rejected by maplibre's validator; sprite
  URLs 404'd — both fixed). New spec `critical/map-basemap` waits for a real vector tile and fails when the worker is
  blocked. Breadth + onboarding + map specs 106/106, unit 645/645, lint clean (ESLint back to the 30-warning budget).
  Note for runs on this machine: free RAM is very low with the local databases/IDEs open — one run died with
  `VirtualAlloc failed`, another with DNS drops; use `--workers 1–2`.
- 2026-09-17 — P11.D applied on staging (`20260989`): nine RLS policies now evaluate `auth.uid()` once per statement
  and the four unindexed foreign keys have covering indexes; the staging advisor's `auth_rls_initplan` and
  `unindexed_foreign_keys` both fell to 0. Production waits for the owner (APPLY_LOG).
- 2026-09-17 — P10.B began, biggest screens first: 330 strings converted across six screens and the shared scope
  labels (`SCOPE_LABEL_KEYS`). The checker itself was wrong three ways — it read generic type parameters and JSX
  ternaries as screen text (39 findings that nobody could translate), and it never looked at `hint`, `subtitle`,
  `description`, `caption` or `text` props, which hid 84 real strings. Both fixed, so the count is now honest.
- 2026-09-17 — Full E2E run on the current code: **133 passed, 4 failed**, all four re-run green in isolation on a
  fresh seed. They were machine-load flakes (that run took 20.9 min against the usual ~10; this machine has under a
  gigabyte of free RAM with the local databases and IDEs open). Use `--workers 1` here, and don't apply a migration
  while a run is in flight — doing so is what broke the run before it.
- 2026-09-17 — **Five screens were printing a translation key instead of words** — `t()` falls back to the key, so
  `t("share_word")` rendered "share_word" in every language, English included. Three were written
  `t("x") || "Fallback"`, which never reaches the fallback. Fixed, and `src/lib/i18n.keys.test.ts` now fails on any
  key that has no English entry; it caught a second instance within the hour.
- 2026-09-17 — Known gap, not yet done: the per-package **vocabulary** (appointment / consultation / test / visit) in
  `src/lib/businessPackages.ts` is English in a constants file that 10+ screens read, and the string checker cannot
  see it. It needs its own batch: keys per package, resolved at render.
- 2026-09-17 — Machine note: **C: has 3.9 GB free of 272 GB**. That is the likely cause of the `VirtualAlloc failed`
  crash and the flaky full runs, since Windows cannot grow the pagefile. The owner chose to leave the disk as is, so
  full runs stay unreliable; re-run individual failures before believing them.
