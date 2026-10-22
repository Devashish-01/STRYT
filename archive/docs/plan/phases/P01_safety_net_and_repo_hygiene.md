# P01 — Safety net & repository hygiene

**Who:** agent, with owner confirmation at each commit, push and scheduler step
**Size:** 1–2 sessions
**Depends on:** P00 (D12, D13 answered)

## Goal
1. Free weekly database backups are running (no Pro plan needed).
2. The working tree is clean: nothing important is uncommitted, and nothing unverified is mixed into real work.
3. A `develop` branch exists, so phase work never goes straight to `main` (which releases to all users).

## Why (as of 2026-09-13)
- **No backups:** the Free plan has none. The latest restore point is a manual one from before W7.
- **Uncommitted work, in several unrelated groups:**
  - Gemini's unverified W8 guardrails.
  - Android fixes.
  - Play Store assets, including store screenshots **inside `public/`**, which ship in every web deploy and OTA bundle.
  - 29 one-off database scripts.
  - a `scratch/` folder.
- **Diverged branches:** `origin/main` has a CI version bump; the sprint branch has a docs commit.

## Preconditions
| Check | Command | Expected |
|---|---|---|
| On the sprint branch | `git rev-parse --abbrev-ref HEAD` | `sprint-6-trust-safety-play-hardening` |
| D12, D13 answered | open `docs/plan/DECISIONS.md` | Answers present |
| Uncommitted changes are exactly the known set | `git status --short --untracked-files=all` | Only the paths in the inventory below. **Anything else → stop and ask.** |
| Backup folder exists outside the repo | `ls D:/STRYT-db-backups` | Lists earlier restore points |

### Inventory of uncommitted changes (2026-09-13)
| Group | Paths |
|---|---|
| **W8 (Gemini, unverified)** | `.github/workflows/db-guardrails.yml`, `scripts/lint-migrations.mjs`, `scripts/check-migration-drift.mjs` (modified), `tests/lint-migrations.test.ts`, `package.json` (modified: `check-drift`, `lint:migrations` scripts), `docs/database/HANDOFF.md` (modified: W8 section), `scratch/test-arg-normalization.mjs`, `scratch/test-overload-matching.mjs`, `scratch/test-overloads.mjs`, `scratch/test-sig-matching.mjs` |
| **Android** | `android/app/build.gradle` (modified), `android/app/src/main/AndroidManifest.xml` (modified), `android/app/src/main/res/values/colors.xml` (new) |
| **Play Store** | `playstore-assets/` (16 files), `public/play-feature-graphic.png`, `public/store-screenshots/` (4 files), `docs/launch/play-console/PLAY_CONSOLE_MASTER_DOSSIER.md`, `docs/launch/play-console/STORE_LISTING.md`, `scripts/gen-store-assets.mjs`, `scripts/setup-playstore-folder.mjs` |
| **One-off DB scripts** | `scripts/apply-w2-migration.mjs`, `apply-w6-batch.mjs`, `apply-w7-migration.mjs`, `audit-w3-migrations.mjs`, `check-20260955-diff.mjs`, `check-all-remaining-logic.mjs`, `check-apply-tool.mjs`, `compute-hashes.mjs`, `detailed-diff-w3.mjs`, `extract-w2-objects.mjs`, `gap-scan.py`, `generate-w2-migration.mjs`, `generate-w3-rollbacks.mjs`, `generate-w4-rollbacks.mjs`, `get-advisors-check.mjs`, `patch-20260955.mjs`, `smoke-test-w7-api.mjs`, `test-mcp-client.mjs`, `test-w4-forced-rollback.mjs`, `test-w5-forced-rollback.mjs`, `test-w7-forced-rollback.mjs`, `update-w2-migration.mjs`, `verify-post-apply.mjs`, `verify-w2-migration.mjs`, `verify-w3-phase2.mjs`, `verify-w4-zero-drift.mjs`, `verify-w5-post-test.mjs`, `verify-w7-zero-drift.mjs` (all in `scripts/`) |
| **Docs** | `docs/2026-09-11/CODEBASE_STRUCTURE_ANALYSIS.md`, `docs/database/W3_PHASE1_AUDIT_REPORT.json` |

