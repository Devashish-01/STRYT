-- ============================================================
-- Migration 20260948: Delivery & Rider Fleet Notifications V2
--
-- Upgrades delivery notifications across Courier, Customer, and Business:
--  1) Fixes critical mislabeling bug: Switches assignment and
--     cancellation notifications from 'QUEUE_UPDATE' to 'DELIVERY'.
--  2) Fixes missing arrival trigger: Notifies customer when courier
--     reaches doorstep ('ARRIVED') with immediate OTP prompt.
--  3) Enriches structured metadata: deliveryId, batchId, handoffCode,
--     pickupAddress, dropoffAddress, stopCount, agentName, agentPhone,
--     statusPill, tone, and contextual actions (ACCEPT_DELIVERY,
--     DECLINE_DELIVERY, TRACK_DELIVERY, CALL_RIDER, REASSIGN_DELIVERY).
--  4) Properly stamps entity_type and entity_id for merchant/courier scoping.
-- ============================================================

-- ── 1) assign_delivery ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_delivery(p_appointment_id text, p_agent_user_id text)
 RETURNS public.appointment_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_biz text;
  v_row public.appointment_deliveries%rowtype;
  v_code text;
  v_apt record;
  v_biz_name text;
  v_biz_address text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select a.id, a.target_id, a.customer_name, a.delivery_address_line, a.package_name, a.package_price, a.customer_user_id
    into v_apt from public.appointments a
   where a.id = p_appointment_id and a.target_type = 'BUSINESS';
  if v_apt.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  v_biz := v_apt.target_id;
  if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if not public.has_business_access(v_biz, p_agent_user_id) then raise exception 'AGENT_NOT_TEAM_MEMBER'; end if;

  select b.name, b.address_line1 into v_biz_name, v_biz_address from public.businesses b where b.id = v_biz;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  select * into v_row from public.appointment_deliveries
    where appointment_id = p_appointment_id and status in ('ASSIGNED','EN_ROUTE','ARRIVED') for update;
  if found then
    update public.appointment_deliveries
       set agent_user_id = p_agent_user_id,
           status = 'ASSIGNED',
           handoff_verified = false,
           handoff_code = v_code,
           batch_id = null,
           stop_order = null
     where id = v_row.id returning * into v_row;
  else
    insert into public.appointment_deliveries (appointment_id, business_id, agent_user_id, status, handoff_code)
    values (p_appointment_id, v_biz, p_agent_user_id, 'ASSIGNED', v_code) returning * into v_row;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
    values (
      p_agent_user_id,
      'DELIVERY',
      'New delivery assigned',
      coalesce(v_biz_name, 'The business') || ' assigned you a delivery for ' || coalesce(v_apt.customer_name, 'a customer') || '.',
      '/delivery',
      jsonb_build_object(
        'deliveryId', v_row.id,
        'appointmentId', p_appointment_id,
        'pickupAddress', coalesce(v_biz_address, v_biz_name),
        'dropoffAddress', v_apt.delivery_address_line,
        'customerName', v_apt.customer_name,
        'amount', v_apt.package_price,
        'serviceName', v_apt.package_name,
        'statusPill', 'Assigned',
        'tone', 'brand',
        'actions', jsonb_build_array('ACCEPT_DELIVERY', 'DECLINE_DELIVERY')
      ),
      'PROVIDER',
      p_agent_user_id
    );
  exception when others then null; end;

  return v_row;
end $function$;

