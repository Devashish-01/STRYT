-- ============================================================
-- 20261020 — Data is kept only as long as the policies say (GAPS #54)
--
-- The Data Retention Policy (1.1, 2026-11-13) states maximum periods, and the
-- IT Rules 2021, rule 3(1)(h), require an intermediary to keep a user's
-- registration information for 180 days after the account is cancelled.
-- Before this migration nothing old was ever deleted, and an account's name /
-- phone / email were wiped on day 30 of deletion with no copy kept.
--
-- Changes:
--   1. private.deleted_account_registrations: name, alias, phone, email and
--      sign-up date of a deleted account, written by a trigger at the moment
--      the account is anonymised (customer_deleted_at set by
--      purge-deleted-accounts or admin-delete-profile), deleted after 180 days.
--      Schema `private` is not exposed through the API; no role but the owner
--      can read it (no grants, RLS on, no policies). It already exists in prod
--      (legacy private.admin_action_logs, unused) — "if not exists" keeps it.
--   2. purge_old_rows(), daily cron 'purge-old-rows' (03:17 UTC):
--        events, client_errors, business/provider_view_logs, notifications
--                                                   older than 12 months
--        support_tickets, bug_reports               older than 24 months
--        admin_actions                              older than 3 years
--        deleted_account_registrations              past delete_after (180 days)
-- Not in this migration: deals / appointments / queue tokens / payment records
-- "3 years after completion". The oldest such row is from 2026, so nothing is
-- due before mid-2029; tracked in GAPS #54.
-- Rollback: supabase/rollbacks/20261020_retention.rollback.sql
-- Test:     supabase/tests/retention.test.sql
-- ============================================================

-- ── 1. 180-day copy of registration details ────────────────────────────────
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.deleted_account_registrations (
  user_id       text primary key,
  name          text,
  alias         text,
  phone         text,
  email         text,
  registered_at timestamptz,
  deleted_at    timestamptz not null default now(),
  delete_after  timestamptz not null default now() + interval '180 days'
);
alter table private.deleted_account_registrations enable row level security;
revoke all on table private.deleted_account_registrations from public, anon, authenticated;
comment on table private.deleted_account_registrations is
  'IT Rules 2021 r.3(1)(h): registration info kept 180 days after an account is deleted, then purged by purge_old_rows(). Read only for a lawful request.';

create or replace function public.tg_keep_registration_on_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
begin
  if old.customer_deleted_at is null and new.customer_deleted_at is not null then
    insert into private.deleted_account_registrations
      (user_id, name, alias, phone, email, registered_at, deleted_at, delete_after)
    values
      (old.id, old.name, old.alias, nullif(old.phone, '0000000000'), old.email, old.created_at, now(), now() + interval '180 days')
    on conflict (user_id) do update
      set name = excluded.name, alias = excluded.alias, phone = excluded.phone, email = excluded.email,
          registered_at = excluded.registered_at, deleted_at = excluded.deleted_at, delete_after = excluded.delete_after;
  end if;
  return null;
end
$function$;
revoke all on function public.tg_keep_registration_on_delete() from public, anon, authenticated;

drop trigger if exists users_keep_registration_on_delete on public.users;
create trigger users_keep_registration_on_delete
  after update of customer_deleted_at on public.users
  for each row execute function public.tg_keep_registration_on_delete();

-- ── 2. The daily clean-up ──────────────────────────────────────────────────
create or replace function public.purge_old_rows()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_out jsonb := '{}'::jsonb;
  n int;
begin
  delete from public.events             where created_at < now() - interval '12 months'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('events', n);
  delete from public.client_errors      where created_at < now() - interval '12 months'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('client_errors', n);
  delete from public.business_view_logs where viewed_at  < now() - interval '12 months'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('business_view_logs', n);
  delete from public.provider_view_logs where viewed_at  < now() - interval '12 months'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('provider_view_logs', n);
  delete from public.notifications      where created_at < now() - interval '12 months'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('notifications', n);
  delete from public.support_tickets    where created_at < now() - interval '24 months'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('support_tickets', n);
  delete from public.bug_reports        where created_at < now() - interval '24 months'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('bug_reports', n);
  delete from public.admin_actions      where created_at < now() - interval '3 years';   get diagnostics n = row_count; v_out := v_out || jsonb_build_object('admin_actions', n);
  delete from private.deleted_account_registrations where delete_after < now();          get diagnostics n = row_count; v_out := v_out || jsonb_build_object('deleted_account_registrations', n);
  return v_out;
end
$function$;
revoke all on function public.purge_old_rows() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-old-rows';
    perform cron.schedule('purge-old-rows', '17 3 * * *', 'select public.purge_old_rows();');
  end if;
end
$cron$;

notify pgrst, 'reload schema';
