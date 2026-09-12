# Production database apply log

Project `gnswxlfmcwyhmzlfipql` ("Name", ap-northeast-1) — the database the app talks to.

Append-only. One row per change to the production database, newest at the bottom.
Never edit or delete a past row; correct it with a new row.

## Rules (effective 2026-09-11)

1. **Every database change is a migration file** in `supabase/migrations/`, reviewed before it touches production. An emergency hotfix gets its matching file, and a row here, the same day.
2. **An applied file never changes.** Fixes go in a new file.
3. **One way in.** Apply only with `apply_migration` (Supabase MCP) or `supabase db push`, named exactly after the file. Never the SQL Editor. Never paste bundles.
4. **Replacing something that exists?** Diff it against the live definition first, and save a rollback file in `supabase/rollbacks/` built from the live catalog (snapshot), never from memory.
5. **After every apply:** check the live definition matches the file, reload the API schema cache (`notify pgrst, 'reload schema'`), run the security advisor, add a row here.
6. **Snapshot before and after each batch:** `node scripts/snapshot-live-schema.mjs supabase/snapshots/<date>_<label>.sql`.

## Status

- **Change freeze since 2026-09-11.** No production changes outside this process until the repo and database are reconciled.
- **Data backups: the organisation is on the Supabase Free plan, which has no restorable backups** (API: point-in-time recovery off, 0 completed backups). Upgrading to Pro turns on automatic daily backups; until then, take a manual restore point before every risky change: `node scripts/export-live-data.mjs D:/STRYT-db-backups/<UTC timestamp> --verify` (row 4). The output holds personal data, so it must live outside every git repo (the script refuses otherwise). Snapshots in `supabase/snapshots/` cover the schema only.
- Baseline findings: [`docs/database/DRIFT_BASELINE_2026-09-11.md`](../docs/database/DRIFT_BASELINE_2026-09-11.md).
- **Remaining work, rules and traps for whoever continues:** [`docs/database/HANDOFF.md`](../docs/database/HANDOFF.md).

## Pending — do not apply yet

| Change | File(s) | Apply only when | Pre-verified |
|---|---|---|---|
| **`queue_tokens` fix, stage 3 of 3.** Replace `queue_tokens_select_all` (readable by anyone) with `queue_tokens_select_participants` (token's customer or business owner; team members via the existing `queue`-scope policy). Revoke all `anon` privileges on `queue_tokens`. | `supabase/pending/queue_tokens_stage3_lockdown.sql`<br>rollback: `supabase/pending/queue_tokens_stage3_lockdown.rollback.sql` (copied verbatim from the row 1 snapshot by script) | The **stage 2 app build** is live for users: `businessService.queue()`/`myQueues()` on `queue_waiting_line()`, and `BusinessDetail` live-updating from `queue_settings`. Older installs would show an empty line. | Row 3: dry-run inside a forced rollback on 2026-09-11 — all checks passed. |

## Before this log

| When (UTC) | Change | Method | Notes |
|---|---|---|---|
| 2026-09-10 18:42 | `20260946_out_of_range_appointment_requests` applied | MCP `apply_migration` (ledger version `20260910184238`) | Verified: column, index, 3 functions, grants, API schema cache. No rollback file (predates these rules). |
| before 2026-09-10 | ~190 migrations applied by hand through the SQL Editor | SQL Editor paste | Not recorded in the ledger. Reconstructed by fingerprinting on 2026-09-11 — see the baseline doc. |

## Log

| # | When (UTC) | Change | File(s) | Method | Verified | Rollback |
|---|---|---|---|---|---|---|
| 1 | 2026-09-11 00:31 | Baseline snapshot. **No database change.** | `supabase/snapshots/2026-09-11_pre_reconcile.sql`<br>sha256 `32981438de83325f9275e5909a52328f8765e78e722c182f7f4bf076aec060c5` | `scripts/snapshot-live-schema.mjs` (read-only catalog queries) | 90 tables, 243 functions, 211 policies, 68 triggers, 178 indexes, 34 realtime tables, 3 cron jobs. Secret scan clean. | n/a |
| 2 | 2026-09-11 00:45 | **`queue_tokens` fix, stage 1 of 3 (additive).** New `queue_waiting_line()` returns line positions and party sizes only, no personal data. New `queue_settings.line_changed_at`, bumped by trigger `trg_queue_line_changed`, as a live-update source. | `supabase/migrations/20260957_queue_waiting_line.sql`<br>sha256 `0af07bb93db306d3055847e85632b26e79d9ee9fdf1fd41d56166474125a26f6` | MCP `apply_migration`, ledger `20260911004544` | Pre-check: production identical to row 1's snapshot. Both bodies match the file (md5); both pin `search_path=public`; EXECUTE `anon`+`authenticated` on `queue_waiting_line`, nobody on the trigger helper. Guest API call 200, helper 404. Behavioural test inside a forced rollback (line order, own token marked, guests see no IDs, 50-ID cap, trigger fires) left 0 rows. Advisor: only `+queue_waiting_line` on the two SECURITY DEFINER lists (intended). After-snapshot `supabase/snapshots/2026-09-11_after_20260957.sql` (sha256 `c0c64636ab245b9f6b09dfdeb06cc1e6b30fd8ccc954a683f97e132f9e3fcbcc`) differs from row 1 by exactly these objects. | `supabase/rollbacks/20260957_queue_waiting_line.rollback.sql`<br>sha256 `51215ca120316635c5b340b55a49bbba12476f7d02ed96c7056881dbe88d7722`<br>Only safe before the stage 2 app ships. |
| 3 | 2026-09-11 01:10 | **Tests only. No database change** (single `DO` block that ends by raising an error, so Postgres rolls everything back). 1) Owner closes a queue with 2 customers waiting, stage 1 live: the existing cascade `trg_expire_on_queue_close` → token update → `trg_queue_line_changed` → `queue_settings` works. 2) Stage 3 dry-run on an open queue. `lock_timeout = 2s` bounded any table lock. | `supabase/pending/queue_tokens_stage3_lockdown.sql` (test copy, inline) | MCP `execute_sql`, forced rollback | 1) 2 tokens expired (`SHOP_CLOSED`), 2 "Queue closed" notifications, line change announced, no error. 2) Customer sees own token only (1) and is first in line; owner sees 2; stranger 0; guest gets 2 line positions via the function but has no table access. Afterwards: 0 test tokens, 0 notifications, 0 queued push requests (`net.http_request_queue`), 0 bumped rows, old policy intact, stage 3 absent. Pushes go through pg_net, which sends committed rows only, so no real push could leave. | n/a |
| 4 | 2026-09-11 10:16 | **Data restore point. No database change.** All 90 public tables read in one statement (consistent snapshot); written outside every git repo because it contains personal data. | `D:\STRYT-db-backups\2026-09-11_1016Z\` (not in git)<br>`manifest.json` sha256 `e47a120a92ac171177b698bc31ea60749b5fc497c41d9d2be51896ec751a0a48` | `scripts/export-live-data.mjs --verify` (read-only; drill uses temp tables in forced rollbacks) | 1,283 rows, 57 non-empty tables. Restore drill: 90/90 tables restored into temp copies with checksums identical to the export. Afterwards: 0 new notifications, 0 queued push requests, 0 leftover temp tables. | Restore procedure in the backup's `README.txt` (via scratch tables only). |
