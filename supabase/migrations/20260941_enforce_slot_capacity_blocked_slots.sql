-- Migration: 20260941_enforce_slot_capacity_blocked_slots.sql
-- Goal: Enforce blocked_slots server-side in appointments capacity trigger (SLOT_BLOCKING: S1).
-- Author: STRYT Engineering / Sprint 1

CREATE OR REPLACE FUNCTION public.enforce_slot_capacity()
RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare
  v_capacity int;
  v_used int;
  v_ceiling int;
  v_total int;
  v_max_party int;
  v_is_blocked boolean := false;
  v_appt_date text;
  v_appt_dow int;
begin
  if new.status in ('CANCELLED', 'REJECTED', 'NO_SHOW') then
    return new;
  end if;

  -- Only re-check when something capacity- or schedule-relevant changed, so an unrelated
  -- UPDATE (payment status, notes) never re-validates or takes the lock.
  if TG_OP = 'UPDATE'
     and new.scheduled_for is not distinct from old.scheduled_for
     and new.time_label    is not distinct from old.time_label
     and new.date_label    is not distinct from old.date_label
     and new.package_id    is not distinct from old.package_id
     and new.party_size    is not distinct from old.party_size
     and new.target_id     is not distinct from old.target_id
     and old.status not in ('CANCELLED', 'REJECTED', 'NO_SHOW') then
    return new;
  end if;

  -- Serialise concurrent bookings for the same target+timestamp so racing
  -- inserts cannot bypass blocked slots or capacity limits.
  perform pg_advisory_xact_lock(hashtext(new.target_id || '|' || new.scheduled_for::text));

  -- 1) Check blocked slots (SLOT_BLOCKING: S1)
  v_appt_date := coalesce(new.date_label, (new.scheduled_for at time zone 'Asia/Kolkata')::date::text);
  v_appt_dow  := extract(dow from (new.scheduled_for at time zone 'Asia/Kolkata'))::int;

  select exists (
    select 1 from public.blocked_slots bs
     where bs.target_type = new.target_type
       and bs.target_id = new.target_id
       and (
         -- Specific date block (whole day or matching time_label)
         (
           bs.recurring = false
           and bs.date::text = v_appt_date
           and (bs.time_label is null or bs.time_label = new.time_label)
         )
         or
         -- Recurring weekday block (whole day or matching time_label)
         (
           bs.recurring = true
           and bs.weekday = v_appt_dow
           and (bs.time_label is null or bs.time_label = new.time_label)
         )
       )
  ) into v_is_blocked;

  if v_is_blocked then
    raise exception 'SLOT_BLOCKED';
  end if;

  -- 2) Check party size & package capacity
  v_capacity := public.resolve_slot_capacity(new.target_type, new.target_id, new.package_id);

  if new.target_type = 'BUSINESS' and new.package_id is not null then
    select ci.max_party_size into v_max_party from public.catalog_items ci
     where ci.id = new.package_id and ci.business_id = new.target_id;
    if v_max_party is not null and new.party_size > v_max_party then
      raise exception 'PARTY_SIZE_TOO_LARGE';
    end if;
  end if;
  if new.party_size > v_capacity then
    raise exception 'PARTY_SIZE_TOO_LARGE';
  end if;

  -- 3) Check slot capacity usage
  select coalesce(sum(a.party_size), 0) into v_used
    from public.appointments a
   where a.target_type = new.target_type
     and a.target_id = new.target_id
     and a.scheduled_for = new.scheduled_for
     and a.package_id is not distinct from new.package_id
     and a.status in ('PENDING', 'ACCEPTED')
     and a.id is distinct from new.id;

  if v_used + new.party_size > v_capacity then
    raise exception 'SLOT_FULL';
  end if;

  -- 4) Check business-wide concurrent bookings ceiling
  if new.target_type = 'BUSINESS' then
    select b.max_concurrent_bookings into v_ceiling
      from public.businesses b where b.id = new.target_id;
    if v_ceiling is not null then
      select coalesce(sum(a.party_size), 0) into v_total
        from public.appointments a
       where a.target_type = 'BUSINESS' and a.target_id = new.target_id
         and a.scheduled_for = new.scheduled_for
         and a.status in ('PENDING', 'ACCEPTED')
         and a.id is distinct from new.id;
      if v_total + new.party_size > v_ceiling then
        raise exception 'SLOT_FULL_OVERALL';
      end if;
    end if;
  end if;

  return new;
end $function$;

-- Ensure trigger is active
DROP TRIGGER IF EXISTS trg_enforce_slot_capacity ON public.appointments;
CREATE TRIGGER trg_enforce_slot_capacity
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slot_capacity();
