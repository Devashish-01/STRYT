-- Restore guest browsing — RLS helper functions lost EXECUTE.
--
-- APPLIED TO PRODUCTION (2026-08-11). Verified as the `anon` role against the
-- live REST API afterwards:
--   is_admin()                 -> 200 false   (was: permission denied)
--   can_manage_business(text)  -> 200 false
--   neighborhood_today(...)    -> 200 + data
--   businesses/providers/categories, businesses_nearby, providers_nearby -> 200 + rows
--   cancel_expired_agreements  -> 401 permission denied  <- hardening INTACT
--
-- ── What broke ──────────────────────────────────────────────────────────────
-- A signed-out visitor got, on every read:
--
--   permission denied for function is_admin      (HTTP 401)
--
-- businesses and providers both failed, so guest browsing was dead app-wide.
-- Reproduced in a browser on the guest ("Look around first") path.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- 20260881 + 20260882 revoked EXECUTE from anon/PUBLIC on 26 SECURITY DEFINER
-- functions. That hardening is CORRECT and is preserved here — the advisor had
-- found definer functions reachable at /rest/v1/rpc/<name> with nothing but the
-- publishable key (cancel_expired_agreements, increment_stamp,
-- grant_team_member_access, ...). Nothing in this file re-opens those.
--
-- The flaw was scope. Both migrations traced callers in src/ but not
-- pg_policies.qual. When Postgres evaluates an RLS policy whose qual calls a
-- function the querying role cannot EXECUTE, it ABORTS THE WHOLE STATEMENT —
-- the permission is resolved at executor init (ExecInitExpr -> fmgr_info),
-- before any AND/OR short-circuit, so even an unreachable branch kills the
-- query.
--
-- Confirmed against the live catalog (pg_policies + pg_proc.proacl), because
-- the tracked files DISAGREE with production on all three points below:
--
--   * read_businesses / read_providers call `is_admin()` (the no-arg overload)
--     DIRECTLY in their qual, and both apply to {public}. The repo's copies
--     instead show an inline `exists (select 1 from users ...)` subquery. Live
--     wins — this direct call is the actual cause of the outage.
--   * The society_members policies are live as `mem_read` / `mem_update`, NOT
--     the `read_society_members` / `update_society_members` names in
--     20260713. Dropping by the tracked name would no-op and leave the real
--     policies untouched.
--   * `is_admin()` (no-arg) exists in production but is defined in NO tracked
--     migration. It is untracked drift; this file therefore only grants on it
--     and deliberately does not attempt to redefine it.
--
-- proacl for all seven helpers was {postgres, authenticated, service_role} —
-- no anon entry and no bare `=X` PUBLIC entry, confirming both revokes fully
-- landed.
--
-- Third occurrence of this bug: 20260842 and 20260870 both fixed "permission
-- denied for function ..." from an RLS helper losing EXECUTE, and 20260854
-- documented can_manage_business as a deliberate carve-out for exactly this
-- reason — then 20260881 revoked it anyway. scripts/check-policy-grants.mjs,
-- added alongside this migration, makes a fourth time fail CI.
--
-- ── The fix: grant only what anon must evaluate, scope the rest ─────────────
-- Two remedies, chosen per policy rather than one blanket re-grant.


-- ── 1. Grant the two predicates anon genuinely has to evaluate ──────────────
-- Both are read-only booleans that resolve to FALSE for an anonymous caller,
-- so re-exposing them at /rpc/ leaks nothing and mutates nothing.
--
--   is_admin()            — no argument at all, so there is nothing to probe
--                           with; it tests auth.uid(), which is null for anon.
--                           Required by read_businesses, read_providers and the
--                           three profile_deletion_requests policies.
--   can_manage_business() — asks whether the CURRENT user manages a business;
--                           false for anon. Required by 12 policies including
--                           the {public} SELECTs on queue_tokens and
--                           appointments.
--
-- Guarded: is_admin() proves untracked functions exist here, so a drifted
-- signature must not abort the migration.
do $$ begin
  grant execute on function public.is_admin() to anon, authenticated;
exception when undefined_function then null; end $$;

do $$ begin
  grant execute on function public.can_manage_business(text) to anon, authenticated;
exception when undefined_function then null; end $$;

-- Called without a session on the guest home rail and public profile fetch
-- (src/features/neighborhood-today/useNeighborhoodToday.ts:23,
--  src/services/core/userService.ts:259). Neither is a mutation. The live ACL
-- settled 20260817-vs-20260826: anon does NOT currently hold either.
do $$ begin
  grant execute on function public.neighborhood_today(double precision,double precision,integer) to anon, authenticated;
exception when undefined_function then null; end $$;

do $$ begin
  grant execute on function public.get_public_profile(text) to anon, authenticated;
exception when undefined_function then null; end $$;


-- ── 2. Scope the authenticated-only policies instead of granting ────────────
-- These four apply to {public} but are meaningless without a session — their
-- predicates all test auth.uid(). Postgres only initializes policies applicable
-- to the current role, so restricting them to `authenticated` stops anon from
-- ever resolving the function in their qual. That lets is_admin(text),
-- is_society_member and is_society_admin STAY REVOKED from anon — strictly
-- better than granting them back, and it is why they are absent from §1.
--
-- ALTER POLICY ... TO changes ONLY the role list. Deliberately not
-- drop/recreate: the live quals have drifted from the tracked files (see
-- header), so re-creating from the repo text would silently revert production
-- policy logic. Never rewrite a qual you have not read from pg_policies.
--
-- read_users additionally already begins `auth.role() = 'authenticated' AND`,
-- so for it this is a pure no-op on behaviour.
do $$ begin
  alter policy read_users on public.users to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  alter policy mem_read on public.society_members to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  alter policy mem_update on public.society_members to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  alter policy delete_society_members on public.society_members to authenticated;
exception when undefined_object then null; end $$;


-- ── Deliberately NOT re-granted ─────────────────────────────────────────────
-- The remaining ~19 revokes from 20260881/20260882 stay exactly as they are:
-- cancel_expired_agreements, close_expired_requests, increment_stamp,
-- grant_team_member_access, appointment_create_walk_in, reserve_catalog_item,
-- respond_location_share, my_business_access_scope, suggest_business_login,
-- set_admin_login_id, ... none is reachable from a policy qual and none is
-- called without a session.
--
-- Also NOT granted, on purpose:
--   is_admin(text)  — takes an arbitrary user id, so an anon caller could probe
--                     "is user X an admin". Only read_users needs it, and §2
--                     scopes that policy to authenticated instead.
--   is_society_member / is_society_admin — same reasoning via mem_read /
--                     mem_update / delete_society_members.
--
-- ── Verify after applying (prove it, don't assume — the 20260878 method) ────
--   begin;
--     set local role anon;
--     select count(*) from public.businesses;   -- rows, not an error
--     select count(*) from public.providers;
--     select count(*) from public.categories;
--     select count(*) from public.businesses_nearby(73.8567,18.5204,5,null,5,0,null);
--     select public.increment_stamp('x','y');   -- MUST still be denied
--   rollback;
--
-- A NOTICE about increment_stamp failing is the desired outcome of the last
-- line; if it succeeds, the hardening has been over-reverted — stop and revisit.
