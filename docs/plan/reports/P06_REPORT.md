# P06 Report — Rebuildable schema baseline & staging environment

**Agent / model:** Claude (Opus 5), Claude Code
**Session date (UTC):** 2026-09-15
**Branch:** `phase/06-baseline-staging`

## 1. Preconditions

| Check | Result | Pass? |
|---|---|---|
| Staging ref recorded (D6) | `laswruzdyqehziyupmdm`, not production | ✅ |
| Staging reachable | Management API `GET /v1/projects/laswruzdyqehziyupmdm` → `ACTIVE_HEALTHY`, Postgres 17.6.1.166 | ✅ |
| Production Postgres | 17.6.1.127 | ✅ recorded |
| D7 answered | (a) official baseline + later migrations | ✅ |

## 2. Deviations from the phase file (and why)

| Phase file says | Done instead | Why |
|---|---|---|
| Owner installs PostgreSQL 17 tools; `pg_dump` via `PROD_DB_URL` / `STAGING_DB_URL` | `scripts/baseline/dump-baseline.mjs` builds the baseline from `pg_catalog` through the Management API; `apply-baseline.mjs` applies it through the same API | No `pg_dump` on the machine, and creating database passwords/connection strings is a credential step the agent's tool refuses. The catalog functions give the same definitions; parity was proven (§4). |
| Personas sign in through `/auth/phone` → `/auth/otp` | Through `/auth/otp` only (phone handed over via `sessionStorage.otp_phone`, as the app does) | Production login is Google-only: `/auth/phone` renders "Continue with Google" and has no phone field. The OTP screen is the app's only phone sign-in path. |
| E2E web server `npm run dev:staging` | `npm run build:staging && npm run preview:staging` | The Vite dev server compiled on first load and made sign-in flaky (2/7 failures, different each run). |
| D6 region ap-northeast-1 | Staging is in **ap-south-1** | That's where the project exists (Management API). No effect on tests; noted in DECISIONS.md. |

## 3. Steps done

- **Baseline (D7 a):** `supabase/baseline/2026-09-15_schema.sql` (719 KB, 1,566 items: 7 extensions, `private` schema, 6 enums, 91 tables, 248 functions, 192 key/unique/check constraints, 137 foreign keys, 178 indexes, 69 triggers incl. `auth.users → handle_new_auth_user`, RLS on 91 tables, 206 policies, exact table/column/function grants) and `2026-09-15_platform_state.sql` (3 buckets, 4 storage policies, 34 realtime tables, 3 cron jobs, ledger with one baseline row). Cutoff `20260915163940`. Secret scan clean. Rebuild procedure: `supabase/baseline/README.md`.
- **Applier guard:** `node scripts/baseline/apply-baseline.mjs gnswxlfmcwyhmzlfipql --dry-run` → `REFUSED: gnswxlfmcwyhmzlfipql is PRODUCTION`, exit 2. Batches are single transactions (tested on staging: a failing multi-statement request left no table behind).
- **Staging rebuilt from the repo:** schema 1,566/1,566 items, 0 errors; platform state 46 items (one fix during the run: bucket boolean formatted `t`; generator corrected and re-run).
- **Staging auth:** `scripts/staging/setup-staging-auth.mjs` — phone sign-in with 7 test OTP numbers, email auto-confirm, site URL `http://localhost:5173`; writes `.env.staging` (gitignored, values never printed).
- **Seed:** `scripts/staging/seed-staging.mjs` — guard `--target gnswxlfmcwyhmzlfipql --dry-run` → `REFUSED … Nothing was sent`, exit 2. Categories copied from production (reference data only); synthetic personas, business, provider, team sessions.
- **Edge functions:** all 8 deployed to staging with `npx supabase functions deploy <name> --project-ref laswruzdyqehziyupmdm --use-api` (no Docker). Staging has no FCM/email/AI provider secrets, so those functions fail there by design.
- **E2E foundation:** `playwright.e2e.config.ts`, `tests/e2e/global-setup.ts` (staging guard + reseed), `tests/e2e/fixtures/staging.ts` (`signIn`, `personaPage`), `tests/e2e/smoke/personas-signin.spec.ts`, `tests/e2e/README.md`. npm scripts: `dev:staging`, `build:staging`, `preview:staging`, `seed:staging`, `check:staging-signin`, `e2e`, `e2e:ui`.
- **Snapshot override:** `SNAPSHOT_PROJECT_REF` in `scripts/snapshot-live-schema.mjs` (default behaviour unchanged).

## 4. Verification

| Check | Result |
|---|---|
| Staging vs production snapshot | Identical except `pg_net` 0.20.4 vs 0.20.3; two policies re-parsed without redundant parentheses (same meaning); ledger 1 vs 159 rows |
| Column SELECT grants | 7,211 = 7,211, 0 differences |
| Function EXECUTE lists | 248 = 248, 0 differences |
| Storage buckets / cron jobs / realtime tables / RLS flags | 3=3 / 3=3 / 34=34 / 91=91, 0 differences |
| Guest REST smoke on staging (publishable key) | businesses, categories, catalog_items, requests+users embed, stories, `rpc/queue_waiting_line` → 200; `users?select=phone`, `queue_tokens` → 401 (same as production) |
| `npm run seed:staging -- --reset` ×2 | `{"auth_users":7,"users":7,"categories":56,"businesses":1,"catalog_items":3,"queue_settings":1,"team_sessions":2,"providers":1,"provider_packages":2,"admins":1}` both times |
| `npm run check:staging-signin` | 7/7 personas: OTP 200, verify 200, session user id matches, `get_own_profile` 200 with roles, onboarding done, terms `2026-08-26` |
| `npm run e2e` (persona sign-in through the real OTP screen) | 2 consecutive runs, 7/7 passed each; every persona lands on `/home`; failed Supabase API calls: none; owner1 screenshot shows the loaded home (greeting, staging area "Test Nagar", categories from staging) |

## 5. Production / external changes

- **Production:** none (read-only catalog queries only).
- **Staging (`laswruzdyqehziyupmdm`):** schema + platform state applied, auth configuration changed (phone test OTPs, email auto-confirm, site URL), synthetic data seeded, 8 edge functions deployed. Authorized by the owner's standing instruction to complete the plan without per-step approval.

## 6. Decisions requested

None new.

## 7. Not done / not verified

- The event trigger `ensure_rls` (auto-enable RLS on new tables) can't be created on staging without superuser. New migrations must enable RLS explicitly.
- Staging vault secrets (`functions_url`, `service_role_key`) are not set, so database-triggered push delivery (`pg_net`) does nothing on staging.
- No second throwaway rebuild (no spare project); staging itself was built only from the repository.
- The admin persona signs in by phone; the email + password admin login page (`/admin/login`) is not seeded on staging.

## 8. Found, not fixed (for P08)

- `src/screens/auth/OtpVerify.tsx` `set()` builds the next digits from the render-time `digits`; filling boxes faster than React re-renders drops a digit. Real SMS autofill and paste use the full-code path, which works. Low risk. Candidate id `E2E-001`.
- `rpc/is_entity_recovery_set` returned 401 twice right after sign-in when the app ran on the Vite dev server (called before the session was attached). Not seen on the production build. Candidate id `E2E-002`, verify in P08.