REVOKE ALL ON FUNCTION public.assign_delivery(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assign_delivery(text, text) TO authenticated;

-- ── 2) assign_delivery_batch ────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_delivery_batch(p_appointment_ids text[], p_agent_user_id text)
 RETURNS public.delivery_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_biz text;
  v_count int;
  v_batch public.delivery_batches%rowtype;
  v_apt_id text;
  v_biz_name text;
  v_biz_address text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_appointment_ids is null or array_length(p_appointment_ids, 1) is null then
    raise exception 'NO_APPOINTMENTS_SELECTED';
  end if;

  select a.target_id into v_biz from public.appointments a
    where a.id = p_appointment_ids[1] and a.target_type = 'BUSINESS';
  if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if not public.has_business_access(v_biz, p_agent_user_id) then raise exception 'AGENT_NOT_TEAM_MEMBER'; end if;

  select count(*) into v_count
    from public.appointments a
    where a.id = any(p_appointment_ids)
      and a.target_type = 'BUSINESS' and a.target_id = v_biz
      and a.fulfillment_type = 'DELIVERY' and a.status = 'ACCEPTED'
      and not exists (
        select 1 from public.appointment_deliveries d
        where d.appointment_id = a.id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
      );
  if v_count <> array_length(p_appointment_ids, 1) then
    raise exception 'SOME_APPOINTMENTS_NOT_ELIGIBLE';
  end if;

  select b.name, b.address_line1 into v_biz_name, v_biz_address from public.businesses b where b.id = v_biz;

  insert into public.delivery_batches (business_id, agent_user_id)
    values (v_biz, p_agent_user_id) returning * into v_batch;

  foreach v_apt_id in array p_appointment_ids loop
    insert into public.appointment_deliveries (appointment_id, business_id, agent_user_id, status, handoff_code, batch_id)
    values (v_apt_id, v_biz, p_agent_user_id, 'ASSIGNED',
            lpad((floor(random() * 1000000))::int::text, 6, '0'), v_batch.id);
  end loop;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
    values (
      p_agent_user_id,
      'DELIVERY',
      'New delivery run',
      'You have ' || array_length(p_appointment_ids, 1) || ' deliveries to accept from ' || coalesce(v_biz_name, 'the store') || '.',
      '/delivery',
      jsonb_build_object(
        'batchId', v_batch.id,
        'stopCount', array_length(p_appointment_ids, 1),
        'pickupAddress', coalesce(v_biz_address, v_biz_name),
        'statusPill', 'Run Assigned',
        'tone', 'brand',
        'actions', jsonb_build_array('ACCEPT_DELIVERY', 'DECLINE_DELIVERY')
      ),
      'PROVIDER',
      p_agent_user_id
    );
  exception when others then null; end;

  return v_batch;
end $function$;

REVOKE ALL ON FUNCTION public.assign_delivery_batch(text[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assign_delivery_batch(text[], text) TO authenticated;

-- ── 3) decline_delivery_batch ───────────────────────────────
CREATE OR REPLACE FUNCTION public.decline_delivery_batch(p_batch_id text)
 RETURNS public.delivery_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_batch public.delivery_batches%rowtype;
  v_count int;
  v_owner_uid text;
  v_biz_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_batch from public.delivery_batches where id = p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if v_uid is distinct from v_batch.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_batch.status <> 'PENDING_ACCEPTANCE' then raise exception 'INVALID_BATCH_STATE'; end if;

  select count(*) into v_count from public.appointment_deliveries where batch_id = p_batch_id;
  delete from public.appointment_deliveries where batch_id = p_batch_id;

  update public.delivery_batches set status = 'DECLINED'
    where id = p_batch_id returning * into v_batch;

  select b.owner_user_id, b.name into v_owner_uid, v_biz_name from public.businesses b where b.id = v_batch.business_id;

  begin
    if v_owner_uid is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        v_owner_uid,
        'DELIVERY',
        'Delivery run declined',
        'Your courier declined ' || v_count || ' ' || (case when v_count = 1 then 'delivery' else 'deliveries' end) || ' — please reassign.',
        '/business/' || v_batch.business_id || '/manage/deliveries',
        jsonb_build_object(
          'batchId', p_batch_id,
          'stopCount', v_count,
          'statusPill', 'Declined',
          'tone', 'danger',
          'actions', jsonb_build_array('REASSIGN_DELIVERY')
        ),
        'BUSINESS',
        v_batch.business_id
      );
    end if;
  exception when others then null; end;

  return v_batch;
end $function$;

