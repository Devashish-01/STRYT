# P03 — Verify and finish the database guardrails (W8)

**Who:** agent; owner sets one database password and one GitHub secret
**Size:** 1–2 sessions
**Depends on:** P02; D8 answered

## Goal
The W8 guardrails Gemini delivered on `wip/w8-guardrails` are independently proven correct, and CI uses a **least-privilege database role**, not a personal access token:
- a migration linter
- an upgraded drift checker
- linter tests
- a DB guardrails CI workflow

## Why
- W8 was marked "✅ DONE" in the handoff by the agent that wrote it, with no independent check.
- Its workflow asks for `SUPABASE_PERSONAL_ACCESS_TOKEN` as a GitHub secret. That token can control the **whole Supabase account**.
- Past agent reports on this project contained invented results.

## Preconditions
| Check | Command | Expected |
|---|---|---|
| Branch | `git fetch origin && git switch -c phase/03-db-guardrails origin/develop` | Switched |
| WIP exists | `git show --stat --oneline -1 origin/wip/w8-guardrails` | 10 files |
| D8 answered | `docs/plan/DECISIONS.md` | a) `ci_readonly` (otherwise stop and ask) |

## Read first
- `docs/database/HANDOFF.md` §1, §5, §6.1–6.4 and the W8 section on the WIP branch
- `supabase/APPLY_LOG.md`, **including the "Corrections" section**
- The WIP files: `git show origin/wip/w8-guardrails:<path>` for each of the 10

## Known traps
1. **Fabricated hashes.** `APPLY_LOG.md` rows 6–17 contain 11 **fake** sha256 values. The real ones are in *Corrections → Row 18*. A linter rule that checks "applied files are immutable" against rows 6–17 is wrong, even if it passes today.
2. **Overloads.** `is_admin()` and `is_admin(text)`, and two `bulk_deal_token_redeem` overloads, exist live. Drift matching must key on the full signature.
3. **Snapshot vs catalog.** `pg_get_triggerdef` omits the `public.` schema prefix, and whitespace differs between file and catalog. Compare normalised bodies (HANDOFF §6.1).
4. **PostGIS.** PostGIS functions live in `public`. The drift checker must not report ~740 PostGIS functions as "database-only".

## Steps

### A. Bring W8 in
1. `git merge --no-ff origin/wip/w8-guardrails`. Resolve any `docs/database/HANDOFF.md` conflict by keeping both sides' content; don't drop the release notes already on `develop`.

### B. Verify the linter (`scripts/lint-migrations.mjs`)
2. Read the whole script. For each of its 4 rules, write down in the report exactly what it matches, and every allow-list or whitelist it uses.
3. Add fixture tests in `tests/lint-migrations.test.ts` where missing. Each rule needs at least one **must-fail** and one **must-pass** fixture:
   - SECURITY DEFINER without `search_path`
   - missing `REVOKE … FROM public, anon`
   - `USING (true)` on a personal-data table
   - an edited applied file
4. **Rule 4 (immutability):**
   - Check which hash source it reads. It must use the real hashes: the file's current sha256 for every migration that appears in the ledger, or the *Corrections* table, **not** rows 6–17.
   - Prove it: copy an applied migration to a temp dir, change one character, point the linter at it, and it must fail. Then restore.
5. Run `npm run lint:migrations -- --all` and paste the summary. Errors must be 0.
   - List the warning categories and counts.
   - Confirm warnings on already-applied files are informational, and that a **new** migration with the same problem is an **error** (fixture).

### C. Verify the drift checker (`scripts/check-migration-drift.mjs`)
6. Run it against production **read-only** (it must not write) and paste the output.
   - Cross-check its counts against a fresh snapshot: `node scripts/snapshot-live-schema.mjs <scratch>/p03.sql`.
7. Plant known drift, only in a forced-rollback transaction: in one `DO` block, `create or replace` a harmless test function body, run the checker's SQL inside it, then `RAISE EXCEPTION`.
   - If the checker can't run inside the transaction, instead prove detection with `--snapshot` against an edited copy of a snapshot file.
   - Detection must report it.
