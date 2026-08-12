-- ============================================================
-- aliases_available() leaked EXECUTE to anon — close it.
-- ============================================================
-- Discovered while verifying 20260889: querying role_routine_grants on this
-- database showed anon holding EXECUTE on aliases_available(text[]), even
-- though that migration explicitly revoked from PUBLIC and granted only to
-- authenticated. `revoke ... from public` does not remove a SEPARATE direct
-- grant to anon — and this project's public schema auto-grants EXECUTE to
-- anon/authenticated on function creation by default (the same class of gap
-- 20260817_close_anon_default_privilege_gap.sql was written to close; that
-- fix is evidently scoped to the role/session it ran under, not global, since
-- a brand-new function still picked up the default here).
--
-- Severity is low — the function returns only booleans, no worse than any
-- signup form's "username taken" check — but it doesn't match what 20260889
-- intended (authenticated-only), so close it explicitly rather than leaving a
-- grant nobody meant to give.
revoke execute on function public.aliases_available(text[]) from anon;
revoke execute on function public.aliases_available(text[]) from public;
grant execute on function public.aliases_available(text[]) to authenticated;
