-- STRYT — close anon default-privilege gap on M-6's RPC set
--
-- Supabase's per-schema ALTER DEFAULT PRIVILEGES grants EXECUTE to anon,
-- authenticated, and service_role EXPLICITLY on every new function in
-- public — separate from (and in addition to) the implicit PUBLIC
-- pseudo-role grant. 20260816_go_live_hardening.sql only ran
-- `revoke execute ... from public`, which removed the redundant PUBLIC
-- entry but left anon's own explicit grant untouched, so every RPC in the
-- M-6 set remained callable by unauthenticated anon. Verified live via
-- pg_proc.proacl before writing this fix. The whole app is gated behind
-- ProtectedLayout (src/App.tsx) — there is no anonymous-browsing surface
-- that needs any of these — so anon is revoked outright everywhere.
revoke execute on function public.get_nearby_user_ids(double precision, double precision, double precision) from anon;
revoke execute on function public.get_public_profile(text) from anon;
revoke execute on function public.businesses_nearby(double precision, double precision, double precision, text, integer, integer) from anon;
revoke execute on function public.get_leaderboard() from anon;
revoke execute on function public.get_shared_location(text) from anon;
revoke execute on function public.admin_search_users(text) from anon;
revoke execute on function public.admin_recent_users() from anon;
revoke execute on function public.get_own_profile() from anon;
revoke execute on function public.get_own_coords() from anon;
revoke execute on function public.get_own_emergency_contact() from anon;
