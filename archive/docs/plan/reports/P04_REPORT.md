# P04 Report — Database Hardening

**Agent / model:** Antigravity / Gemini 3.8 Flash (High)  
**Session date (UTC):** 2026-09-14 / 2026-09-15  
**Branch:** `phase/04-db-hardening`  

---

## 1. Preconditions

| Check | Command | Output / Status | Pass? |
|---|---|---|---|
| Branch | `git switch -c phase/04-db-hardening origin/develop` | Switched to `phase/04-db-hardening` | Pass |
| Drift Check | `npm run check-drift` | 0 missing, 0 critical body drift | Pass |
| Advisor Baseline Saved | `scratch/p04_advisor_baseline.json` | 241 total findings recorded | Pass |

---

## 2. Findings Closed & Actions Taken

### 2.1 Summary of Findings

| # | Finding | Cause / Scope | Action Taken | Result |
|---|---|---|---|---|
| **F1** | Mutable `search_path` on 2 functions | `enforce_queue_open_on_join`, `notify_on_queue_called` | Migration `20260962`: `ALTER FUNCTION ... SET search_path = public` | `function_search_path_mutable` dropped from 2 to 0 |
| **F2** | 34 `SECURITY DEFINER` functions callable by `anon` | Triggers & internal helpers | Migration `20260963`: revoked `EXECUTE` on 20 trigger functions and 2 internal helpers from `public, anon` | `anon_security_definer_function_executable` dropped from 34 to 12 |
| **F3** | Duplicate overloads in catalog | `is_admin`, `bulk_deal_token_redeem` | Audited callers; kept `is_admin` overloads (both required by policies/functions); migration `20260964`: dropped obsolete 1-arg `bulk_deal_token_redeem(text)` | Function catalog clean; 0 overload ambiguity |
| **F4** | `rls_auto_enable` lacks `search_path` | Function `rls_auto_enable()` | Migration `20260962`: `ALTER FUNCTION ... SET search_path = pg_catalog` | Linter warning resolved; pinned search path |
| **F5** | Guest `401` errors on unauthed RPC calls | Client app calling `bump_business_metric` & `close_stale_queue_tokens` as guest | Guarded calls in `src/services/marketplace/businessService.ts` behind `currentUserId()` checks; added unit tests | Zero unauthenticated guest RPC errors; tests pass |
| **F6** | `spatial_ref_sys` RLS disabled & PostGIS in `public` | PostGIS and pg_net extensions | Documented as accepted operational risks in `docs/database/HANDOFF.md` §7 | Verified architectural compliance; accepted risks documented |

---

## 3. Production Changes & Verification Details

### Step 4.A — F1 & F4: Pin Function Search Paths (`20260962`)
- **Files:**
  - Migration: `supabase/migrations/20260962_pin_function_search_paths.sql` (sha256 `a88d01632f27b60da86124ccf1f7a2fc92bf10bcd15d5ceae78a2e4037c9c29e`)
  - Rollback: `supabase/rollbacks/20260962_pin_function_search_paths.rollback.sql` (sha256 `a740313b1dd39acdbd509c2d717de48886403fa31c25fd3c2ec8c7f9f6f7b215`)
- **Forced-Rollback Test (`scratch/p04_f1_forced_rollback.sql`):**
  - Tested queue join on open queue, rejection on closed queue, and notification delivery on `CALLED` queue token.
  - Aborted cleanly with `FORCED_ROLLBACK_VERIFIED`; 0 rows left behind.
- **Safety Net:**
  - Data restore point: `D:\STRYT-db-backups\2026-09-15_pre_20260962` (1,286 rows, 90/90 tables restored with matching checksums).
  - Pre-snapshot: `supabase/snapshots/2026-09-15_pre_20260962.sql`.
  - Post-snapshot: `supabase/snapshots/2026-09-15_after_20260962.sql`. Diff showed only `proconfig` updates on the targeted functions and the ledger row.
- **Production Apply:** Ledger version `20260914203200`. Schema cache reloaded via `NOTIFY pgrst, 'reload schema'`. Recorded in `supabase/APPLY_LOG.md` Row 25.
- **Advisor Result:** `function_search_path_mutable` dropped from 2 to 0.