8. Confirm overloads (`is_admin` ×2, `bulk_deal_token_redeem` ×2) are matched by signature and not reported as drift.
9. Confirm PostGIS objects aren't reported.

### D. Least-privilege CI role (a database change — full HANDOFF §5 procedure)
10. Write `supabase/migrations/<next number>_ci_readonly_role.sql`:
    ```sql
    create role ci_readonly nologin noinherit;
    grant connect on database postgres to ci_readonly;
    grant usage on schema supabase_migrations to ci_readonly;
    grant select on supabase_migrations.schema_migrations to ci_readonly;
    ```
    Add nothing on `public` tables. Catalog reads (`pg_proc`, `pg_policies`, `pg_trigger`) need no grant.
11. Write the rollback: `revoke …; drop role if exists ci_readonly;`.
12. Forced-rollback test:
    - create the role;
    - `set local role ci_readonly`;
    - prove it **can** read `pg_proc.prosrc`, `pg_policies` and `supabase_migrations.schema_migrations`;
    - prove it **cannot** `select` from `public.users` (expect `42501`);
    - `RAISE EXCEPTION`.
13. Apply through the procedure: backup, snapshot, `apply_migration` named after the file, verify, snapshot after (the diff shows only the role), advisor, then an `APPLY_LOG.md` row.
14. **Owner:** set a strong password and allow login, via Dashboard → Database → Roles, or once in the SQL editor: `alter role ci_readonly with login password '<generated>';`. This is a credential, so it's never committed. Then create the GitHub secret `DRIFT_DATABASE_URL`, using the **session pooler** string with user `ci_readonly.gnswxlfmcwyhmzlfipql`.
15. Change `.github/workflows/db-guardrails.yml` so the nightly drift job uses `DATABASE_URL: ${{ secrets.DRIFT_DATABASE_URL }}` and **no** `SUPABASE_PERSONAL_ACCESS_TOKEN`. Keep the PR lint job secret-free.
16. Trigger the workflow with `gh workflow run db-guardrails.yml --ref phase/03-db-guardrails` (owner-confirmed) and paste the run result. The drift job must connect as `ci_readonly` and pass.

### E. Finish
17. Rewrite the handoff's W8 section. It should record what was independently verified, the role, the secret *name* (not its value) and how to run each tool.
18. Run `npm run verify`, commit (owner-confirmed), push, and open a PR into `develop`.

## Verification
| Command | Expected |
|---|---|
| `npx vitest run tests/lint-migrations.test.ts` | All pass, including new must-fail/must-pass fixtures for 4 rules |
| `npm run lint:migrations -- --all` | 0 errors |
| Tampered applied file (step 4) | Linter exits non-zero |
| `npm run check-drift` (production, read-only) | 0 drift; no PostGIS or overload false positives |
| `grep -n "SUPABASE_PERSONAL_ACCESS_TOKEN" .github/workflows/db-guardrails.yml` | No output |
| `gh run list --workflow db-guardrails.yml --limit 1` | success |
| `npm run verify` | exit 0 |

## Definition of Done
- [ ] Every linter rule has must-fail and must-pass fixtures, and rule 4 is proven against a tampered file.
- [ ] The drift checker detects planted drift, with no PostGIS or overload false positives.
- [ ] `ci_readonly` applied via the procedure (APPLY_LOG row) and proven unable to read table data.
- [ ] The workflow uses `DRIFT_DATABASE_URL`, with no personal access token, and has passed once.
- [ ] HANDOFF W8 section rewritten with verified facts.

## Stop and ask if
- The linter or drift checker needs substantial redesign rather than fixes. Report the design flaw first.
- The session pooler rejects the custom role.

## Checker checklist
- Re-run all verification commands.
- Tamper test yourself: edit one character of any applied migration, run the linter (expect failure), restore it.
- As `ci_readonly` (from the owner's secret or a forced-rollback `set local role`), confirm `select 1 from public.users limit 1` fails with `42501`.
- `APPLY_LOG.md` has the new row, with a sha256 you recompute from the file.
