-- 20261000_auth_lockdown_hooks
--
-- STRYT signs customers in with exactly two things: Google, and a phone OTP that FIREBASE sends and checks. Supabase must
-- therefore never send an SMS itself and never create an account from an email sign-up. The dashboard cannot express
-- either rule on its own:
--   * The Phone provider has to stay ENABLED — firebase-phone-auth mints the session with signInWithPassword({phone}),
--     and GoTrue refuses that when the provider is off ("phone_provider_disabled"). But an enabled Phone provider needs an
--     SMS provider configured, and with Twilio configured anyone holding the public key can POST /auth/v1/otp and make
--     Twilio text any number, bypassing every Firebase limit (verified live 2026-10-18).
--   * The Email provider has to stay ENABLED — the 7 staff accounts sign in to /admin/login with email + password, and
--     GoTrue refuses password grants when it is off ("email_provider_disabled"). But an enabled Email provider also
--     lets anyone POST /auth/v1/signup and receive an authenticated account (mailer_autoconfirm is on).
--
-- Two Postgres auth hooks close both holes while the providers stay on:
--   hook_send_sms_blocked        Send SMS hook          -> every Supabase-originated SMS is refused, so no SMS provider
--                                                          credentials are needed or used at all.
--   hook_before_user_created     Before User Created    -> refuses user creation whose provider is 'email'. Google
--                                                          ('google') and the phone bridge ('phone') are untouched, and
--                                                          existing email users (staff) can still sign in.
--
-- The migration only creates the functions. They do nothing until you enable them in the dashboard:
--   Authentication -> Hooks -> Send SMS            -> Postgres function -> public.hook_send_sms_blocked
--   Authentication -> Hooks -> Before User Created -> Postgres function -> public.hook_before_user_created
--
-- To add a NEW staff account later: create it from the dashboard (Authentication -> Users -> Add user) with the
-- "Before User Created" hook temporarily disabled, then re-enable it. (Existing staff are unaffected.)
--
-- Rollback: supabase/rollbacks/20261000_auth_lockdown_hooks.rollback.sql (disable both hooks in the dashboard first).

begin;

create or replace function public.hook_send_sms_blocked(event jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'SMS sign-in codes are sent by Firebase, not by this endpoint.'
    )
  );
$$;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
begin
  if coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', '') = 'email' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Email sign-up is not available. Sign in with Google or your phone number.'
      )
    );
  end if;
  return '{}'::jsonb;
end;
$$;

-- Hooks are invoked by GoTrue as supabase_auth_admin; nobody else may call them.
revoke all on function public.hook_send_sms_blocked(jsonb)     from public, anon, authenticated;
revoke all on function public.hook_before_user_created(jsonb)  from public, anon, authenticated;
grant execute on function public.hook_send_sms_blocked(jsonb)     to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb)  to supabase_auth_admin;

notify pgrst, 'reload schema';

commit;

-- Verify after enabling the hooks:
--   curl -X POST $URL/auth/v1/otp    -H "apikey: $PUBLISHABLE" -H 'content-type: application/json' -d '{"phone":"+919999999999"}'
--        -> 403 "SMS sign-in codes are sent by Firebase…"        (and nothing appears in the Twilio console)
--   curl -X POST $URL/auth/v1/signup -H "apikey: $PUBLISHABLE" -H 'content-type: application/json' -d '{"email":"x@example.com","password":"Aa1!aaaaaaaa"}'
--        -> 403 "Email sign-up is not available…"
--   Staff login at /admin/login still works; a phone login (firebase-phone-auth) still works; Google still works.
