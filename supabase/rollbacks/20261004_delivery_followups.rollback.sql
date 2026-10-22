-- Rollback for 20261004_delivery_followups.sql
-- Restores appointment_create (20261001 version) and appointment_update_delivery_status (20261003 version), drops what the
-- migration added. Any proof photos already recorded are discarded with their columns.

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
  p_target_package_key text default null::text,
  p_asap boolean default false
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
  v_delivery_radius double precision;
  v_fee_setting integer;
  v_free_above integer;
  v_min_order integer;
  v_prep integer;
  v_radius double precision;
  v_cust_lat double precision;
  v_cust_lng double precision;
  v_distance_km double precision;
  v_is_out_of_range boolean := false;
  v_subtotal numeric := 0;
  v_fee integer := 0;
  v_scheduled timestamptz := p_scheduled_for;
  v_date_label text := p_date_label;
  v_time_label text := p_time_label;
  v_asap boolean := coalesce(p_asap, false);
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if p_fulfillment_type not in ('IN_STORE', 'DELIVERY') then raise exception 'INVALID_FULFILLMENT_TYPE'; end if;
  if v_asap and p_fulfillment_type <> 'DELIVERY' then raise exception 'ASAP_REQUIRES_DELIVERY'; end if;
  if not v_asap and (p_scheduled_for is null or p_scheduled_for <= now()) then raise exception 'INVALID_APPOINTMENT_TIME'; end if;
  if p_fulfillment_type = 'DELIVERY' and (p_delivery_lat is null or p_delivery_lng is null) then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;
  if coalesce(p_party_size, 1) < 1 then raise exception 'INVALID_PARTY_SIZE'; end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name, b.cover_image, b.delivery_enabled, b.is_open_now,
           b.lat, b.lng, b.broadcast_radius,
           b.delivery_radius_km, b.delivery_fee, b.free_delivery_above, b.min_order_amount, b.delivery_prep_min
    into v_owner, v_target_name, v_target_avatar, v_delivery_ok, v_accepting,
         v_target_lat, v_target_lng, v_own_radius,
         v_delivery_radius, v_fee_setting, v_free_above, v_min_order, v_prep
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

  -- What the order is worth before delivery: the line items if there are any, otherwise the package price.
  if v_items is not null and jsonb_array_length(v_items) > 0 then
    select coalesce(sum(coalesce(x.unit_price, 0) * coalesce(x.quantity, 0)), 0) into v_subtotal
      from jsonb_to_recordset(v_items) as x(unit_price numeric, quantity int);
  else
    v_subtotal := coalesce(p_package_price, 0);
  end if;

  if p_fulfillment_type = 'DELIVERY' then
    if coalesce(v_min_order, 0) > 0 and v_subtotal < v_min_order then
      raise exception 'DELIVERY_MIN_ORDER';
    end if;
    v_fee := case
      when v_free_above is not null and v_subtotal >= v_free_above then 0
      else coalesce(v_fee_setting, 0)
    end;
  end if;

  -- ASAP: the shop's prep time from now, rounded up to the minute. Capacity is checked per exact timestamp, so ASAP
  -- orders placed in different minutes never collide; a whole-day block still applies.
  if v_asap then
    v_scheduled := date_trunc('minute', now() + make_interval(mins => coalesce(v_prep, 20) + 1));
    v_date_label := 'Today';
    v_time_label := 'ASAP';
  end if;

  if p_fulfillment_type = 'DELIVERY' then
    v_cust_lat := p_delivery_lat;
    v_cust_lng := p_delivery_lng;
    -- Delivery has its own radius; unset, it follows the shop's reach as before.
    v_radius := coalesce(nullif(v_delivery_radius, 0), nullif(v_own_radius, 0), 5);
  else
    select u.lat, u.lng into v_cust_lat, v_cust_lng from public.users u where u.id = v_uid;
    v_radius := coalesce(nullif(v_own_radius, 0), 5);
  end if;

  if v_target_lat is not null and v_target_lng is not null and v_cust_lat is not null and v_cust_lng is not null then
    v_distance_km := ST_Distance(
      ST_SetSRID(ST_MakePoint(v_target_lng, v_target_lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(v_cust_lng, v_cust_lat), 4326)::geography
    ) / 1000.0;
    if v_distance_km > v_radius then
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
    requested_delivery_window, party_size, target_package_key, is_out_of_range,
    delivery_fee, is_asap
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, v_customer_name, v_customer_avatar,
    v_scheduled, v_date_label, v_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    p_package_id, p_package_name, p_package_price, 'PENDING',
    p_fulfillment_type, nullif(trim(coalesce(p_delivery_address_line, '')), ''), p_delivery_lat, p_delivery_lng,
    nullif(trim(coalesce(p_requested_delivery_window, '')), ''), coalesce(p_party_size, 1),
    nullif(p_target_package_key, ''), v_is_out_of_range,
    v_fee, v_asap
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

revoke all on function public.appointment_create(
  text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb, text, text,
  double precision, double precision, text, integer, text, boolean
) from public, anon;
grant execute on function public.appointment_create(
  text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb, text, text,
  double precision, double precision, text, integer, text, boolean
) to authenticated;

create or replace function public.appointment_update_delivery_status(
  p_delivery_id text, p_status text, p_lat double precision default null::double precision, p_lng double precision default null::double precision
)
returns appointment_deliveries
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_old_status text;
  v_new text;
  v_batch public.delivery_batches%rowtype;
  v_customer text;
  v_biz text;
  v_biz_name text;
  v_agent_name text;
  v_agent_phone text;
  v_agent_avatar text;
  v_remaining int;
  v_a record;
  v_due numeric;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_status not in ('LEAVING','ON_THE_WAY','ARRIVED','DONE') then raise exception 'INVALID_LIVE_STATUS'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_row.status in ('DELIVERED','CANCELLED') then raise exception 'INVALID_TRANSITION'; end if;

  -- The order must still be live: a cancelled order is never completed (DLV-010).
  if not exists (select 1 from public.appointments a where a.id = v_row.appointment_id and a.status = 'ACCEPTED') then
    raise exception 'ORDER_NOT_ACTIVE';
  end if;

  -- One legal path: ASSIGNED -> EN_ROUTE -> ARRIVED -> DELIVERED (DLV-022).
  if p_status in ('LEAVING','ON_THE_WAY') and v_row.status not in ('ASSIGNED','EN_ROUTE') then
    raise exception 'INVALID_TRANSITION';
  end if;
  -- Nothing leaves the shop unconfirmed: the rider must have picked the order up first (DLV-018).
  if p_status in ('LEAVING','ON_THE_WAY') and v_row.status = 'ASSIGNED' and v_row.picked_up_at is null then
    raise exception 'NOT_PICKED_UP';
  end if;
  if p_status = 'ARRIVED' and v_row.status not in ('EN_ROUTE','ARRIVED') then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_status = 'DONE' and v_row.status <> 'ARRIVED' then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_status = 'DONE' and v_row.handoff_code is not null and not v_row.handoff_verified then
    raise exception 'HANDOFF_NOT_VERIFIED';
  end if;

  v_old_status := v_row.status;

  if v_row.batch_id is not null then
    select * into v_batch from public.delivery_batches where id = v_row.batch_id for update;
    if v_batch.status not in ('ACCEPTED','IN_PROGRESS') then
      raise exception 'BATCH_NOT_ACCEPTED';
    end if;
  end if;

  v_new := case when p_status in ('LEAVING','ON_THE_WAY') then 'EN_ROUTE'
                when p_status = 'ARRIVED' then 'ARRIVED'
                when p_status = 'DONE' then 'DELIVERED' end;

  update public.appointment_deliveries
     set live_status = p_status, status = v_new,
         lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
         position_at = case when p_lat is not null and p_lng is not null then now() else position_at end,
         started_at = case when v_new = 'EN_ROUTE' and started_at is null then now() else started_at end,
         arrived_at = case when v_new = 'ARRIVED' and arrived_at is null then now() else arrived_at end,
         delivered_at = case when p_status = 'DONE' then now() else delivered_at end
   where id = p_delivery_id returning * into v_row;

  if v_batch.id is not null then
    if v_batch.status = 'ACCEPTED' and v_new = 'EN_ROUTE' then
      update public.delivery_batches set status = 'IN_PROGRESS' where id = v_batch.id;
    end if;
    if v_new in ('DELIVERED','CANCELLED') then
      select count(*) into v_remaining from public.appointment_deliveries
        where batch_id = v_batch.id and status not in ('DELIVERED','CANCELLED');
      if v_remaining = 0 then
        update public.delivery_batches set status = 'COMPLETED', completed_at = now() where id = v_batch.id;
      end if;
    end if;
  end if;

  -- DLV-013: delivered with money still owed is recorded, so the shop can chase it instead of it silently staying unpaid.
  if v_new = 'DELIVERED' then
    select a.package_price, a.delivery_fee, a.payment_status, a.payment_amount into v_a
      from public.appointments a where a.id = v_row.appointment_id;
    if v_a.payment_status is distinct from 'PENDING_CONFIRM' then
      v_due := coalesce(v_a.package_price, 0) + coalesce(v_a.delivery_fee, 0)
               - case when v_a.payment_status = 'PAID' then coalesce(v_a.payment_amount, 0) else 0 end;
      if v_due > 0 then
        update public.appointments set cash_outstanding_amount = v_due where id = v_row.appointment_id;
      end if;
    end if;
  end if;

  select a.customer_user_id, a.target_id into v_customer, v_biz from public.appointments a where a.id = v_row.appointment_id;
  if v_biz is not null then
    select b.name into v_biz_name from public.businesses b where b.id = v_biz;
  end if;
  if v_row.agent_user_id is not null then
    v_agent_name := public.person_first_name(v_row.agent_user_id);
    select u.phone, u.avatar into v_agent_phone, v_agent_avatar from public.users u where u.id = v_row.agent_user_id;
  end if;

  if v_customer is not null then
    begin
      if v_new = 'EN_ROUTE' and v_old_status is distinct from 'EN_ROUTE' then
        insert into public.notifications (user_id, type, title, body, deep_link, metadata)
        values (
          v_customer,
          'DELIVERY',
          'Your order is out for delivery 🛵',
          coalesce(v_agent_name, 'Your courier') || ' is on the way with your order from ' || coalesce(v_biz_name, 'the store') || '.',
          '/appointments',
          jsonb_build_object(
            'deliveryId', p_delivery_id,
            'appointmentId', v_row.appointment_id,
            'handoffCode', v_row.handoff_code,
            'agentName', v_agent_name,
            'agentPhone', v_agent_phone,
            'avatarUrl', v_agent_avatar,
            'etaText', 'On the way',
            'statusPill', 'En Route',
            'tone', 'brand',
            'actions', case when v_agent_phone is not null then jsonb_build_array('TRACK_DELIVERY', 'CALL_RIDER') else jsonb_build_array('TRACK_DELIVERY') end
          )
        );
      elsif v_new = 'ARRIVED' and v_old_status is distinct from 'ARRIVED' then
        insert into public.notifications (user_id, type, title, body, deep_link, metadata)
        values (
          v_customer,
          'DELIVERY',
          'Courier has arrived! 🛵',
          'Your delivery agent is outside. Share OTP ' || coalesce(v_row.handoff_code, '') || ' to receive your order.',
          '/appointments',
          jsonb_build_object(
            'deliveryId', p_delivery_id,
            'appointmentId', v_row.appointment_id,
            'handoffCode', v_row.handoff_code,
            'agentName', v_agent_name,
            'agentPhone', v_agent_phone,
            'avatarUrl', v_agent_avatar,
            'statusPill', 'Arrived',
            'tone', 'success',
            'actions', case when v_agent_phone is not null then jsonb_build_array('TRACK_DELIVERY', 'CALL_RIDER') else jsonb_build_array('TRACK_DELIVERY') end
          )
        );
      elsif v_new = 'DELIVERED' and v_old_status is distinct from 'DELIVERED' then
        insert into public.notifications (user_id, type, title, body, deep_link, metadata)
        values (
          v_customer,
          'DELIVERY',
          'Order delivered! 🎉',
          'Your order from ' || coalesce(v_biz_name, 'the store') || ' was delivered successfully.',
          '/appointments',
          jsonb_build_object(
            'deliveryId', p_delivery_id,
            'appointmentId', v_row.appointment_id,
            'statusPill', 'Delivered',
            'tone', 'success'
          )
        );
      end if;
    exception when others then null; end;
  end if;

  -- The caller is the rider: never hand them the customer's handoff code (20260967).
  v_row.handoff_code := null;
  return v_row;
end $function$;

revoke all on function public.appointment_update_delivery_status(text, text, double precision, double precision) from public, anon;
grant execute on function public.appointment_update_delivery_status(text, text, double precision, double precision) to authenticated;


drop function if exists public.delivery_proof(text);
drop function if exists public.delivery_record_proof(text, text, text);
drop function if exists public.hours_open_at(text, timestamptz);
drop function if exists public.hours_range_hit(integer, integer, integer, boolean);
drop function if exists public.hours_minutes(text);

alter table public.appointment_deliveries
  drop column if exists proof_photo_url,
  drop column if exists proof_note,
  drop column if exists proof_at;
alter table public.businesses drop column if exists delivery_proof_allowed;

notify pgrst, 'reload schema';
