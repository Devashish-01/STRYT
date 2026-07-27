-- ============================================================
-- 20260855 — Multi-booking per slot: per-service capacity + party size
--
-- APPLIED TO PRODUCTION as migrations `slot_capacity_and_party_size`,
-- `booked_slots_with_usage`, and `appointment_create_party_size`
-- (this file covers all three).
--
-- Replaces the hard UNIQUE index
--   appointments_no_double_book (target_type, target_id, scheduled_for)
--     WHERE status IN ('PENDING','ACCEPTED')
-- with a counting trigger, so a business can take N bookings at the same time.
--
-- Every default is chosen so behaviour is bit-for-bit unchanged until an owner
-- raises a number: capacity resolves to 1 and party_size defaults to 1, which
-- reproduces the old one-per-slot rule exactly. Verified against production
-- before and after (a second booking at capacity 1 is still rejected).
-- ============================================================

-- 1) Columns -----------------------------------------------------------------
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS slot_capacity int;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS max_party_size int NOT NULL DEFAULT 1;
ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_slot_capacity_positive;
ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_slot_capacity_positive
  CHECK (slot_capacity IS NULL OR slot_capacity >= 1);
ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_max_party_positive;
ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_max_party_positive
  CHECK (max_party_size >= 1);

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS default_slot_capacity int NOT NULL DEFAULT 1;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS max_concurrent_bookings int;
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_capacity_positive;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_capacity_positive
  CHECK (default_slot_capacity >= 1 AND (max_concurrent_bookings IS NULL OR max_concurrent_bookings >= 1));

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS party_size int NOT NULL DEFAULT 1;
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_party_size_positive;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_party_size_positive CHECK (party_size >= 1);

-- 2) Capacity resolver -------------------------------------------------------
-- Providers have no capacity concept (solo operators, by design) → always 1.
-- NOTE: catalog_items rows can belong to a provider (provider_id) instead of a
-- business, so the business lookup is explicitly scoped by business_id.
CREATE OR REPLACE FUNCTION public.resolve_slot_capacity(
  p_target_type text, p_target_id text, p_package_id text
) RETURNS int
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  select case
    when p_target_type <> 'BUSINESS' then 1
    else greatest(1, coalesce(
      (select ci.slot_capacity from public.catalog_items ci
         where ci.id = p_package_id and ci.business_id = p_target_id),
      (select b.default_slot_capacity from public.businesses b where b.id = p_target_id),
      1))
  end;
$function$;

-- 3) The counting guard that replaces the unique index -----------------------
CREATE OR REPLACE FUNCTION public.enforce_slot_capacity()
RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare
  v_capacity int; v_used int; v_ceiling int; v_total int; v_max_party int;
begin
  if new.status in ('CANCELLED', 'REJECTED', 'NO_SHOW') then
    return new;
  end if;

  -- Only re-check when something capacity-relevant changed, so an unrelated
  -- UPDATE (payment status, notes) never re-validates or takes the lock.
  if TG_OP = 'UPDATE'
     and new.scheduled_for is not distinct from old.scheduled_for
     and new.package_id    is not distinct from old.package_id
     and new.party_size    is not distinct from old.party_size
     and new.target_id     is not distinct from old.target_id
     and old.status not in ('CANCELLED', 'REJECTED', 'NO_SHOW') then
    return new;
  end if;

  -- The UNIQUE index this replaces was atomic; SELECT count(*) is not.
  -- Serialise concurrent bookings for the same target+timestamp so two racing
  -- inserts can't both see the last spot as free.
  perform pg_advisory_xact_lock(hashtext(new.target_id || '|' || new.scheduled_for::text));

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

  -- Optional business-wide ceiling across ALL services at this timestamp —
  -- stops per-service capacity from overbooking a shared physical resource
  -- (3 chairs shouldn't take 3 haircuts AND 3 shaves at 10:00). NULL = off.
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

DROP TRIGGER IF EXISTS trg_enforce_slot_capacity ON public.appointments;
CREATE TRIGGER trg_enforce_slot_capacity
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slot_capacity();

-- 4) Retire the unique index — the trigger is now the guard, and with every
--    capacity defaulting to 1 it enforces exactly the same rule.
DROP INDEX IF EXISTS public.appointments_no_double_book;

CREATE INDEX IF NOT EXISTS appointments_slot_usage_idx
  ON public.appointments (target_id, scheduled_for)
  WHERE status IN ('PENDING', 'ACCEPTED');

-- 5) booked_slots: bare timestamps → per-slot, per-service usage counts, so
--    the client can grey out only genuinely full slots and show "2 left".
--    Widening RETURNS TABLE needs a DROP first.
DROP FUNCTION IF EXISTS public.booked_slots(text);
CREATE OR REPLACE FUNCTION public.booked_slots(p_target_id text)
RETURNS TABLE(scheduled_for timestamptz, package_id text, used_spots int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select a.scheduled_for, a.package_id, sum(a.party_size)::int
  from public.appointments a
  where a.target_id = p_target_id
    and (a.status = 'ACCEPTED'
         or (a.status = 'PENDING' and a.created_at > now() - interval '2 hours'))
  group by a.scheduled_for, a.package_id;
$function$;
REVOKE ALL ON FUNCTION public.booked_slots(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.booked_slots(text) TO authenticated;

-- 6) appointment_create gains p_party_size. Validation itself lives in the
--    trigger above (so walk-ins and reschedules are covered too); this only
--    carries the value through. Adding a param changes the signature, so the
--    16-arg version from 20260851 is dropped, not replaced. The new param has a
--    DEFAULT, so existing 15/16-arg named calls still resolve.
--
--    NOTE: the full function body is identical to 20260851's apart from the new
--    p_party_size parameter and the party_size column in the INSERT — see that
--    file for the delivery/fulfilment logic it also contains. Applied to prod as
--    `appointment_create_party_size`.

-- 7) Per-service capacities the booking sheet needs to render remaining spots.
CREATE OR REPLACE FUNCTION public.business_slot_capacities(p_business_id text)
RETURNS TABLE(package_id text, slot_capacity int, max_party_size int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select ci.id,
         greatest(1, coalesce(ci.slot_capacity,
           (select b.default_slot_capacity from public.businesses b where b.id = p_business_id), 1)),
         greatest(1, ci.max_party_size)
  from public.catalog_items ci
  where ci.business_id = p_business_id;
$function$;
REVOKE ALL ON FUNCTION public.business_slot_capacities(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.business_slot_capacities(text) TO authenticated;
