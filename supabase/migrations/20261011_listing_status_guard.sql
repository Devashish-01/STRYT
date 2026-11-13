-- ============================================================
-- 20261011 — Only an admin decides whether a listing is live (GAPS #38)
--
-- businesses.status / providers.status / categories.status decide what
-- discovery shows (it lists status = 'ACTIVE'). Signed-in users hold column
-- UPDATE on status and the owner RLS policies let an owner update their own
-- row, and nothing checked the value, so from the browser an owner could:
--   * publish a PENDING or REJECTED business with no review (-> ACTIVE),
--   * lift an admin suspension (SUSPENDED -> ACTIVE), undelete (DELETED -> …),
--   * create a business already ACTIVE, and any user could create an ACTIVE
--     category.
-- This adds one trigger, guard_listing_status, on the three tables. It only
-- polices direct client writes (current_user = authenticated / anon): admin
-- users, the service role and SECURITY DEFINER functions (delete_business,
-- cron jobs, moderation) are untouched.
--
-- What a non-admin may still do (= everything the app does today):
--   businesses  insert as PENDING or DRAFT; DRAFT|REJECTED -> PENDING
--               ("submit for review", AccountStatusBanner)
--   providers   insert as ACTIVE, PENDING or DRAFT (providers go live at once;
--               the verified badge is separate); DRAFT -> PENDING|ACTIVE
--   categories  insert as PENDING (proposeCategory relies on the default)
-- Everything else raises LISTING_STATUS_NOT_YOURS_TO_SET (42501).
-- Rollback: supabase/rollbacks/20261011_listing_status_guard.rollback.sql
-- Test:     supabase/tests/listing_status_guard.test.sql
-- ============================================================

create or replace function public.guard_listing_status()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_old text := case when tg_op = 'UPDATE' then old.status::text end;
  v_new text := new.status::text;
begin
  -- Admin RPCs, cron jobs and SECURITY DEFINER functions run as their owner, not as a client role.
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    if tg_table_name = 'providers' and coalesce(v_new, 'ACTIVE') in ('ACTIVE', 'PENDING', 'DRAFT') then return new; end if;
    if tg_table_name = 'businesses' and coalesce(v_new, 'PENDING') in ('PENDING', 'DRAFT') then return new; end if;
    if tg_table_name = 'categories' and coalesce(v_new, 'PENDING') = 'PENDING' then return new; end if;
    raise exception 'LISTING_STATUS_NOT_YOURS_TO_SET' using errcode = '42501',
      hint = format('A new %s cannot start as %s.', tg_table_name, v_new);
  end if;

  if v_new is not distinct from v_old then return new; end if;

  if tg_table_name = 'businesses' and v_old in ('DRAFT', 'REJECTED') and v_new = 'PENDING' then return new; end if;
  if tg_table_name = 'providers' and v_old = 'DRAFT' and v_new in ('PENDING', 'ACTIVE') then return new; end if;

  raise exception 'LISTING_STATUS_NOT_YOURS_TO_SET' using errcode = '42501',
    hint = format('%s -> %s on %s is an admin decision.', v_old, v_new, tg_table_name);
end
$function$;

revoke all on function public.guard_listing_status() from public, anon, authenticated;

drop trigger if exists trg_guard_listing_status on public.businesses;
create trigger trg_guard_listing_status
  before insert or update of status on public.businesses
  for each row execute function public.guard_listing_status();

drop trigger if exists trg_guard_listing_status on public.providers;
create trigger trg_guard_listing_status
  before insert or update of status on public.providers
  for each row execute function public.guard_listing_status();

drop trigger if exists trg_guard_listing_status on public.categories;
create trigger trg_guard_listing_status
  before insert or update of status on public.categories
  for each row execute function public.guard_listing_status();
