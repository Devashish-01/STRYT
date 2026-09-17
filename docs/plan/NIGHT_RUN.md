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
- [ ] **A1** `docs/launch/DATA_INVENTORY.md` built *from the code and schema*, not from existing docs. Per
  data type: where collected (screen/service), where stored (table/bucket), who can read it (P05 matrix),
  third parties, retention, whether optional. Must cover name, alias, phone, email, precise + approximate
  location, live location, emergency contacts, photos, chat, payment references, device/push tokens, crash
  data, analytics, verification documents, ratings.
  *Done when:* every row cites a real file path or table name that exists, checked by script.
- [ ] **A2** Diff the inventory against `PLAY_CONSOLE_MASTER_DOSSIER.md` §4 and `legal/privacy-policy.md`.
  Every mismatch listed. *Done when:* a mismatch table exists and each row says which source is wrong.
- [ ] **A3** Draft the corrections to `legal/privacy-policy.md` and siblings so they match A1.
  *Done when:* drafted and flagged for the owner's lawyer — not marked compliant.

### B — P14 error monitoring (you cannot fix what you cannot see)
- [ ] **B1** Sentry wiring for web + native, initialised **only when a DSN is present** so dev and tests stay
  silent. `release` from package.json version + platform.
- [ ] **B2** `beforeSend` scrubber removing phone, email, name, address, lat/lng, OTP, token, handoff code
  from message, breadcrumbs, request bodies and URLs. **Unit-tested with realistic Indian-format samples.**
  *Done when:* the scrubber has tests that fail if a field leaks.
- [ ] **B3** Top-level error boundary that reports and shows a retry screen.
- [ ] **B4** Confirm `dist/` ships no `.map` files (or they are blocked). *Done when:* proven by a build.
- [owner] Sentry project + `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` secrets.

### C — P14 job monitoring
- [ ] **C1** Migration granting `ci_readonly` select on `cron.job_run_details` and `cron.job`, with a verbatim
  rollback, forced-rollback test, applied to **staging only** per HANDOFF §5.
- [ ] **C2** Extend `db-guardrails.yml` to fail when a cron job failed in the last 24 h or has not run within
  twice its schedule.
- [owner] Uptime monitors; confirming GitHub failure emails are on.

### D — P13 device & accessibility prep
- [ ] **D1** `docs/qa/DEVICE_MATRIX.md` — device classes, Android versions, what only a device can prove.
- [ ] **D2** `docs/qa/DEVICE_QA_CHECKLIST.md` — push, permissions, camera, dialling, background/resume, slow
  network, screen reader, large fonts. Each item says what "pass" looks like.
- [ ] **D3** Automated accessibility pass over the app's own markup: run an a11y audit in the E2E harness
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

## Progress log

Appended as work lands. Newest last.

| Time | Task | Result |
|---|---|---|
| 02:33 | — | Branch cut, queue written. |

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
