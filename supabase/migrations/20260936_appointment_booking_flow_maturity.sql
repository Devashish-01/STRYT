-- Migration 20260936: Appointment Booking Flow Maturity (Gaps B3 to B10)
--
-- 1. Gap B3: When synthesizing line items from package_id and party_size, set quantity = coalesce(p_party_size, 1)
--    and compute unit_price correctly instead of hardcoding quantity = 1.
-- 2. Gap B5: Restrict OUT_OF_SERVICE_AREA check to DELIVERY fulfillment only so in-store visits are not blocked.

create or replace function public.appointment_create(
  p_target_type text,
  p_target_id text,
  p_scheduled_for timestamp with time zone,
  p_date_label text,
  p_time_label text,
  p_notes text default null::text,
  p_photo_url text default null::text,
  p_package_id text default null::text,
  p_package_name text default null::text,
  p_package_price numeric default null::numeric,
  p_items jsonb default null::jsonb,
  p_fulfillment_type text default 'IN_STORE'::text,
  p_delivery_address_line text default null::text,
  p_delivery_lat double precision default null::double precision,
  p_delivery_lng double precision default null::double precision,
  p_requested_delivery_window text default null::text,
  p_party_size integer default 1,
  p_target_package_key text default null::text
)
returns appointments
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Gap B5: Distance check strictly enforces delivery radius for home deliveries.
  -- In-store visits do not block customers visiting from outside the broadcast radius.
  if p_fulfillment_type = 'DELIVERY' then
    v_cust_lat := p_delivery_lat;
    v_cust_lng := p_delivery_lng;

    if v_target_lat is not null and v_target_lng is not null and v_cust_lat is not null and v_cust_lng is not null then
      v_distance_km := ST_Distance(
        ST_SetSRID(ST_MakePoint(v_target_lng, v_target_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(v_cust_lng, v_cust_lat), 4326)::geography
      ) / 1000.0;
      if v_distance_km > greatest(coalesce(nullif(v_own_radius, 0), 5), 0) then
        raise exception 'OUT_OF_SERVICE_AREA';
      end if;
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
    requested_delivery_window, party_size, target_package_key
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, v_customer_name, v_customer_avatar,
    p_scheduled_for, p_date_label, p_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    p_package_id, p_package_name, p_package_price, 'PENDING',
    p_fulfillment_type, nullif(trim(coalesce(p_delivery_address_line, '')), ''), p_delivery_lat, p_delivery_lng,
    nullif(trim(coalesce(p_requested_delivery_window, '')), ''), coalesce(p_party_size, 1),
    nullif(p_target_package_key, '')
  ) returning * into v_appointment;

  -- Gap B3: If line items are synthesized from package selection, set quantity to party_size
  -- and calculate unit_price so total and inventory match the party size.
  if (v_items is null or jsonb_array_length(v_items) = 0) and p_package_id is not null then
    v_items := jsonb_build_array(jsonb_build_object(
      'catalog_item_id', p_package_id,
      'item_name', coalesce(p_package_name, 'Item'),
      'unit_price', case when coalesce(p_party_size, 1) > 1 and coalesce(p_package_price, 0) > 0
                         then round(coalesce(p_package_price, 0) / coalesce(p_party_size, 1), 2)
                         else coalesce(p_package_price, 0) end,
      'quantity', coalesce(p_party_size, 1)
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

revoke all on function public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb, text, text, double precision, double precision, text, integer, text) from public, anon;
grant execute on function public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb, text, text, double precision, double precision, text, integer, text) to authenticated;

-- Update appointment_create_walk_in with the same party_size quantity synthesis
create or replace function public.appointment_create_walk_in(
  p_target_type text, p_target_id text, p_customer_name text, p_customer_phone text,
  p_scheduled_for timestamptz, p_date_label text, p_time_label text,
  p_package_id text default null, p_package_name text default null,
  p_package_price numeric default null, p_items jsonb default null,
  p_party_size int default 1, p_target_package_key text default null
) returns public.appointments
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_target_avatar text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean := false;
  v_items jsonb := p_items;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if nullif(trim(coalesce(p_customer_name, '')), '') is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;
  if coalesce(p_party_size, 1) < 1 then raise exception 'INVALID_PARTY_SIZE'; end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name, b.cover_image
    into v_owner, v_target_name, v_target_avatar
    from public.businesses b where b.id = p_target_id;
    v_allowed := public.has_business_scope(p_target_id, v_uid, 'appointments');
  else
    select p.user_id, p.display_name, p.avatar
    into v_owner, v_target_name, v_target_avatar
    from public.providers p where p.id = p_target_id;
    v_allowed := v_owner = v_uid;
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, scheduled_for, date_label, time_label,
    notes, package_id, package_name, package_price, status, is_walk_in, party_size,
    target_package_key
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, left(trim(p_customer_name), 200), p_scheduled_for,
    p_date_label, p_time_label,
    case when nullif(trim(coalesce(p_customer_phone, '')), '') is null
      then 'Walk-in'
      else 'Walk-in • ' || left(trim(p_customer_phone), 30) end,
    p_package_id, p_package_name, p_package_price, 'ACCEPTED', true, coalesce(p_party_size, 1),
    nullif(p_target_package_key, '')
  ) returning * into v_appointment;

  if (v_items is null or jsonb_array_length(v_items) = 0) and p_package_id is not null then
    v_items := jsonb_build_array(jsonb_build_object(
      'catalog_item_id', p_package_id,
      'item_name', coalesce(p_package_name, 'Item'),
      'unit_price', case when coalesce(p_party_size, 1) > 1 and coalesce(p_package_price, 0) > 0
                         then round(coalesce(p_package_price, 0) / coalesce(p_party_size, 1), 2)
                         else coalesce(p_package_price, 0) end,
      'quantity', coalesce(p_party_size, 1)
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
end;
$function$;

revoke all on function public.appointment_create_walk_in(text, text, text, text, timestamptz, text, text, text, text, numeric, jsonb, int, text) from public, anon;
grant execute on function public.appointment_create_walk_in(text, text, text, text, timestamptz, text, text, text, text, numeric, jsonb, int, text) to authenticated;
