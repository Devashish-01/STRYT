-- Rollback for 20261000_auth_lockdown_hooks
--
-- FIRST disable both hooks in the dashboard (Authentication -> Hooks). If a hook points at a function that no longer
-- exists, GoTrue fails every request that triggers it (sign-ups / SMS), so dropping the functions first would break auth.

begin;

drop function if exists public.hook_before_user_created(jsonb);
drop function if exists public.hook_send_sms_blocked(jsonb);

notify pgrst, 'reload schema';

commit;
