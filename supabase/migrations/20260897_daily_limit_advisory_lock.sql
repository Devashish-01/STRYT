-- ============================================================
-- 20260897 — Advisory lock on the daily appointment-limit guard
--
-- enforce_customer_daily_appointment_limit() (20260801_code_audit_guardrails.sql)
-- does a plain SELECT count(*) before its INSERT commits, with no lock — under
-- two truly concurrent transactions at READ COMMITTED, both could read
-- count=4 and both pass, landing a customer at 6 same-day appointments
-- instead of the intended 5-cap. enforce_slot_capacity()
-- (20260855_slot_capacity_and_party_size.sql) already solved this exact
-- class of race for slot capacity with pg_advisory_xact_lock — same fix here,
-- keyed on customer+day instead of target+timestamp.
--
-- Apply manually in the Supabase SQL editor / migration workflow, not
-- automatically — same convention as 20260801.
-- ============================================================

create or replace function public.enforce_customer_daily_appointment_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  if coalesce(new.is_walk_in, false) then
    return new;
  end if;

  if new.status in ('CANCELLED', 'REJECTED') then
    return new;
  end if;

  -- Serialise concurrent inserts/updates for the same customer+day so two
  -- racing bookings can't both count 4 and both pass.
  perform pg_advisory_xact_lock(hashtext(new.customer_user_id || '|' || date_trunc('day', new.scheduled_for)::text));

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
end $$;

-- Trigger already points at this function name/columns (20260801) — the
-- create or replace above is the entire fix, no DROP/CREATE TRIGGER needed.
