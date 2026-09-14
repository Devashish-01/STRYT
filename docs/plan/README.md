# STRYT — Launch Plan (phase by phase)

**Goal:** a mature app with no known functional defects, safe to open to the public on Android (Google Play) and the web (stryt.in).
**Excluded:** buying the Supabase Pro plan. Phase 01 adds free weekly backups instead.
**Written:** 2026-09-13, from a full review of the repository, the live database, CI and the shipped bundle.

This plan is built for coding agents such as **Antigravity/Gemini** that work **one phase per session**, with an independent checker verifying each phase before the next starts.

---

## 1. The finish line — what "ready for the public" means

The app is ready only when **every** line below is true, with evidence:

| # | Gate | Measured by | Phase |
|---|---|---|---|
| 1 | No open functional defects | `docs/gaps/GAP_LEDGER.csv`: 0 `OPEN` P0/P1; every P2/P3 `FIXED` or deferred in writing by the owner | P08, P09 |
| 2 | Every flow works end to end | E2E suite covers all 52 flows; green 3 runs in a row; 0 `test.fixme` | P07, P09 |
| 3 | Works on real phones and browsers | Device QA matrix: every row passes | P13 |
| 4 | Nothing ships unchecked | CI must pass before any OTA, Android or web release | P02 |
| 5 | Secure | SECURITY DEFINER audit: 0 HIGH open; stranger-access tests pass on every personal-data table; advisor has no ERROR except the accepted PostGIS item | P04, P05 |
| 6 | Dependencies clean | `npm audit --omit=dev`: 0 high/critical | P11 |
| 7 | Database rebuildable | Staging built from baseline + migrations matches the production schema snapshot | P06 |
| 8 | Operable | Weekly backups with a tested restore; error monitoring; uptime alerts; runbooks | P01, P14 |
| 9 | Speaks the user's language | 0 hardcoded user-facing strings; Hindi and Marathi reviewed by a native speaker | P10 |
| 10 | Store and legal | Play production approved; Data safety matches the real data inventory; legal documents reviewed | P15 |

**On "100% accuracy":** no model can promise it, and this plan doesn't rely on anyone's promise. Accuracy comes from:
- **Small phases.** Each has a fixed scope.
- **Objective gates.** Commands with expected output, not opinions.
- **Tests before fixes.** A bug is proven by a failing test first.
- **An independent checker.** It re-runs everything before a phase counts as done.
- **Owner decisions written down.** Nothing is guessed.

Past agent reports on this project claimed work that hadn't been done: invented hashes, skipped preconditions. The checker step exists because of that.

---

## 2. Baseline on 2026-09-13 (for measuring progress)

| Area | Value |
|---|---|
| App code | ~99k lines TS/TSX; 136 screens, 115 components, 33 services |
| Type-check / ESLint | 0 errors / 0 errors, 30 warnings |
| Unit tests | 38 files, 610 tests (clean checkout) |
| E2E | View-only route audit only; signed-in flows untested |
| Gap findings | 426 across 52 gap logs, with no per-item fixed/open status |
| `any` in app code | 670 |
| Hardcoded toast strings | ~356 in 97 files (vs 40 translated) |
| npm audit | 15 (2 critical, 7 high, 6 moderate) |
| Security advisor | 1 ERROR (PostGIS `spatial_ref_sys`), 34 anon-callable and 194 authenticated-callable SECURITY DEFINER functions, 2 unpinned `search_path` |
| Shipped bundle | 5.7 MB (map library 1,030 KB; main 530 KB; icons 347 KB) |
| Database | 90 app tables; 48 in no migration; Free plan, no automatic backups |
| CI | Push to `main` publishes the OTA, builds Android and deploys web — **with no test gate** |

---

## 3. Phases

Run them **in order**. A phase starts only when the previous one is **Done** (checker-verified).

