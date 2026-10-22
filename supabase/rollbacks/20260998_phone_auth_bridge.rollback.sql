-- Rollback for 20260998_phone_auth_bridge
--
-- Removes the phone-login lookup, rate limiter and lease. All additive; nothing else in the schema reads them.
--
-- Roll the edge function back FIRST (redeploy the previous firebase-phone-auth, or delete it) — the hardened
-- version calls these RPCs and returns 500 once they are gone. Rate-limit history is disposable.

begin;

drop function if exists public.release_phone_login(text);
drop function if exists public.try_lease_phone_login(text, integer);
drop table    if exists public.phone_login_lease;

drop function if exists public.bridge_rate_check(text, text, integer, interval);
drop table    if exists public.auth_bridge_attempts;

drop function if exists public.auth_user_id_by_phone(text);

notify pgrst, 'reload schema';

commit;
