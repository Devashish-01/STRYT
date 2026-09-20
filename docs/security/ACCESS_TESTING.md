# Access testing — which tool, and when

STRYT has **two** access-control test harnesses. They look similar and are not interchangeable. This
page exists because the second one was written without noticing the first, and the overlap should be a
deliberate choice from now on rather than an accident.

Both answer "who can reach what", but they attack the question from different layers, and a hole can be
invisible to one and obvious to the other.

---

## The two harnesses

| | `scripts/audit/data-access-tests.mjs` | `scripts/db-tests/idor-sweep.mjs` |
|---|---|---|
| **Runs against** | **production** | **staging** |
| **Layer** | SQL, via the Management API | the real **PostgREST HTTP API** |
| **Actors** | `anon`, stranger, participant, owner, `team_right`, `team_wrong` — simulated in SQL | `anon` + all 7 personas, **actually signed in** with the staging test OTP |
| **Operations** | SELECT, UPDATE, DELETE (row counts) | SELECT, cross-user SELECT, anon INSERT authorization |
| **INSERT** | not tested generically (needs per-table values) | probed with an empty body: `400` = authorized, `401/403` = blocked. Nothing is written |
| **Safety** | every table in a forced-rollback transaction; ends with `RAISE EXCEPTION` | read-only by construction — it never writes |
| **Output** | `data-access-results.json` → `DATA_ACCESS_MATRIX.md` | console/JSON + **exit code** (CI-usable) |
| **Expectations** | read the matrix and judge | `idor-allowlist.json` — every allowed exposure carries a written reason |
| **Command** | `node scripts/audit/data-access-tests.mjs <out.json>` | `npm run check-idor` |

---

## Why both

**The SQL harness sees privileges as Postgres evaluates them.** That is the truth about RLS, and it is
the only one that can safely run on production data, where the interesting rows actually live. It found
real holes on 2026-09-15: a stranger reading password and recovery hashes, emails and exact locations
out of `users`; a stranger deleting business stories (APPLY_LOG rows 31–35).

**The HTTP harness sees what the internet sees.** Table grants, PostgREST's schema exposure and the
policy all have to line up before a request succeeds, and a table can be locked down in one of those and
open in another. `tracking_tokens` (GAPS_LOG #30) was exactly that shape: a `USING (true)` policy *plus*
a `SELECT` grant to `anon`, reachable by anyone holding the publishable key. It also signs in as real
users through `/auth/v1`, so it exercises the JWT the app actually carries rather than a simulated role.

Neither is a superset. Run both.

---

## When to run which

| Situation | Run |
|---|---|
| Any migration touching RLS, grants, or a `SECURITY DEFINER` function | **both** — sweep on staging before the apply, SQL audit on production after |
| Before a release | both |
| After adding a table | **sweep first** — it will tell you if the table is exposed before real data is in it |
| Investigating a suspected leak in live data | SQL audit (production is where the rows are) |
| In CI | sweep (it has an exit code; the SQL audit needs a production token) |

There is a third, narrower guard that is **not** about leaks: `scripts/check-policy-grants.mjs` asks
whether a policy *crashes* — a policy whose qual calls a function the role cannot `EXECUTE` aborts the
whole statement. That has shipped three times and once broke all guest browsing. A policy can pass the
leak tests and fail that one.

---

## Known limits — read these before trusting a clean run

**An empty table passes every access test ever written.** The sweep's first run could only test
cross-user reads on **2 of the 49** tables that have an owner column; the other 47 had no rows in
staging, so "nothing leaked" meant "nothing existed". `scripts/db-tests/idor-fixtures.sql` gives the
privacy-sensitive tables one row per persona. **Load the fixtures before believing a clean sweep**, and
run `idor-fixtures-teardown.sql` afterwards.

**The sweep's table list comes from `src/types/database.types.ts`**, because Supabase now requires a
secret API key for PostgREST's OpenAPI document and a secret key has no business in a harness that also
signs in as ordinary users. A table that exists in the database but is missing from that generated file
**goes unswept and silently passes**. This has already happened once: `customer_onboarding_state`
(migration `20260993`) was missing from the types file and was skipped; it was checked by hand instead
and was clean. The sweep prints a warning when the types file is older than the newest migration —
**do not ignore that warning**, regenerate the types.

**The SQL audit's matrix is a snapshot, not a monitor.** `DATA_ACCESS_MATRIX.md` carries the timestamp
of its last run. If that predates the newest migration, it is describing a database that no longer
exists.

**Neither harness sees column grants.** Both count *rows* an actor can reach, so a column-level
`REVOKE SELECT (col)` is invisible to them. When `20260994` removed `phone` from `authenticated`'s
grants on `users`, the refreshed matrix showed **no change at all** for that table — a stranger still
reads all 32 rows, because the row-level policy is unchanged and intended. The lockdown was proved
instead by reading the column directly as an `authenticated` role and getting `42501`. If you change a
column grant, verify it with a direct column read; a clean matrix says nothing about it either way.

---

## Files

```
scripts/audit/data-access-tests.mjs          production SQL audit
scripts/audit/render-data-access-matrix.mjs  turns its JSON into the matrix
docs/security/DATA_ACCESS_MATRIX.md          the rendered result (check its date)
docs/security/data-access-results.json       raw results

scripts/db-tests/idor-sweep.mjs              staging HTTP sweep   (npm run check-idor)
scripts/db-tests/idor-allowlist.json         justified exposures — each entry is a product claim
scripts/db-tests/idor-fixtures.sql           test rows, without which the sweep is blind
scripts/db-tests/idor-fixtures-teardown.sql  removes them

scripts/check-policy-grants.mjs              "does this policy crash?" — a different question
```
