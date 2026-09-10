-- Migration: 20260946_out_of_range_appointment_requests.sql
-- Goal: Support out-of-radius booking requests that do not block the calendar until exclusively accepted.
-- Author: STRYT Engineering

-- 1) Add is_out_of_range column to appointments table
alter table public.appointments add column if not exists is_out_of_range boolean default false;
create index if not exists idx_appointments_out_of_range on public.appointments(target_id, scheduled_for) where is_out_of_range = true;

-- 2) Update enforce_slot_capacity trigger function:
--    - When new.status = 'PENDING' and is_out_of_range = true: bypass capacity check so request enters queue without blocking.
--    - Used capacity (v_used) and overall ceiling (v_total) ignore out-of-range PENDING appointments.
--    - When updating from out-of-range PENDING to ACCEPTED, enforce full slot capacity and lock the slot exclusively.
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

  -- An out-of-range request in PENDING state does NOT block the calendar.
  -- It can be inserted without locking capacity. Capacity is only enforced
  -- when the business owner/provider accepts it (transition to ACCEPTED).
  if new.status = 'PENDING' and coalesce(new.is_out_of_range, false) = true then
    return new;
  end if;

  -- Only re-check when something capacity- or schedule-relevant changed, so an unrelated
  -- UPDATE (payment status, notes) never re-validates or takes the lock.
  -- IMPORTANT: If transitioning from an out-of-range PENDING request to ACCEPTED,
  -- capacity was NOT checked at insert, so we MUST run the check now!
  if TG_OP = 'UPDATE'
     and new.scheduled_for is not distinct from old.scheduled_for
     and new.time_label    is not distinct from old.time_label
     and new.date_label    is not distinct from old.date_label
     and new.package_id    is not distinct from old.package_id
     and new.party_size    is not distinct from old.party_size
     and new.target_id     is not distinct from old.target_id
     and old.status not in ('CANCELLED', 'REJECTED', 'NO_SHOW')
     and not (old.status = 'PENDING' and coalesce(old.is_out_of_range, false) = true and new.status = 'ACCEPTED') then
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

  -- 3) Check slot capacity usage (exclude out-of-range PENDING bookings)
  select coalesce(sum(a.party_size), 0) into v_used
    from public.appointments a
   where a.target_type = new.target_type
     and a.target_id = new.target_id
     and a.scheduled_for = new.scheduled_for
     and a.package_id is not distinct from new.package_id
     and (
       a.status = 'ACCEPTED'
       or (a.status = 'PENDING' and coalesce(a.is_out_of_range, false) = false)
     )
     and a.id is distinct from new.id;

  if v_used + new.party_size > v_capacity then
    raise exception 'SLOT_FULL';
  end if;

  -- 4) Check business-wide concurrent bookings ceiling (exclude out-of-range PENDING bookings)
  if new.target_type = 'BUSINESS' then
    select b.max_concurrent_bookings into v_ceiling
      from public.businesses b where b.id = new.target_id;
    if v_ceiling is not null then
      select coalesce(sum(a.party_size), 0) into v_total
        from public.appointments a
       where a.target_type = 'BUSINESS' and a.target_id = new.target_id
         and a.scheduled_for = new.scheduled_for
         and (
           a.status = 'ACCEPTED'
           or (a.status = 'PENDING' and coalesce(a.is_out_of_range, false) = false)
         )
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
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_slot_capacity();