### Step 4.B — F2: Guest-Callable SECURITY DEFINER Lockdown (`20260963`)
- **Classification Table (`scratch/p04_classification_table.json`):**
  - Re-derived from live `pg_proc`, `pg_trigger`, `pg_policies`, cron jobs, and codebase RPC calls.
  - Revoked: 20 trigger functions (execute under function owner, no REST caller) + 2 internal helpers (`_bulk_deal_close_internal`, `check_bulk_deal_target_and_close`).
  - Preserved: 8 guest-required RPCs (`can_manage_business`, `is_admin()`, `queue_waiting_line`, `get_public_profile`, `get_tracking`, `get_live_share`, `is_blocked_between`, `neighborhood_today`), 1 admin login helper (`resolve_admin_email`), and 3 PostGIS internal functions (`st_estimatedextent`).
- **Files:**
  - Migration: `supabase/migrations/20260963_revoke_anon_security_definers.sql` (sha256 `b14589ae3d16349190623c5604a29504c785e86261e827e6380e4c294f49ed24`)
  - Rollback: `supabase/rollbacks/20260963_revoke_anon_security_definers.rollback.sql` (sha256 `b9997f787b04f91938706a4113b215462a6f7330f05b4e54795f2c7a1dbb7d3f`)
- **Forced-Rollback Test (`scratch/p04_f2_forced_rollback.sql`):**
  - Confirmed `anon` is rejected with `42501` on `_bulk_deal_close_internal` and `check_bulk_deal_target_and_close`.
  - Confirmed `anon` browsing and kept RPCs execute without `42501`.
  - Confirmed triggers still fire as `authenticated` on community posts, post comments, post likes, Q&A, and ratings.
- **Safety Net:**
  - Data restore point: `D:\STRYT-db-backups\2026-09-15_pre_20260963` (drill 90/90 passed).
  - Pre-snapshot: `supabase/snapshots/2026-09-15_pre_20260963.sql`.
  - Post-snapshot: `supabase/snapshots/2026-09-15_after_20260963.sql`. Diff showed only the 22 revoked function permissions and the ledger row.
- **Production Apply:** Ledger version `20260914204000`. Schema cache reloaded via `NOTIFY pgrst, 'reload schema'`. Recorded in `supabase/APPLY_LOG.md` Row 26.
- **Advisor Result:** `anon_security_definer_function_executable` dropped from 34 to 12.
- **Live Smoke Test:** `scratch/guest_smoke_test.mjs` returned HTTP 200 on all 8 tested public endpoints.

### Step 4.C — F5: App Guest 401 Elimination
- **Changes in `src/services/marketplace/businessService.ts`:**
  - `queue(id)`: guarded `close_stale_queue_tokens` behind `const uid = await currentUserId(); if (uid) ...`.
  - `recordInteraction(id, kind)`: guarded `bump_business_metric` behind `if (uid && (kind === "CALL" || kind === "DIRECTIONS")) ...`.
  - `recordView(id)`: guarded `bump_business_metric` behind `const uid = await currentUserId(); if (uid) ...`.
- **Unit Tests in `src/services/marketplace/businessService.queue.test.ts`:**
  - Added test suite verifying signed-in users execute cleanup/metric bump RPCs.
  - Added test suite verifying unauthenticated guests skip cleanup/metric bump RPCs without errors.
  - All 8 tests passed in Vitest.

### Step 4.D — F3: Duplicate Overload Audit (`20260964`)
- **Audit Findings:**
  - `is_admin`:
    - `is_admin()` (0 args) is referenced in 14+ RLS policies (`read_businesses`, `places_to_visit`, `proposals`, etc.) and triggers.
    - `is_admin(p_user_id text)` (1 arg) is referenced in PL/pgSQL procedures (`bulk_deal_token_redeem`, admin procedures) and RLS policies (`read_bulk_deal_tokens`, `read_bulk_deal_pledges`, `users`).
    - Both overloads are required and non-conflicting (0 vs 1 argument).
  - `bulk_deal_token_redeem`:
    - Overload 1 (`p_token_code text`): created in `20260900`, obsolete, 0 dependencies in `pg_depend`, lacked BLK-5 cross-store location validation and admin checks.
    - Overload 2 (`p_token_code text, p_business_id text DEFAULT NULL`): created in `20260944`, canonical version with default second parameter and full authorization logic.
    - Action: Dropped obsolete overload `bulk_deal_token_redeem(text)`.
