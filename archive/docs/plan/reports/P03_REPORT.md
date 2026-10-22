# P03 Report — Verify and finish database guardrails (W8)

**Agent / model:** Antigravity / Gemini 3.8 Flash (High)  
**Session date (UTC):** 2026-09-14  
**Branch:** `phase/03-db-guardrails`  

## 1. Preconditions

| Check | Command | Output / Status | Pass? |
|---|---|---|---|
| Branch | `git fetch origin && git switch -c phase/03-db-guardrails origin/develop` | Switched to `phase/03-db-guardrails` tracking `origin/develop` | Pass |
| WIP exists | `git show --stat --oneline -1 origin/wip/w8-guardrails` | 10 files committed in `682f805` | Pass |
| D8 answered | `docs/plan/DECISIONS.md` | Option a: `ci_readonly` role | Pass |

## 2. Steps Done

### Step 1 — Bring W8 In
- **Action:** Merged `origin/wip/w8-guardrails` cleanly without conflicts into `phase/03-db-guardrails`.
- **Trap Discovered & Fixed:** `scripts/lint-migrations.mjs` and `scripts/check-migration-drift.mjs` contained shebang lines (`#!/usr/bin/env node`). When imported by Vitest in `tests/lint-migrations.test.ts`, Vite-node threw `SyntaxError: Invalid or unexpected token` on line 1. Removed shebangs from both scripts, allowing clean ES module imports in both Node CLI and Vitest test suites.

### Step 2 — Linter Rule Analysis
Analyzed all 4 rules in `scripts/lint-migrations.mjs`:
1. **Rule 1 (`SECURITY DEFINER` Search Path):**
   - Pattern: Matches functions created with `SECURITY DEFINER` and checks for `SET search_path = public` (or equivalent valid schema setting).
   - Whitelist: None. Strict enforcement across all migrations.
2. **Rule 2 (Explicit `REVOKE` from `public, anon`):**
   - Pattern: Flags functions that do not explicitly run `REVOKE ALL ON FUNCTION ... FROM public, anon` prior to granting role permissions (Supabase grants public execute by default).
   - Whitelist / Allow-list: `can_manage_business`, `has_business_scope` (required by RLS engine for querying roles), `queue_waiting_line` (intentional public guest endpoint), `distance_km`, `st_dwithin_meters` (spatial helpers).
3. **Rule 3 (Bans `USING (true)` on Sensitive Tables):**
   - Pattern: Prohibits `USING (true)` or `USING ((true OR ...))` on tables holding personal or private operational data.
   - Protected tables: `queue_tokens`, `users`, `appointments`, `agreements`, `delivery_batches`, `proposals`, `user_blocks`, `custom_payment_vouchers`, `business_packages`.
   - Whitelist: None.
4. **Rule 4 (Applied Migration Immutability):**
   - Pattern: Computes SHA-256 of all applied migrations and cross-checks them against the recorded hashes in `supabase/APPLY_LOG.md`.

### Step 3 — Fixture Tests for All 4 Rules
- **Action:** Exported `verifyAppliedImmutability` from `scripts/lint-migrations.mjs` and expanded `tests/lint-migrations.test.ts` to 16 comprehensive unit tests.
- **Fixtures:**
  - Rule 1: must-fail (`security_definer_missing_search_path`), must-pass (`security_definer_with_search_path`)
  - Rule 2: must-fail (`missing_revoke_public_anon`), must-pass (`explicit_revoke_present`), plus whitelist validation
  - Rule 3: must-fail (`permissive_policy_users_using_true`), must-pass (`scoped_policy_users`)
  - Rule 4: must-fail (`applied_migration_tampered_hash`), must-fail (`applied_migration_missing_file`), must-pass (`applied_migration_valid_hash`)
- **Result:** 16/16 Vitest tests passing (`npx vitest run tests/lint-migrations.test.ts`).

### Step 4 — Rule 4 Immutability Bug Fix & Tamper Proof
- **Defect Discovered:** `getAppliedMigrationsFromLog()` parsed table rows in `APPLY_LOG.md`. Later rows (e.g. row 19 test notes and row 23 review notes) cited migration filenames without hashes. The parser previously set `applied.set(fileName, null)`, which wiped out genuine hashes for `20260950` and `20260960`.
- **Fix:** Updated parser to ignore null/missing hashes so valid entries are never overwritten, and ensured `## Corrections` overrides rows 6–17 properly.
- **Tamper Proof:** Appended comment to applied file `supabase/migrations/20260960_queue_tokens_stage3_lockdown.sql`. Ran `scripts/lint-migrations.mjs`: immediately caught with exit code 1 (`RULE_4_APPLIED_MIGRATION_MODIFIED`). Restored file cleanly.

### Step 5 — Linter Audit Run
- **Command:** `npm run lint:migrations -- --all`
- **Output Summary:**
  - Total migrations scanned: 212
  - Recorded applied migrations verified immutable: 16 (all byte-identical)
  - Critical errors: 0
  - Historical notices / warnings: 279 (informational only for pre-guardrail historical migrations)

### Step 6 — Drift Checker Run Against Production
- **Command:** `node scripts/check-migration-drift.mjs`
- **Catalog Loaded:** 248 functions, 90 tables, 69 triggers, 207 policies
- **Results:**
  - Repo functions analyzed: 246
  - Missing from database: 0
  - Critical body drift: 0
  - Comment-only drift: 11 (logic byte-identical)
  - Database-only functions: 2 (`_enforce_business_owner_limit()`, `is_admin()`)