-- 3) Update booked_slots RPC:
--    Exclude out-of-range PENDING bookings so client booking grid treats the slot as available.
CREATE OR REPLACE FUNCTION public.booked_slots(p_target_id text)
RETURNS TABLE(scheduled_for timestamptz, package_id text, used_spots int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select a.scheduled_for, a.package_id, sum(a.party_size)::int
  from public.appointments a
  where a.target_id = p_target_id
    and (
      a.status = 'ACCEPTED'
      or (
        a.status = 'PENDING'
        and a.created_at > now() - interval '2 hours'
        and coalesce(a.is_out_of_range, false) = false
      )
    )
  group by a.scheduled_for, a.package_id;
$function$;

REVOKE ALL ON FUNCTION public.booked_slots(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.booked_slots(text) TO authenticated;

-- 4) Update appointment_create RPC:
--    Instead of raising OUT_OF_SERVICE_AREA, flag as is_out_of_range = true.
CREATE OR REPLACE FUNCTION public.appointment_create(
  p_target_type text,
  p_target_id text,
  p_scheduled_for timestamp with time zone,
  p_date_label text,
  p_time_label text,
  p_notes text DEFAULT NULL::text,
  p_photo_url text DEFAULT NULL::text,
  p_package_id text DEFAULT NULL::text,
  p_package_name text DEFAULT NULL::text,
  p_package_price numeric DEFAULT NULL::numeric,
  p_items jsonb DEFAULT NULL::jsonb,
  p_fulfillment_type text DEFAULT 'IN_STORE'::text,
  p_delivery_address_line text DEFAULT NULL::text,
  p_delivery_lat double precision DEFAULT NULL::double precision,
  p_delivery_lng double precision DEFAULT NULL::double precision,
  p_requested_delivery_window text DEFAULT NULL::text,
  p_party_size integer DEFAULT 1,
  p_target_package_key text DEFAULT NULL::text
)
RETURNS appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_owner text; v_target_name text; v_target_avatar text;
  v_customer_name text; v_customer_avatar text;
  v_appointment public.appointments%rowtype;
  v_items jsonb := p_items;
  v_delivery_ok boolean;
  v_accepting boolean;
  v_target_lat double precision;
  v_target_lng double precision;
  v_own_radius double precision;
  v_cust_lat double precision;
  v_cust_lng double precision;
  v_distance_km double precision;
  v_is_out_of_range boolean := false;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;
  if p_fulfillment_type not in ('IN_STORE', 'DELIVERY') then raise exception 'INVALID_FULFILLMENT_TYPE'; end if;
  if p_fulfillment_type = 'DELIVERY' and (p_delivery_lat is null or p_delivery_lng is null) then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;
  if coalesce(p_party_size, 1) < 1 then raise exception 'INVALID_PARTY_SIZE'; end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name, b.cover_image, b.delivery_enabled, b.is_open_now,
           b.lat, b.lng, b.broadcast_radius
    into v_owner, v_target_name, v_target_avatar, v_delivery_ok, v_accepting,
         v_target_lat, v_target_lng, v_own_radius
    from public.businesses b where b.id = p_target_id;
  else
    select p.user_id, p.display_name, p.avatar, false, p.is_open_now,
           p.lat, p.lng, p.service_radius_km
    into v_owner, v_target_name, v_target_avatar, v_delivery_ok, v_accepting,
         v_target_lat, v_target_lng, v_own_radius
    from public.providers p where p.id = p_target_id;
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;

  if coalesce(v_accepting, true) = false then
    raise exception 'NOT_ACCEPTING_APPOINTMENTS';
  end if;

  if p_fulfillment_type = 'DELIVERY' and coalesce(v_delivery_ok, false) = false then
    raise exception 'DELIVERY_NOT_OFFERED';
  end if;

  if p_fulfillment_type = 'DELIVERY' then
    v_cust_lat := p_delivery_lat;
    v_cust_lng := p_delivery_lng;
  else
    select u.lat, u.lng into v_cust_lat, v_cust_lng from public.users u where u.id = v_uid;
  end if;

  if v_target_lat is not null and v_target_lng is not null and v_cust_lat is not null and v_cust_lng is not null then
    v_distance_km := ST_Distance(
      ST_SetSRID(ST_MakePoint(v_target_lng, v_target_lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(v_cust_lng, v_cust_lat), 4326)::geography
    ) / 1000.0;
    if v_distance_km > greatest(coalesce(nullif(v_own_radius, 0), 5), 0) then
      v_is_out_of_range := true;
    end if;
  end if;

  select coalesce(nullif(trim(u.name), ''), 'Customer'), u.avatar
  into v_customer_name, v_customer_avatar
  from public.users u where u.id = v_uid;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label, notes, photo_url,
    package_id, package_name, package_price, status,
    fulfillment_type, delivery_address_line, delivery_lat, delivery_lng,
    requested_delivery_window, party_size, target_package_key, is_out_of_range
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, v_customer_name, v_customer_avatar,
    p_scheduled_for, p_date_label, p_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    p_package_id, p_package_name, p_package_price, 'PENDING',
    p_fulfillment_type, nullif(trim(coalesce(p_delivery_address_line, '')), ''), p_delivery_lat, p_delivery_lng,
    nullif(trim(coalesce(p_requested_delivery_window, '')), ''), coalesce(p_party_size, 1),
    nullif(p_target_package_key, ''), v_is_out_of_range
  ) returning * into v_appointment;

  if (v_items is null or jsonb_array_length(v_items) = 0) and p_package_id is not null then
    v_items := jsonb_build_array(jsonb_build_object(
      'catalog_item_id', p_package_id,
      'item_name', coalesce(p_package_name, 'Item'),
      'unit_price', round(coalesce(p_package_price, 0) / greatest(coalesce(p_party_size, 1), 1), 2),
      'quantity', greatest(coalesce(p_party_size, 1), 1)
    ));
  end if;

  if v_items is not null and jsonb_array_length(v_items) > 0 then
    insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
    select v_appointment.id, x.catalog_item_id, coalesce(x.item_name, 'Item'), coalesce(x.unit_price, 0), x.quantity
    from jsonb_to_recordset(v_items) as x(catalog_item_id text, item_name text, unit_price numeric, quantity int)
    where coalesce(x.quantity, 0) > 0;

    perform public.reserve_catalog_items(v_items);
  end if;

  return v_appointment;
end
$function$;
