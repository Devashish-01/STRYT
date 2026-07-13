-- ============================================================
-- Make EVERY notification deliver an OS-level push (web + native), regardless
-- of how the notification row was created. Run manually in Supabase SQL editor.
--
-- ── The bug ──────────────────────────────────────────────────────────────
-- Notifications reach the in-app notifications page but no push arrives on
-- web/native. Root cause: notifications are created two ways, and only ONE of
-- them ever asked for a push:
--   1. notificationService.send()/sendBulk() (TS) — inserts the row AND does a
--      fire-and-forget fetch() to the send-push edge function. Only a handful
--      of call sites (admin approve/reject, suspend, etc.).
--   2. Postgres triggers (notify_on_proposal, notify_on_agreement,
--      notify_on_request, community/story/queue/saved-search/location/
--      verification triggers across ~10 migrations) — these `insert into
--      public.notifications` directly and NEVER call send-push. This is where
--      the majority of notifications actually originate, so most notifications
--      produced zero push.
--
-- ── The fix ──────────────────────────────────────────────────────────────
-- Instead of teaching every trigger and every service call to also push, put
-- ONE trigger on the notifications table itself: after any row is inserted, by
-- anyone, call send-push. This is the single choke point every notification
-- already flows through, so it can't be bypassed. The TS service's own
-- redundant fetch() is being removed in the same change set so a
-- service-created notification isn't pushed twice.
--
-- Uses pg_net (async HTTP from Postgres) so the insert never blocks or fails
-- on a slow/erroring edge function.
--
-- ── One-time setup you MUST do (values can't be hardcoded in git) ─────────
-- Supabase's hosted `postgres` role can't run `ALTER DATABASE ... SET` (it
-- errors with "permission denied to set parameter"), so we store the two
-- values in Supabase Vault instead. Run these once in the SQL editor,
-- substituting your project values (Project Settings → API):
--
--   select vault.create_secret(
--     'https://YOUR_PROJECT_REF.functions.supabase.co', 'functions_url');
--   select vault.create_secret(
--     'YOUR_SERVICE_ROLE_KEY', 'service_role_key');
--
-- To update an existing secret later, use vault.update_secret(id, new_value).
-- The service role key stays server-side in the encrypted Vault — it never
-- ships to any client. It's what lets the trigger's call to send-push pass
-- Supabase's function gateway auth.
-- ============================================================

create extension if not exists pg_net;

create or replace function public.push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  -- Read the endpoint + auth from Vault. If either secret isn't set yet, do
  -- nothing (the in-app notification row is already written — we just skip the
  -- push rather than erroring the insert). Create the two vault secrets above
  -- to switch push on.
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'functions_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_url = '' or v_key is null or v_key = '' then
    return new;
  end if;

  perform net.http_post(
    url     := v_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey',        v_key
    ),
    body    := jsonb_build_object(
      'userId',   new.user_id,
      'title',    new.title,
      'body',     new.body,
      'deepLink', coalesce(new.deep_link, '/'),
      'type',     new.type
    )
  );

  return new;
exception
  -- A push failure must never roll back the notification insert.
  when others then
    return new;
end $$;

drop trigger if exists trg_push_on_notification on public.notifications;
create trigger trg_push_on_notification
  after insert on public.notifications
  for each row execute function public.push_on_notification_insert();
