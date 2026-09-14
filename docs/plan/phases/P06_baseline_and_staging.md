# P06 — Rebuildable schema baseline & staging environment

**Who:** agent; the owner installs software, provides connection strings in `.env` files, and confirms project settings
**Size:** 2–3 sessions
**Depends on:** P05; D6 (staging ref recorded) and D7 answered

## Goal
1. The database can be rebuilt from the repository: an official **baseline dump** plus the migrations after its cutoff.
2. A **staging** Supabase project is built from that baseline, matches production's schema, and holds only synthetic data.
3. The app runs against staging with test sign-in for every persona. P07's end-to-end tests run there.

## Why
- 48 of the 90 app tables exist in no migration, so migrations alone can't rebuild the database.
- There's no place to test signed-in flows, or run write tests, without touching real users' data.

## Preconditions
| Check | Command | Expected |
|---|---|---|
| Branch | `git switch -c phase/06-baseline-staging origin/develop` | Switched |
| Staging ref recorded | `DECISIONS.md` D6 | A ref that is **not** `gnswxlfmcwyhmzlfipql` |
| Staging project reachable | Management API `GET /v1/projects/<staging ref>` | `ACTIVE_HEALTHY` |
| Production Postgres version | Management API `GET /v1/projects/gnswxlfmcwyhmzlfipql` | Record `database.version` (17.x on 2026-09-13) |

