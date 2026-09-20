-- 20260992_tracking_tokens_not_world_readable
--
-- Security (P0): public.tracking_tokens was world-readable. Verified on production 2026-09-20:
--   * policy tt_read — FOR SELECT TO PUBLIC USING (true)
--   * anon and authenticated both held SELECT (plus INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER)
-- so anyone holding the publishable key could `select * from tracking_tokens`, harvest every unexpired
-- token id, and replay each one through get_tracking() — which returns the responder's live lat/lng,
-- name and avatar for the agreement branch. The token's entropy (gen_random_uuid) and its expires_at
-- window were doing no work, because the list of live tokens was itself public.
--
-- Where it came from: in the initial commit TrackingPage.tsx read the table directly
-- (`.from("tracking_tokens").select("*").eq("id", token)`), and tt_read was written to allow that for
-- signed-out visitors. The read later moved behind the get_tracking() RPC (TrackingPage.tsx:76,156) but
-- the permissive policy and the table grants were never withdrawn.
--
-- Nothing depends on direct table access. Checked against production 2026-09-20:
--   * only three functions reference the table — get_tracking, agreement_create_tracking_token,
--     appointment_create_tracking_token — and all three are SECURITY DEFINER owned by postgres, so they
--     read and write it as the definer and need no grants to anon/authenticated;
--   * no view or materialized view references it;
--   * no current app code touches the table (only generated rows in src/types/database.types.ts);
--   * the table holds 0 rows, so no token has ever been created by any path, old bundle or new — there
--     is no working flow to break, and nothing has actually leaked yet.
--
-- After this migration the only ways in are the three RPCs: get_tracking(text) stays granted to anon
-- (that is the point — a signed-out visitor opens a share link), and the two create_* RPCs stay granted
-- to authenticated only.
--
-- tt_insert goes too: it gated direct inserts by parties to the agreement, but the grant it depended on
-- is being revoked and every real insert already goes through agreement_create_tracking_token /
-- appointment_create_tracking_token. RLS stays enabled so the table is default-deny, not merely
-- ungranted.
--
-- Rollback: supabase/rollbacks/20260992_tracking_tokens_not_world_readable.rollback.sql

begin;

drop policy if exists tt_read   on public.tracking_tokens;
drop policy if exists tt_insert on public.tracking_tokens;

revoke all on table public.tracking_tokens from anon, authenticated;

-- Default-deny even if a grant is ever re-added by accident.
alter table public.tracking_tokens enable row level security;

commit;

-- Verify (expect: 0 policies, no anon/authenticated grants, RLS on):
--   select polname from pg_policy where polrelid = 'public.tracking_tokens'::regclass;
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'tracking_tokens'
--       and grantee in ('anon','authenticated');
--   select relrowsecurity from pg_class where oid = 'public.tracking_tokens'::regclass;
