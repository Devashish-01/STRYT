# Supabase — folder guide

- **`migrations/`** — the only place schema changes go. Dated, sequential
  `.sql` files (`20260701_*.sql` onward), each idempotent (`if not exists`,
  `create or replace`, etc.) so it's safe to re-run against a DB that's
  already ahead. Run manually in the Supabase SQL editor, in filename order.
- **`functions/`** — Supabase Edge Functions (Deno), one folder per function.
  Deployed separately via the Supabase CLI/dashboard — code living here
  doesn't mean it's live; check deployment status before assuming a function
  works (see `ISSUES.md`'s launch-readiness entries for how to verify this).
- **`legacy/`** — the project's original bootstrap SQL + one-time runner
  scripts, from before this repo settled on the `migrations/` pattern. Not
  guaranteed to match the live database anymore — historical record only,
  not a source of truth. See `legacy/README.md`.
- **`run_migration_trust_layer.mjs`** — a standalone runner for
  `migrations/20240901_trust_layer.sql` specifically (predates the "run
  everything by hand in the SQL editor" convention the rest of `migrations/`
  uses). Kept as-is; not part of a repeatable pipeline.

If you're ever unsure whether the live database matches what's in this
folder: it doesn't, fully — that's exactly the gap `REORGANIZATION_PLAN.md`
(repo root) Priority 1 exists to close via a generated `schema_current.sql`
dump. Until that exists, treat `migrations/` as authoritative for anything
dated 2026-07-01 onward, and verify anything older against the live project
directly (Supabase dashboard, or a read-only query) rather than assuming.
