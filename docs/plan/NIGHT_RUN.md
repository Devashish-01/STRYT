# Overnight run — 2026-09-18

**Branch:** `night/2026-09-18` (cut from `phase/07-e2e` @ `8f5ce2d`)
**Started:** 02:33 local · **Owner review:** 07:30 local
**Instruction:** complete the remaining work to production quality, unattended, on a side branch.

This file is the queue *and* the handover. It is on disk on purpose: if the session dies, a cold session can
read this and carry on without re-deriving anything. Every task says what "done" means so nothing is left
half-judged.

## Rules this run holds to

- **Never** push, never touch `main`, never apply anything to production. Staging only, and only per
  `docs/database/HANDOFF.md` §5.
- An owner-only step is **not** worked around. It gets written up in §Owner steps and the task moves on.
- A bug found while refactoring goes to `docs/gaps/GAP_LEDGER.csv` as `OPEN`; it is not fixed inside the
  refactor (P12's rule, kept for every phase here).
- No claim of legal or accessibility *compliance* — P15 §15.B is explicit that the agent must not. Findings
  are stated as findings.
- `npx tsc --noEmit`, `npx eslint . --max-warnings 0` and `npx vitest run` must be green before each commit.
  E2E is run at checkpoints, not per commit (12 min a time).

## Queue

Status: `[ ]` pending · `[~]` in progress · `[x]` done · `[!]` blocked (reason given) · `[owner]` handed over

### A — P15 data inventory (highest value: every store declaration depends on it)
- [x] **A1** `docs/launch/DATA_INVENTORY.md` built *from the code and schema*, not from existing docs. Per
  data type: where collected (screen/service), where stored (table/bucket), who can read it (P05 matrix),
  third parties, retention, whether optional. Must cover name, alias, phone, email, precise + approximate
  location, live location, emergency contacts, photos, chat, payment references, device/push tokens, crash
  data, analytics, verification documents, ratings.
  *Done when:* every row cites a real file path or table name that exists, checked by script.
- [x] **A2** Diff the inventory against `PLAY_CONSOLE_MASTER_DOSSIER.md` §4 and `legal/privacy-policy.md`.
  Every mismatch listed. *Done when:* a mismatch table exists and each row says which source is wrong.
- [x] **A3** Draft the corrections to `legal/privacy-policy.md` and siblings so they match A1.
  *Done when:* drafted and flagged for the owner's lawyer — not marked compliant.

### B — P14 error monitoring (you cannot fix what you cannot see)
- [x] **B1** Sentry wiring for web + native, initialised **only when a DSN is present** so dev and tests stay
  silent. `release` from package.json version + platform.
- [x] **B2** `beforeSend` scrubber removing phone, email, name, address, lat/lng, OTP, token, handoff code
  from message, breadcrumbs, request bodies and URLs. **Unit-tested with realistic Indian-format samples.**
  *Done when:* the scrubber has tests that fail if a field leaks.
- [x] **B3** Top-level error boundary that reports and shows a retry screen.
- [x] **B4** Confirm `dist/` ships no `.map` files (or they are blocked). *Done when:* proven by a build.
- [owner] Sentry project + `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` secrets.

### C — P14 job monitoring
- [ ] **C1** Migration granting `ci_readonly` select on `cron.job_run_details` and `cron.job`, with a verbatim
  rollback, forced-rollback test, applied to **staging only** per HANDOFF §5.
- [ ] **C2** Extend `db-guardrails.yml` to fail when a cron job failed in the last 24 h or has not run within
  twice its schedule.
- [owner] Uptime monitors; confirming GitHub failure emails are on.

### D — P13 device & accessibility prep
- [x] **D1** `docs/qa/DEVICE_MATRIX.md` — device classes, Android versions, what only a device can prove.
- [x] **D2** `docs/qa/DEVICE_QA_CHECKLIST.md` — push, permissions, camera, dialling, background/resume, slow
  network, screen reader, large fonts. Each item says what "pass" looks like.
- [x] **D3** Automated accessibility pass over the app's own markup: run an a11y audit in the E2E harness
  (axe) across the screens breadth spec already visits, log findings to the ledger.
- [owner] Running the checklist on real phones.

### E — P12 leftovers
- [ ] **E1** `any` reduction: row mappers still typed `(row: any)` — `rowToProposal`, `rowToRequest`,
  `mapAgreement`. Per-query row types. Target: services ≤ 20, app ≤ 250 (currently 128 / 455).
- [ ] **E2** `catch (e: any)` → `unknown` + a shared `errorMessage(err)` helper (~175 sites app-wide).
- [ ] **E3** The five screens over 700 lines, via a container/presenter hook each, **not** prop-drilling:
  BusinessDetail 1263, CommunityCompose 1205, CommunityPostDetail 1176, AppointmentSheet 1147,
  BusinessAppointments 1014. One screen per commit, E2E at the end.

### F — Reports and phase closure
- [ ] **F1** `P07_REPORT.md` — the E2E suite, its coverage, the 137-test run.
- [ ] **F2** `P11_REPORT.md` — dependencies, bundle, RLS initplan. Lighthouse marked owner-blocked.
- [ ] **F3** `P13_REPORT.md`, `P14_REPORT.md`, `P15_REPORT.md` for whatever landed.
- [ ] **F4** `docs/plan/README.md` phase table brought true.

### G — Checkpoints
- [ ] **G1** Full E2E after B+C land.
- [ ] **G2** Full E2E after E lands.
- [ ] **G3** Final: `npm run verify`, full E2E, clean tree, this file's handover section written.

## A note on how this runs

A self-waking scheduled job was attempted and **refused by the safety classifier** ("Create Unsafe Agents").
That refusal is respected, not worked around — so this run is one continuous session rather than a
self-restarting loop. The consequence: if the session ends, nothing restarts itself. That is exactly why this
file exists and why every task states its own definition of done; picking it up cold costs a read, not a
re-derivation.

## Progress log

Appended as work lands. Newest last.

| Time | Task | Result |
|---|---|---|
| 02:33 | — | Branch cut, queue written. |
| 02:34 | harness | Self-waking cron refused by the classifier. Not worked around; run continues in-session. |
| ~02:20 | A1 | DATA_INVENTORY written from schema + code. 18 file paths and 22 table.column refs verified by script, 0 missing. Six findings raised, incl. purge-deleted-accounts not deployed so the 30-day deletion promise does not complete. |
| ~02:30 | A2 | Diff written: dossier §4 is wrong on 3 rows and missing 5 data types (government ID, payment refs, address, crash logs, analytics). Privacy policy is the most accurate of the three. Corrected my own inventory first — I had auth and geocoding wrong. |
| ~02:38 | A3 | Privacy policy corrected on 3 factual points; legal/README records them as unreviewed with an empty reviewer row. |
| ~02:47 | B2 | scrubPii + 26 tests, wired into the existing client_errors sink — that was a live leak, not a future one. |
| 03:00 | B1/B3/B4 | Sentry wired, DSN-gated and lazily imported. Caught two bundle regressions: manualChunks pinned it into vendor-react (+27 KB eager), and the SW precached 350 KB of it. Both fixed; precache +7 KiB net. B3/B4 already satisfied. |
| 03:12 | D1/D2 | Device matrix + device QA checklist written. Scoped to what only a device proves; the 420-line MANUAL_TEST_PLAN already covers the functional flows and is cross-referenced rather than duplicated. |
| 03:15 | D3 | axe added to the E2E harness over 13 screens. 34 findings: 132 contrast nodes (logged P13-001, owner decision — it is the brand palette), 10 unnamed icon buttons and a disabled pinch-zoom, both fixed (P13-002/003), 4 smaller ones left open (P13-004). |

## Owner steps found so far

Collected here as they come up, so 07:30 has one list rather than a hunt.

| # | Step | Why it needs you |
|---|---|---|
| 1 | Apply migrations `20260973`–`20260989` to production | Production applies are owner-only (HANDOFF §5) |
| 2 | Deploy edge functions `purge-deleted-accounts`, `admin-delete-profile`, `verification-review` | Owner deploy step |
| 3 | Create the Sentry project; add `SENTRY_DSN` and `SENTRY_AUTH_TOKEN` as GitHub secrets | Account + secret creation |
| 4 | Create uptime monitors (stryt.in, app-update function, Supabase REST) | External account |
| 5 | Run the device QA checklist on real phones | Only a device can prove push, camera, dialling, background |
| 6 | Lawyer review of the legal documents for DPDP Act + IT Rules | The agent must not claim legal compliance |
| 7 | Play Console paperwork and the closed test | Owner-only console access |
| 8 | Lighthouse run against a deployed preview | Needs a deployed URL |
| 9 | **Highest priority.** `purge-deleted-accounts` has never been deployed, so the 30-day account-deletion promise in the privacy policy and the store listing does not complete | Owner deploy step; found by A1/A2 |
