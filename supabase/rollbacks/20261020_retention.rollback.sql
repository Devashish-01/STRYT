-- Rollback for 20261020_retention.sql. Stops the daily clean-up and the 180-day copy.
-- WARNING: dropping private.deleted_account_registrations destroys the registration details kept for
-- deleted accounts (IT Rules 2021 r.3(1)(h)). Export them first if any are still inside their 180 days.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-old-rows';
  end if;
end
$cron$;

drop function if exists public.purge_old_rows();
drop trigger if exists users_keep_registration_on_delete on public.users;
drop function if exists public.tg_keep_registration_on_delete();
drop table if exists private.deleted_account_registrations;
-- Schema `private` is NOT dropped: it existed before this migration (legacy private.admin_action_logs).

notify pgrst, 'reload schema';