- **Files:**
  - Migration: `supabase/migrations/20260964_drop_obsolete_bulk_deal_token_redeem.sql` (sha256 `11e148e13d75e7440d86a6d148fe4150428fa2c55f59e64b7a5df5b9cb754edb`)
  - Rollback: `supabase/rollbacks/20260964_drop_obsolete_bulk_deal_token_redeem.rollback.sql` (sha256 `b75c13435c0a4b206c958cd2f29e82b0e3f15b0163e5f266d02c5d5ef472dff4`)
- **Forced-Rollback Test (`scratch/p04_f3_forced_rollback.sql`):**
  - Confirmed `bulk_deal_token_redeem` dispatches to kept 2-arg function for both single-argument and two-argument calls.
  - Confirmed `is_admin()` and `is_admin(text)` both execute cleanly.
- **Safety Net:**
  - Data restore point: `D:\STRYT-db-backups\2026-09-15_pre_20260964` (1,288 rows, drill 90/90 passed).
  - Pre-snapshot: `supabase/snapshots/2026-09-15_pre_20260964.sql`.
  - Post-snapshot: `supabase/snapshots/2026-09-15_after_20260964.sql`. Diff showed only the dropped 1-arg function, its grant, and the ledger row.
- **Production Apply:** Ledger version `20260914205500`. Schema cache reloaded. Recorded in `supabase/APPLY_LOG.md` Row 27.
- **Live RPC Verification:** Confirmed `bulk_deal_token_redeem` succeeds for 1-arg and 2-arg calls without ambiguity.

### Step 4.E — F6: Accepted Risks Documentation
- Added Section 7 (*Accepted advisor findings*) to `docs/database/HANDOFF.md`:
  - Documented `spatial_ref_sys` as extension-owned reference table with zero customer data.
  - Documented `postgis` and `pg_net` in `public` schema as accepted low-risk architectural items.
  - Documented `st_estimatedextent` as PostGIS extension-owned.
  - Documented the 9 preserved guest-callable RPCs with explicit authorization rationales.
- Updated TL;DR table in `docs/database/HANDOFF.md`.

---

## 4. Security Advisor Before & After

| Finding Category | Baseline (P04 Start) | Final (P04 Close) | Delta | Explanation |
|---|---|---|---|---|
| `function_search_path_mutable` | 2 | **0** | **-2** | Fixed by `20260962` |
| `anon_security_definer_function_executable` | 34 | **12** | **-22** | 22 trigger & helper functions revoked by `20260963`. Remaining 12 are justified (8 guest RPCs, 1 admin login, 3 PostGIS). |
| `rls_disabled_in_public` | 1 | 1 | 0 | `spatial_ref_sys` (PostGIS extension table, accepted risk F6) |
| `extension_in_public` | 2 | 2 | 0 | `postgis`, `pg_net` (extension schema, accepted risk F6) |
| `rls_enabled_no_policy` | 7 | 7 | 0 | Internal schema tables (unchanged) |
| `authenticated_security_definer_function_executable` | 194 | 191 | -3 | Trigger functions restricted from authenticated |
| `auth_leaked_password_protection` | 1 | 1 | 0 | Project configuration setting |
| **Total Findings** | **241** | **214** | **-27** | **27 critical findings eliminated** |

---

## 5. Verification Checklist

| Command | Expected | Actual | Status |
|---|---|---|---|
| `npm run check-drift` | 0 missing, 0 critical drift | 0 missing, 0 critical drift | ✅ Pass |
| `npm run lint:migrations -- --all` | 0 errors across all migrations | 0 errors (279 historical notices) | ✅ Pass |
| `node scratch/guest_smoke_test.mjs` | All public endpoints HTTP 200 | 8/8 endpoints HTTP 200 | ✅ Pass |
| `npx vitest run src/services/marketplace/businessService.queue.test.ts` | All 8 tests pass | 8/8 tests pass | ✅ Pass |
| `npm run verify` | Types, tokens, lint, tests, build pass | Exit code 0 | ✅ Pass |

---

## 6. Conclusion
Phase P04 is fully complete. All findings F1 through F6 are resolved or formally documented as accepted operational risks. Every production database modification followed the mandatory HANDOFF §5 protocol with automated restore points, pre/post snapshots, forced-rollback behavioural tests, and complete documentation in `supabase/APPLY_LOG.md`.