| Phase | Name | Who | Size (sessions) | Status |
|---|---|---|---|---|
| [P00](phases/P00_owner_decisions.md) | Owner decisions | Owner (agent prepares) | 1 | ✅ Done |
| [P01](phases/P01_safety_net_and_repo_hygiene.md) | Safety net & repository hygiene | Agent + owner approvals | 1–2 | ✅ Done |
| [P02](phases/P02_release_gate_ci.md) | Release gate in CI | Agent + owner (GitHub settings) | 1 | ✅ Done |
| [P03](phases/P03_verify_db_guardrails.md) | Verify and finish the DB guardrails (W8) | Agent | 1–2 | ⬜ Not started |
| [P04](phases/P04_database_hardening.md) | Database hardening | Agent | 2 | ⬜ Not started |
| [P05](phases/P05_authorization_audit.md) | Authorization, storage, edge function & auth-config audit | Agent | 3–4 | ⬜ Not started |
| [P06](phases/P06_baseline_and_staging.md) | Rebuildable schema baseline & staging environment | Agent + owner | 2–3 | ⬜ Not started |
| [P07](phases/P07_e2e_test_suite.md) | End-to-end test suite on staging | Agent | 4–6 | ⬜ Not started |
| [P08](phases/P08_gap_ledger.md) | Gap ledger: verify all 426 findings | Agent | 13 (one per domain) | ⬜ Not started |
| [P09](phases/P09_close_functional_gaps.md) | Close functional gaps | Agent | 14+ | ⬜ Not started |
| [P10](phases/P10_i18n_completeness.md) | Translation completeness | Agent + native reviewer | 3–4 | ⬜ Not started |
| [P11](phases/P11_dependencies_bundle_performance.md) | Dependencies, bundle & performance | Agent | 2–3 | ⬜ Not started |
| [P12](phases/P12_code_quality.md) | Code quality refactors (behaviour-preserving) | Agent | 3–4 | ⬜ Not started |
| [P13](phases/P13_device_accessibility_qa.md) | Device, accessibility & browser QA | Owner + agent | 2–4 | ⬜ Not started |
| [P14](phases/P14_operations_monitoring.md) | Operations & monitoring | Agent + owner | 2 | ⬜ Not started |
| [P15](phases/P15_store_legal_launch.md) | Store, legal & public launch | Owner + agent | 2–3 (+14-day closed test) | ⬜ Not started |

Status values: `⬜ Not started` → `🔵 In progress` → `🟣 Ready for check` (set by the agent) → `✅ Done` (set only by the checker). A failed check goes back to `🔵` with the checker's findings.

---

## 4. Branches and releases

| Branch | Purpose | Who pushes |
|---|---|---|
| `main` | **What users run.** A push publishes the OTA to every installed app, builds Android and deploys stryt.in. | Only via a PR from `develop`, with owner approval, at a planned release |
| `develop` | Integration branch; created in P01 | PRs from phase branches, after the checker passes |
| `phase/NN-slug` | One branch per phase (or sub-phase) | The agent, after owner approval |

Never push to `main` directly. Never merge an unchecked phase.

---

## 5. How to run a phase

**Full prompt for Antigravity, with context, hard rules and working method:** [`ANTIGRAVITY_PROMPT.md`](ANTIGRAVITY_PROMPT.md). The short version is below.

### Prompt for the executing agent (Antigravity / Gemini)

```text
You are executing ONE phase of the STRYT launch plan.

Phase file: docs/plan/phases/<PHASE FILE>.md

Before doing anything, read these completely:
  1. docs/plan/AGENT_RULES.md
  2. docs/plan/DECISIONS.md
  3. the phase file
  4. every file listed in the phase's "Read first" section

Then:
- Check every precondition. If any fails, stop and tell me which one, with the command output.
- Do only this phase's steps, in order. Do not start the next phase.
- Stop and ask me whenever a "Stop and ask" condition is met, or whenever you are unsure.
- Do not commit, push, apply a migration, delete files, change GitHub/Supabase settings or write to
  production unless the current step says so AND I have confirmed in this chat.
- Every claim needs evidence: the exact command you ran and its real output. Never type a hash,
  count or result by hand.
- Finish by writing docs/plan/reports/<PHASE>_REPORT.md from docs/plan/REPORT_TEMPLATE.md, then set
  the phase status in docs/plan/README.md to "🟣 Ready for check". Never set "✅ Done" yourself.
```

### Prompt for the checker (Claude, or a second model)

```text
Independently verify phase <PHASE> of the STRYT launch plan.

Read docs/plan/AGENT_RULES.md, docs/plan/phases/<PHASE FILE>.md and docs/plan/reports/<PHASE>_REPORT.md.
Do not trust the report. Re-run every command in the phase's "Verification" section and every item in
its "Checker checklist" yourself. Recompute any hash or count from source.

Output one line per Definition of Done item: PASS or FAIL, with your own evidence.
If everything passes, set the phase status to "✅ Done" in docs/plan/README.md.
If anything fails, set it back to "🔵 In progress" and list exactly what must be fixed.
```

---

## 6. Files in this folder

| File | What |
|---|---|
| [`AGENT_RULES.md`](AGENT_RULES.md) | Rules every phase must follow |
| [`DECISIONS.md`](DECISIONS.md) | Decisions only the owner can make (P00 fills it in) |
| [`REPORT_TEMPLATE.md`](REPORT_TEMPLATE.md) | Structure of every phase report |
| `phases/` | One file per phase |
| `reports/` | One report per phase, written by the executing agent |

Related sources this plan builds on:
- `docs/database/HANDOFF.md`: database rules, traps and verification methods.
- `supabase/APPLY_LOG.md`: every production database change.
- `docs/gaps/`: 52 gap logs, `MASTER_FLOW_AUDIT_TRACKER.md` and `EXECUTION_PHASE_PLAN.md`.
- `docs/engineering/CODEBASE_MAP.md`: where each feature lives.