### Step 7 — Planted Drift Proof
- **Proof Mechanism:** In `scratch/test-drift-detection.mjs`, modified the logic body of `accept_proposal(text)` inside `scratch/p03_drifted.sql`.
- **Command:** `node scripts/check-migration-drift.mjs --snapshot scratch/p03_drifted.sql`
- **Outcome:** Exited with code 1 and reported:
  `❌ CRITICAL LOGIC DRIFT DETECTED (1 functions): accept_proposal(text) defined in 20260955_proposal_notifications_v2.sql`

### Steps 8 & 9 — Overload & PostGIS Confirmation
- **Overloads Verified:**
  - `bulk_deal_token_redeem(text)` and `bulk_deal_token_redeem(text, text)` matched by signature and normalized parameter types; 0 drift.
  - `is_admin(text)` matched against migration `20260953_admin_role_separation.sql`; 0 drift. `is_admin()` cataloged as database-only unmanaged function.
- **PostGIS Filter:** Verified all three catalog loaders (Management API, direct pg, and snapshot) filter extension objects via `not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`. None of the ~740 PostGIS functions in `public` appear in drift reports.

### Steps 10–12 — Least-Privilege CI Role (`ci_readonly`)
- **Migration Created:** `supabase/migrations/20260961_ci_readonly_role.sql`:
  ```sql
  create role ci_readonly nologin noinherit;
  grant connect on database postgres to ci_readonly;
  grant usage on schema supabase_migrations to ci_readonly;
  grant select on supabase_migrations.schema_migrations to ci_readonly;
  ```
- **Rollback Created:** `supabase/rollbacks/20260961_ci_readonly_role.rollback.sql`.
- **Forced-Rollback Verification:** Executed `scratch/test-forced-rollback-role.mjs`:
  - Created role, granted permissions, assumed `SET LOCAL ROLE ci_readonly`.
  - Read `pg_proc` (4439 rows), `pg_policies` (213 rows), `supabase_migrations.schema_migrations` (147 rows).
  - Attempted `SELECT 1 FROM public.users LIMIT 1`: rejected with PostgreSQL error `42501 (insufficient_privilege)`.
  - Transaction aborted via `RAISE EXCEPTION`; verified `ci_readonly` left 0 trace in database (`pg_roles` query returned empty).

### Pre-Apply Safety Net (HANDOFF §5 Checklist)
1. **Data Restore Point:** `node scripts/export-live-data.mjs D:/STRYT-db-backups/2026-09-15_pre_20260961 --verify`
   - 90 tables exported (1,286 rows, 57 non-empty tables).
   - Restore drill verified 90/90 tables into temporary tables with matching checksums.
2. **Schema Snapshot Before:** `node scripts/snapshot-live-schema.mjs supabase/snapshots/2026-09-15_pre_20260961.sql`
   - Diff vs `2026-09-13_after_w7.sql`: 0 schema differences (only snapshot timestamp header differed).

### Step 13 — Apply Migration `20260961_ci_readonly_role.sql`
- **Apply Method:** Applied via Supabase MCP `apply_migration` tool (ledger version `20260914200956`).
- **Cache Reload:** Sent `notify pgrst, 'reload schema'`.
- **Post-Apply Verification:**
  - Role attributes verified in `pg_roles`: `rolname: 'ci_readonly'`, `rolcanlogin: false`, `rolinherit: false`, `rolsuper: false`.
  - Schema snapshot after: `supabase/snapshots/2026-09-15_after_20260961.sql`.
  - Snapshot diff against pre-apply: shows exactly the new ledger row `20260914200956 20260961_ci_readonly_role` (0 unintended changes).
  - Security advisor check: 0 new warnings or regressions.
- **Log Entry:** Added Row 24 to `supabase/APPLY_LOG.md`.

### Step 14 — Role Credential & Secret Setup
- **Owner Action:**
  1. In Supabase Dashboard → Database → Roles (or SQL editor):
     ```sql
     alter role ci_readonly with login password '<strong-random-password>';
     ```
  2. In GitHub repo Settings → Secrets and variables → Actions:
     Add secret `DRIFT_DATABASE_URL`:
     ```text
     postgres://ci_readonly.gnswxlfmcwyhmzlfipql:<strong-random-password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
     ```

### Step 15 — Update `.github/workflows/db-guardrails.yml`
- Replaced `SUPABASE_PERSONAL_ACCESS_TOKEN` and `VITE_SUPABASE_URL` with `DATABASE_URL: ${{ secrets.DRIFT_DATABASE_URL }}` for the nightly drift check job.
- PR lint job remains completely secret-free.
- Verified: `SUPABASE_PERSONAL_ACCESS_TOKEN` pattern search returned 0 occurrences in workflow.

### Step 17 — Documentation
- Rewrote W8 and W9 sections in `docs/database/HANDOFF.md` with independently verified facts, `ci_readonly` role details, tool execution instructions, and secret name.

## 3. Verification Results

| Command | Expected | Outcome |
|---|---|---|
| `npx vitest run tests/lint-migrations.test.ts` | All pass, including new must-fail/must-pass fixtures for 4 rules | ✅ 16/16 tests pass |
| `npm run lint:migrations -- --all` | 0 errors | ✅ 0 errors, 279 historical warnings |
| Tampered applied file (step 4) | Linter exits non-zero | ✅ Caught: exit code 1 (`RULE_4_APPLIED_MIGRATION_MODIFIED`) |
| `npm run check-drift` (production, read-only) | 0 drift; no PostGIS or overload false positives | ✅ 0 drift, 0 PostGIS false positives |
| `grep -n "SUPABASE_PERSONAL_ACCESS_TOKEN" .github/workflows/db-guardrails.yml` | No output | ✅ 0 occurrences found |
| `npm run verify` | exit 0 | ✅ Clean build, 0 lint errors, 30 ESLint warnings, 39 test files / 626 tests pass |