## Read first
- `docs/plan/AGENT_RULES.md` §5 (Git) and §6 (Safety)
- `scripts/export-live-data.mjs` (header comment: usage, `--verify`, refusal to write inside a git repo)
- `scripts/snapshot-live-schema.mjs` (usage)

## In scope / out of scope
- **In:** the backup script and schedule; committing the groups above per D12/D13; creating `develop`; pushing `develop` and a WIP branch.
- **Out:** judging whether W8 is correct (that's P03). Any code change to the app.

## Steps

### A. Weekly backup (free)
1. Create `scripts/backup/weekly-backup.ps1`. It must:
   - Compute a UTC stamp and a folder name `weekly_<yyyy-MM-dd_HHmm>Z` under `D:\STRYT-db-backups\`.
   - From the repo root, run `node scripts/export-live-data.mjs "D:/STRYT-db-backups/<folder>" --verify`.
   - Run `node scripts/snapshot-live-schema.mjs "D:/STRYT-db-backups/<folder>/schema.sql"`.
   - Append a line to `D:\STRYT-db-backups\backup.log`: time, folder, exit codes, and the verify summary line.
   - **Retention:** keep the newest 8 folders whose name matches `^weekly_\d{4}-\d{2}-\d{2}_\d{4}Z$`. Never touch any other folder (manual restore points such as `2026-09-13_pre_w7` must survive).
   - Exit non-zero if the export or verify failed.
2. Run it once by hand, with the owner's OK:
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup/weekly-backup.ps1`.
   - Paste the verify summary (it must report every table restored, e.g. `90/90`).
   - Paste the new `backup.log` line.
3. Give the owner this command to register the schedule (the owner runs it; the machine must be on at that time):
   ```text
   schtasks /Create /TN "STRYT weekly DB backup" /SC WEEKLY /D SUN /ST 03:00 /TR "powershell -NoProfile -ExecutionPolicy Bypass -File D:\zetax\name\STRYT\scripts\backup\weekly-backup.ps1"
   ```
   The owner should also tick *"Run task as soon as possible after a scheduled start is missed"* in Task Scheduler.

   Verify with `schtasks /Query /TN "STRYT weekly DB backup"`.
4. Add a *Backups* section to `docs/database/HANDOFF.md` §2 that points at the script and the log.

### B. Park W8 on its own branch (unverified, but not lost)
5. `git switch -c wip/w8-guardrails`
6. `git diff --stat -- docs/database/HANDOFF.md package.json`. Confirm the HANDOFF changes are only in the W8 section and the `package.json` changes are only the two scripts. If not, stop and ask.
7. Stage exactly the 10 W8 paths from the inventory, with explicit paths.
   - `git diff --cached --name-only` must print exactly those 10.
   - Commit (owner-confirmed): `wip(db): W8 guardrails as delivered, not yet verified (see docs/plan P03)`.
8. Add `scratch/` to `.gitignore` in step 11, on `develop`.

### C. Create `develop`
9. `git fetch origin`. Then check that `git diff --quiet HEAD origin/main -- android` exits 0 (so the Android edits carry over cleanly); otherwise stop.
10. `git switch -c develop origin/main`
    - Then `git merge --no-ff sprint-6-trust-safety-play-hardening -m "merge: sprint branch into develop"`.
    - Expected: the only incoming changes are `docs/database/HANDOFF.md` and `docs/plan/`. Paste `git diff --stat origin/main..develop`.
11. Add `scratch/` to `.gitignore`. Commit (owner-confirmed).

### D. Android group (commit on `develop`)
12. Explain each Android diff in the report:
    - `build.gradle` derives `versionCode` from `versionName`.
    - `AndroidManifest.xml` adds `<queries>` so `tel:` intents resolve on Android 11+.
    - `colors.xml` is new.
13. Verify the Android build:
    - Run `npm run build`, then `npx cap sync android`, then in `android/` run `gradlew.bat assembleDebug`.
    - Paste the `BUILD SUCCESSFUL` line and the APK path.
    - If Gradle crashes (earlier `hs_err_pid*.log` files show JVM crashes on this machine), stop and report. Don't change JVM settings on your own.
    - After `cap sync`, `git status --short` may show only the 3 Android paths. If sync changed other tracked files, stop and ask.
14. Stage the 3 Android paths and commit (owner-confirmed):
    `fix(android): derive versionCode from versionName and allow dialer intents on Android 11+`.

### E. Play Store group (commit on `develop`)
15. `git grep -n -e "store-screenshots" -e "play-feature-graphic" -- src index.html vite.config.ts` must print nothing (no code uses them).
16. Move `public/play-feature-graphic.png` and `public/store-screenshots/` into `playstore-assets/`:
    - Before moving, compare sha256 values with any existing copies in `playstore-assets/`, and don't create duplicates.
    - Update the links in `docs/launch/play-console/PLAY_CONSOLE_MASTER_DOSSIER.md`.
17. Run `npm run build`, then show that `dist/store-screenshots` and `dist/play-feature-graphic.png` don't exist.
18. Stage `playstore-assets/`, `docs/launch/play-console/`, `scripts/gen-store-assets.mjs` and `scripts/setup-playstore-folder.mjs`. Commit (owner-confirmed).

### F. One-off DB scripts (per D12)
19. If D12 = archive:
    - Move the 28 `scripts/*` files listed (all except `lint-migrations.mjs`, which is W8) into `scripts/archive/db-work-2026-09/`.
    - Add `README.md` there: *"Historical one-off scripts from W2–W7. Do not run: several write to production."*
    - Find references with `git grep -n -E "scripts/(apply|audit|check-20260955|check-all|check-apply|compute-hashes|detailed-diff|extract-w2|gap-scan|generate-w|get-advisors|patch-2026|smoke-test-w7|test-mcp|test-w[0-9]|update-w2|verify-)" -- docs supabase` and update each path.
20. If D12 = delete: list the files for the owner and delete only after confirmation.
21. Commit (owner-confirmed).

### G. Docs group (per D13)
22. Move `docs/2026-09-11/CODEBASE_STRUCTURE_ANALYSIS.md` to `docs/engineering/` and commit it together with `docs/database/W3_PHASE1_AUDIT_REPORT.json`.

### H. Verify, then push (owner-confirmed)
23. Run the verification below.
24. Show the owner `git log --oneline origin/main..develop` and `git log --oneline -1 wip/w8-guardrails`. After confirmation:
    `git push -u origin develop` and `git push -u origin wip/w8-guardrails`.
25. `gh run list --limit 5` must show **no new** OTA or Android runs; release workflows only trigger on `main`.

## Verification
| Command | Expected |
|---|---|
| `git status --short --untracked-files=all` (on `develop`) | Empty |
| `git branch -vv` | `develop` tracks `origin/develop`; `wip/w8-guardrails` exists on origin |
| `npm run lint` | exit 0 |
| `npx eslint .` | 0 errors |
| `npx vitest run` | All pass (38 files; W8's test is on the WIP branch) |
| `npm run build` | exit 0; no `dist/store-screenshots` |
| `ls D:/STRYT-db-backups` | Contains one `weekly_…Z` folder |
| `schtasks /Query /TN "STRYT weekly DB backup"` | Task listed, weekly |

## Definition of Done
- [ ] Backup script committed; one successful run with a full verify line; schedule registered.
- [ ] W8 preserved on `wip/w8-guardrails` (10 files, nothing else).
- [ ] `develop` exists on origin, contains `origin/main` and the sprint branch, and has the Android, Play Store, scripts and docs commits.
- [ ] Store images no longer ship in the web/OTA bundle.
- [ ] Working tree clean; lint, ESLint, tests and build all pass.
- [ ] No release workflow was triggered.

## Stop and ask if
- `git status` shows paths not in the inventory. Someone else may be working in the tree.
- The HANDOFF or `package.json` diff contains more than W8's changes.
- The Android build fails, or the backup verify reports fewer tables than exported.

## Checker checklist
- Re-run every verification command.
- `git show --stat wip/w8-guardrails -1` lists exactly the 10 W8 paths.
- `git diff origin/main..develop --stat` contains no `.env*`, `.auth`, backups or database exports.
- Open `D:\STRYT-db-backups\backup.log` and confirm the entry matches the folder on disk.
- Confirm the retention code can only delete `weekly_…Z` folders (read the script).
