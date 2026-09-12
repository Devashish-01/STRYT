-- Rollback for 20260897_daily_limit_advisory_lock.sql
-- Restores live enforce_customer_daily_appointment_limit definition from snapshot 2026-09-13_after_20260958.sql

CREATE OR REPLACE FUNCTION public.enforce_customer_daily_appointment_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
begin
  if coalesce(new.is_walk_in, false) then
    return new;
  end if;

  if new.status in ('CANCELLED', 'REJECTED') then
    return new;
  end if;

  select count(*)
    into v_count
    from public.appointments a
   where a.customer_user_id = new.customer_user_id
     and a.id is distinct from new.id
     and coalesce(a.is_walk_in, false) = false
     and a.status not in ('CANCELLED', 'REJECTED')
     and a.scheduled_for >= date_trunc('day', new.scheduled_for)
     and a.scheduled_for <  date_trunc('day', new.scheduled_for) + interval '1 day';

  if v_count >= 5 then
    raise exception 'You''ve reached the limit of 5 appointments for this day. Please pick another date.';
  end if;

  return new;
end $function$
;

revoke all on function public.enforce_customer_daily_appointment_limit() from public, anon, authenticated;
grant execute on function public.enforce_customer_daily_appointment_limit() to postgres, service_role;