## Read first
- `docs/database/HANDOFF.md` W2 (R3), §6.4 traps
- `scripts/snapshot-live-schema.mjs`: how it reads the project ref; what it covers
- `docs/plan/AGENT_RULES.md` §4 rule 19 (check the target)
- Supabase docs: "Backup and restore using the CLI" (which schemas and flags the CLI's `db dump` uses). **Replicate those `pg_dump` arguments without Docker.**

## Known traps
1. **No Docker**, so `supabase db dump` is out. Use the PostgreSQL client tools directly. `pg_dump` must be **the same major version or newer** than production (17).
2. A plain `pg_dump` of the whole database includes Supabase-managed schemas (`auth`, `storage`, `realtime`, `supabase_functions`, `extensions`, `graphql`, `vault`, `pgsodium`, …). Restoring those onto a fresh project fails or corrupts it. Dump **application objects only**, like the CLI does.
3. Some state isn't schema, so `pg_dump --schema-only` misses it and it needs its own script:
   - storage buckets (rows in `storage.buckets`) and the policies on `storage.objects`
   - `cron.job` rows
   - the `supabase_realtime` publication's table list
   - auth settings
   - edge function secrets (names only)
   - database webhooks / `pg_net` triggers
4. The snapshot script reads the production ref from `.env`. Add an explicit override, e.g. env `SNAPSHOT_PROJECT_REF`, and print the ref it's using. Without the override, it keeps today's default behaviour.
5. **Staging must never hold production personal data.** Copy schema only; seed synthetic data.

## Steps

### A. Tools and credentials
1. **Owner** installs the PostgreSQL 17 command-line tools on Windows (EnterpriseDB installer, "Command Line Tools" only; no server needed). Verify with `pg_dump --version` and `psql --version` (17.x).
2. **Owner** adds connection strings, never printed or committed (both files are covered by `.gitignore`'s `.env*`):
   - `PROD_DB_URL` (session pooler, `postgres` user) to `.env`
   - `STAGING_DB_URL`, `STAGING_SUPABASE_URL`, `STAGING_ANON_KEY`, `STAGING_SERVICE_KEY` to a new `.env.staging`

   Verify with `git check-ignore .env.staging`.

### B. Baseline
3. Write `scripts/baseline/dump-baseline.mjs`:
   - read `PROD_DB_URL`;
   - run `pg_dump --schema-only` with the application-schema selection and exclusions matching the Supabase CLI (document every flag, with a reason, in the script header);
   - write `supabase/baseline/<YYYY-MM-DD>_schema.sql`;
   - record the ledger's newest migration version as the **cutoff** in a header comment.
4. Write `scripts/baseline/dump-platform-state.mjs` (read-only). It emits `supabase/baseline/<date>_platform_state.sql` with idempotent statements for:
   - buckets and their settings;
   - `storage.objects` policies;
   - cron jobs;
   - the realtime publication's tables;
   - `pg_net`/webhook triggers not already in the schema dump.
5. Secret scan both files (keys, JWTs, passwords, `sb_secret_`, `service_role` values): 0 hits.
6. Write `supabase/baseline/README.md` — **the rebuild procedure**, in order:
   1. required extensions;
   2. `<date>_schema.sql`;
   3. `<date>_platform_state.sql`;
   4. every migration with version > cutoff, in order;
   5. seed (staging only).

### C. Build staging
7. **Check the target.** Print the staging ref from `STAGING_DB_URL`; it must differ from production. The scripts refuse to run otherwise.
8. Apply the rebuild procedure to staging with `psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f …`. Paste any error. **Fix the baseline scripts, not the staging database by hand.**
9. `SNAPSHOT_PROJECT_REF=<staging> node scripts/snapshot-live-schema.mjs <scratch>/staging.sql` and a fresh production snapshot, then diff them (skipping header lines).
   - **Allowed differences only:** the header, ledger rows, extension versions, and objects Supabase creates per project. List each remaining diff line with a reason.
   - Any application object difference means the baseline is incomplete: go back to B.
10. Deploy all 8 edge functions to staging with `npx supabase functions deploy <name> --project-ref <staging> --use-api`. Set staging secrets with **staging-only values**; push delivery may use a test FCM project or be disabled on staging, but document which.
11. **Owner**, staging auth:
    - enable phone sign-in with **test OTP numbers**, one per persona;
    - enable email for the admin persona;
    - set the site URL and redirects to `http://localhost:5173` and the Vercel preview domain.

### D. Synthetic data
12. Write `scripts/seed-staging.mjs`:
    - **Hard guard:** exit unless the target ref equals D6's staging ref and differs from production.
    - Create personas through the staging Auth admin API: `customer1`, `customer2`, `owner1` (one business with catalog, hours, queue settings, slots), `staff_queue` (team scope `queue`), `staff_appointments`, `provider1`, `rider1` (only if D2 = ship delivery), `admin1`.
    - Deterministic ids, names clearly fake ("Test Customer One"), India coordinates near one test area.
    - `--reset` truncates **application tables only** on staging and reseeds.
13. Add `npm run seed:staging` and `npm run dev:staging` (`vite --mode staging`, reading `.env.staging`; confirm how `src/config.ts` resolves env vars and add only what's needed).

### E. Prove it
14. `npm run seed:staging -- --reset` twice in a row: same row counts both times (paste them).
15. `npm run dev:staging`. Sign in as each persona via the test OTP, using Playwright (headed or trace) or by hand. Screenshot each persona's home screen into the report.
16. Run the production and staging guest API smoke tests (P04 step 10) against staging: all 200.
17. Update `docs/database/HANDOFF.md`:
    - W2 R3 → done (option a);
    - add a *Staging* section: ref, what's seeded, how to rebuild, rule "no production data".
18. Run `npm run verify`. Commit (owner-confirmed) the scripts, `supabase/baseline/*`, the package scripts and docs. Push; open a PR into `develop`.

## Verification
| Command | Expected |
|---|---|
| `pg_dump --version` | 17.x or newer |
| Secret scan of `supabase/baseline/` | 0 hits |
| Staging vs production snapshot diff | Only allowed differences, each explained |
| Seed guard: `node scripts/seed-staging.mjs` with production values injected **in a dry-run flag only** | Refuses with a clear message; no connection attempted |
| `npm run seed:staging -- --reset` ×2 | Identical counts |
| Persona sign-in | Every persona reaches its home screen |
| `npm run verify` | exit 0 |

## Definition of Done
- [ ] Baseline and platform-state dumps committed, with a documented cutoff and rebuild README.
- [ ] Staging rebuilt only from the repository and schema-identical to production (explained differences only).
- [ ] Edge functions deployed to staging; auth configured with test OTPs.
- [ ] Seed script guarded, idempotent and synthetic.
- [ ] Every persona can sign in on staging.

## Stop and ask if
- The free plan blocks the staging project (D6).
- A restore error needs a manual fix on staging.
- Any production data would be copied.

## Checker checklist
- Re-run the snapshot diff yourself.
- Read the seed script's guard and try it against the production ref (it must refuse before connecting).
- `git grep -n -I -E "eyJ|sb_secret_|password" -- supabase/baseline`: review every hit.
- Rebuild a **second throwaway** copy only if the owner has a spare project; otherwise re-run steps 8–9 on staging after `--reset`.
