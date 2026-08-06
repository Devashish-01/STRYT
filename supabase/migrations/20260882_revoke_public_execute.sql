-- Finish what 20260881 started: revoke the PUBLIC grant too.
--
-- 20260881 revoked EXECUTE from `anon` on 26 SECURITY DEFINER functions and the
-- explicit `anon=X` ACL entries did disappear — but the advisor finding did not,
-- because the privilege never came from that entry. Postgres grants EXECUTE to
-- PUBLIC when a function is created, and Supabase's `anon` role inherits it:
--
--   proacl before: {=X/postgres, postgres=X/postgres, anon=X/postgres,
--                   authenticated=X/postgres, service_role=X/postgres}
--                   ^^^^^^^^^^^ empty grantee == PUBLIC
--
-- Removing `anon=X` while `=X` remains changes nothing —
-- has_function_privilege('anon', oid, 'EXECUTE') still returned true for all 26.
-- Revoking from PUBLIC is what actually closes it.
--
-- Safe because every one of these already carries an explicit
-- `authenticated=X/postgres` and `service_role=X/postgres` grant (verified
-- against the live catalog before applying), so the app's own calls are
-- unaffected. Only callers that relied on the implicit PUBLIC grant lose access
-- — which is precisely the anonymous PostgREST caller this is aimed at.
--
-- get_tracking(text) and resolve_admin_email(text) are deliberately untouched in
-- both migrations: the public /track/:token page and the pre-sign-in admin login
-- lookup genuinely run without a session. See 20260881 for the full reasoning.

revoke execute on function public.appointment_create_walk_in(text,text,text,text,timestamp with time zone,text,text,text,text,numeric,jsonb) from public;
revoke execute on function public.bump_business_metric(text,text) from public;
revoke execute on function public.bump_provider_views(text) from public;
revoke execute on function public.can_manage_business(text) from public;
revoke execute on function public.cancel_expired_agreements() from public;
revoke execute on function public.close_expired_requests() from public;
revoke execute on function public.close_stale_queue_tokens() from public;
revoke execute on function public.enforce_business_location_freeze() from public;
revoke execute on function public.get_public_profile(text) from public;
revoke execute on function public.grant_team_member_access(text,text,text[]) from public;
revoke execute on function public.increment_stamp(text,text) from public;
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin(text) from public;
revoke execute on function public.is_society_admin(uuid,text) from public;
revoke execute on function public.is_society_member(uuid,text) from public;
revoke execute on function public.my_business_access_scope(text) from public;
revoke execute on function public.neighborhood_today(double precision,double precision,integer) from public;
revoke execute on function public.notification_push_health() from public;
revoke execute on function public.renew_location_share(text) from public;
revoke execute on function public.request_location_share(text) from public;
revoke execute on function public.reserve_catalog_item(text) from public;
revoke execute on function public.respond_location_share(text,boolean) from public;
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.set_admin_login_id(text) from public;
revoke execute on function public.suggest_business_login(text) from public;
revoke execute on function public.sync_request_me_too() from public;

-- Verify:
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef
--     and has_function_privilege('anon', p.oid, 'EXECUTE');
-- Expect exactly: get_tracking, resolve_admin_email, st_estimatedextent.