REVOKE ALL ON FUNCTION public.decline_delivery_batch(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.decline_delivery_batch(text) TO authenticated;

-- ── 4) cancel_delivery ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_delivery(
  p_delivery_id text,
  p_reason      text,
  p_note        text default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid        text := auth.uid()::text;
  v_row        public.appointment_deliveries%rowtype;
  v_is_agent   boolean;
  v_is_manager boolean;
  v_actor      text;
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_remaining  int;
  v_biz_name   text;
  v_owner_uid  text;
  v_customer   text;
  v_agent_uid  text;
  v_agent_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  if p_reason is null or p_reason not in (
    'CUSTOMER_UNAVAILABLE','ADDRESS_PROBLEM','CUSTOMER_REFUSED',
    'UNSAFE','AGENT_EMERGENCY','OTHER'
  ) then
    raise exception 'INVALID_REASON';
  end if;

  if p_reason = 'OTHER' and v_note is null then
    raise exception 'Add a short note so the business knows what happened.';
  end if;

  select * into v_row from public.appointment_deliveries
   where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;

  if v_row.status in ('DELIVERED','CANCELLED') then
    raise exception 'This delivery is already closed.';
  end if;

  v_is_agent   := v_uid is not distinct from v_row.agent_user_id;
  v_is_manager := public.has_business_scope(v_row.business_id, v_uid, 'appointments');
  if not (v_is_agent or v_is_manager) then raise exception 'NOT_ALLOWED'; end if;
  v_actor := case when v_is_agent then 'AGENT' else 'BUSINESS' end;

  v_agent_uid := v_row.agent_user_id;

  update public.appointment_deliveries
     set status        = 'CANCELLED',
         live_status   = null,
         cancelled_at  = now(),
         cancelled_by  = v_actor,
         cancel_reason = p_reason,
         cancel_note   = v_note
   where id = p_delivery_id;

  if v_row.batch_id is not null then
    select count(*) into v_remaining
      from public.appointment_deliveries
     where batch_id = v_row.batch_id
       and status in ('ASSIGNED','EN_ROUTE','ARRIVED');
    if v_remaining = 0 then
      update public.delivery_batches
         set status = 'COMPLETED', completed_at = now()
       where id = v_row.batch_id
         and status in ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS');
    end if;
  end if;

  select b.name, b.owner_user_id into v_biz_name, v_owner_uid
    from public.businesses b where b.id = v_row.business_id;
  select a.customer_user_id into v_customer
    from public.appointments a where a.id = v_row.appointment_id;
  if v_agent_uid is not null then
    select u.alias into v_agent_name from public.users u where u.id = v_agent_uid;
  end if;

  begin
    if v_actor = 'AGENT' then
      if v_owner_uid is not null then
        insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
        values (
          v_owner_uid,
          'DELIVERY',
          'Delivery couldn''t be completed',
          coalesce(v_agent_name, 'Your courier') || ' marked a delivery undeliverable (' || coalesce(p_reason, 'Issue reported') || ').',
          '/business/' || v_row.business_id || '/manage/deliveries',
          jsonb_build_object(
            'deliveryId', p_delivery_id,
            'appointmentId', v_row.appointment_id,
            'cancelReason', p_reason,
            'cancelNote', v_note,
            'agentName', v_agent_name,
            'statusPill', 'Reassign',
            'tone', 'warning',
            'actions', jsonb_build_array('REASSIGN_DELIVERY')
          ),
          'BUSINESS',
          v_row.business_id
        );
      end if;
    else
      if v_agent_uid is not null then
        insert into public.notifications (user_id, type, title, body, deep_link, metadata)
        values (
          v_agent_uid,
          'DELIVERY',
          'Delivery cancelled',
          coalesce(v_biz_name, 'The business') || ' cancelled a delivery on your run.',
          '/delivery',
          jsonb_build_object(
            'deliveryId', p_delivery_id,
            'appointmentId', v_row.appointment_id,
            'cancelReason', p_reason,
            'statusPill', 'Cancelled',
            'tone', 'danger'
          )
        );
      end if;
    end if;

    if v_customer is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        v_customer,
        'DELIVERY',
        'Delivery delayed',
        coalesce(v_biz_name, 'The business') || ' is arranging a new delivery for your order.',
        '/appointments',
        jsonb_build_object(
          'deliveryId', p_delivery_id,
          'appointmentId', v_row.appointment_id,
          'statusPill', 'Rescheduling',
          'tone', 'warning',
          'actions', jsonb_build_array('TRACK_DELIVERY')
        )
      );
    end if;
  exception when others then null; end;
end $function$;

REVOKE ALL ON FUNCTION public.cancel_delivery(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_delivery(text, text, text) TO authenticated;

-- ── 5) appointment_update_delivery_status ───────────────────
CREATE OR REPLACE FUNCTION public.appointment_update_delivery_status(
  p_delivery_id text, p_status text,
  p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
 RETURNS public.appointment_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_status not in ('LEAVING','ON_THE_WAY','ARRIVED','DONE') then raise exception 'INVALID_LIVE_STATUS'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_row.status in ('DELIVERED','CANCELLED') then raise exception 'INVALID_TRANSITION'; end if;
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

  select a.customer_user_id, a.target_id into v_customer, v_biz from public.appointments a where a.id = v_row.appointment_id;
  if v_biz is not null then
    select b.name into v_biz_name from public.businesses b where b.id = v_biz;
  end if;
  if v_row.agent_user_id is not null then
    select u.alias, u.phone, u.avatar into v_agent_name, v_agent_phone, v_agent_avatar from public.users u where u.id = v_row.agent_user_id;
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

  return v_row;
end $function$;

REVOKE ALL ON FUNCTION public.appointment_update_delivery_status(text, text, double precision, double precision) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.appointment_update_delivery_status(text, text, double precision, double precision) TO authenticated;
