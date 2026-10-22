-- Rollback for 20261003_delivery_operations.sql
-- Restores the previous definition of every function it replaced (the 20261001/20261002 versions where those were the
-- latest, otherwise the live definitions read just before 20261003), drops everything it added, restores the original
-- delivery_batches policy and analytics whitelist, and removes the new columns.

do $$
begin
  perform cron.unschedule('nudge-pending-asap-orders');
  perform cron.unschedule('expire-stale-asap-orders');
exception when others then null;
end $$;

drop trigger if exists trg_unassign_deliveries_on_access_end on public.business_access_sessions;
drop function if exists public.tg_unassign_deliveries_on_access_end();
drop function if exists public.admin_delivery_overview();
drop function if exists public.mark_outstanding_paid(text);
drop function if exists public.business_cash_outstanding(text);
drop function if exists public.expire_stale_asap_orders();
drop function if exists public.nudge_pending_asap_orders();
drop function if exists public.customer_ready_for_redelivery(text);
drop function if exists public.delivery_mark_picked_up(text);

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

  -- One legal path: ASSIGNED -> EN_ROUTE -> ARRIVED -> DELIVERED. Nothing may be skipped (DLV-022).
  if p_status in ('LEAVING','ON_THE_WAY') and v_row.status not in ('ASSIGNED','EN_ROUTE') then
    raise exception 'INVALID_TRANSITION';
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

  -- The caller is the rider: never hand them the customer's handoff code (20260967).
  v_row.handoff_code := null;
  return v_row;
end $function$;

revoke all on function public.appointment_update_delivery_status(text, text, double precision, double precision) from public, anon;
grant execute on function public.appointment_update_delivery_status(text, text, double precision, double precision) to authenticated;

create or replace function public.update_delivery_position(p_delivery_id text, p_lat double precision, p_lng double precision, p_accuracy double precision default null::double precision, p_heading double precision default null::double precision)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_lat < -90  or p_lat > 90  then raise exception 'INVALID_LATITUDE';  end if;
  if p_lng < -180 or p_lng > 180 then raise exception 'INVALID_LONGITUDE'; end if;

  update public.appointment_deliveries
     set lat = p_lat, lng = p_lng
   where id = p_delivery_id
     and agent_user_id = v_uid
     and status in ('EN_ROUTE','ARRIVED');
end $function$;

revoke all on function public.update_delivery_position(text, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.update_delivery_position(text, double precision, double precision, double precision, double precision) to authenticated;

create or replace function public.update_delivery_batch_position(p_batch_id text, p_lat double precision, p_lng double precision, p_accuracy double precision default null::double precision, p_heading double precision default null::double precision)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_lat < -90 or p_lat > 90 then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng < -180 or p_lng > 180 then raise exception 'INVALID_LONGITUDE'; end if;
  update public.delivery_batches
     set lat = p_lat, lng = p_lng, accuracy = p_accuracy, heading = p_heading
   where id = p_batch_id and agent_user_id = v_uid and status in ('ACCEPTED','IN_PROGRESS');
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $function$;

revoke all on function public.update_delivery_batch_position(text, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.update_delivery_batch_position(text, double precision, double precision, double precision, double precision) to authenticated;

drop function if exists public.my_deliveries();

create or replace function public.my_deliveries()
returns table(
  id text, appointment_id text, business_id text, business_name text, customer_name text, customer_area text,
  delivery_address_line text, delivery_lat double precision, delivery_lng double precision,
  scheduled_for timestamp with time zone, date_label text, time_label text, status text, live_status text,
  handoff_code text, handoff_verified boolean, lat double precision, lng double precision, batch_id text,
  stop_order integer, batch_status text, batch_lat double precision, batch_lng double precision,
  created_at timestamp with time zone, delivered_at timestamp with time zone,
  amount_due numeric, delivery_fee integer, payment_method text, payment_status text, cash_collected_at timestamptz,
  customer_phone text, business_phone text, order_notes text, requested_window text, package_name text, items jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select d.id, d.appointment_id, d.business_id, b.name,
    case when d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
         then coalesce(a.customer_name, cu.name, 'Customer')
         else coalesce(cu.alias, 'Customer') end,
    cu.area, a.delivery_address_line, a.delivery_lat, a.delivery_lng,
    a.scheduled_for, a.date_label, a.time_label,
    d.status, d.live_status,
    null::text,
    d.handoff_verified, d.lat, d.lng,
    d.batch_id, d.stop_order, batch.status, batch.lat, batch.lng,
    d.created_at, d.delivered_at,
    -- Nothing to collect while the customer's own payment claim is awaiting the shop's confirmation.
    case when a.payment_status = 'PENDING_CONFIRM' then 0 else greatest(
      0,
      coalesce(a.package_price, 0) + coalesce(a.delivery_fee, 0)
        - case when a.payment_status = 'PAID' then coalesce(a.payment_amount, 0) else 0 end
    ) end,
    a.delivery_fee, a.payment_method, a.payment_status, a.cash_collected_at,
    -- The customer's number is only handed over once the rider is actually on the way to them.
    case when d.status in ('EN_ROUTE','ARRIVED') then cu.phone else null end,
    b.phone,
    a.notes,
    a.requested_delivery_window,
    a.package_name,
    (select jsonb_agg(jsonb_build_object('name', i.item_name, 'quantity', i.quantity) order by i.item_name)
       from public.appointment_items i where i.appointment_id = a.id)
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.businesses b on b.id = d.business_id
  left join public.users cu on cu.id = a.customer_user_id
  left join public.delivery_batches batch on batch.id = d.batch_id
  where d.agent_user_id = (auth.uid())::text
  order by
    case d.status when 'EN_ROUTE' then 0 when 'ARRIVED' then 1 when 'ASSIGNED' then 2 else 3 end,
    coalesce(d.stop_order, 999),
    coalesce(a.scheduled_for, d.created_at) desc;
$function$;

revoke all on function public.my_deliveries() from public, anon;
grant execute on function public.my_deliveries() to authenticated;

drop function if exists public.business_active_deliveries(text);

create or replace function public.business_active_deliveries(p_business_id text)
returns table(id text, appointment_id text, status text, live_status text, agent_user_id text, agent_name text, agent_avatar text, agent_phone text, customer_name text, delivery_address_line text, delivery_lat double precision, delivery_lng double precision, delivery_eta_text text, scheduled_for timestamp with time zone, date_label text, time_label text, batch_id text, stop_order integer, batch_status text, agent_lat double precision, agent_lng double precision, agent_heading double precision, handoff_verified boolean, created_at timestamp with time zone, delivered_at timestamp with time zone)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, v_uid, 'appointments') then
    raise exception 'NOT_ALLOWED';
  end if;

  return query
  select d.id, d.appointment_id,
    d.status, d.live_status,
    d.agent_user_id, coalesce(au.name, 'Delivery agent'), au.avatar, au.phone,
    coalesce(a.customer_name, 'Customer'), a.delivery_address_line,
    a.delivery_lat, a.delivery_lng,
    a.delivery_eta_text,
    a.scheduled_for, a.date_label, a.time_label,
    d.batch_id, d.stop_order, batch.status,
    coalesce(batch.lat, d.lat), coalesce(batch.lng, d.lng), batch.heading,
    d.handoff_verified,
    d.created_at, d.delivered_at
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.users au on au.id = d.agent_user_id
  left join public.delivery_batches batch on batch.id = d.batch_id
  where d.business_id = p_business_id
  order by
    case d.status when 'EN_ROUTE' then 0 when 'ARRIVED' then 1 when 'ASSIGNED' then 2 else 3 end,
    coalesce(d.stop_order, 999),
    d.created_at desc;
end $function$;

revoke all on function public.business_active_deliveries(text) from public, anon;
grant execute on function public.business_active_deliveries(text) to authenticated;

drop function if exists public.my_delivery_progress(text);

create or replace function public.my_delivery_progress(p_appointment_id text)
returns table(id text, status text, live_status text, handoff_code text, handoff_verified boolean, agent_name text, agent_phone text, agent_avatar text, agent_revealed boolean, eta_text text, stops_before integer, cancel_reason text, cancel_note text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  return query
  select d.id, d.status, d.live_status,
    d.handoff_code, d.handoff_verified,
    case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.name else null end,
    case when d.status in ('EN_ROUTE','ARRIVED') then u.phone else null end,
    case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.avatar else null end,
    (d.status in ('EN_ROUTE','ARRIVED','DELIVERED')),
    a.delivery_eta_text,
    (select count(*)::int from public.appointment_deliveries d2
       where d2.batch_id = d.batch_id and d.batch_id is not null
         and d2.stop_order is not null and d.stop_order is not null
         and d2.stop_order < d.stop_order
         and d2.status not in ('DELIVERED','CANCELLED')),
    d.cancel_reason,
    d.cancel_note
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.users u on u.id = d.agent_user_id
  where d.appointment_id = p_appointment_id
    and a.customer_user_id = v_uid
  order by d.created_at desc
  limit 1;
end $function$;

revoke all on function public.my_delivery_progress(text) from public, anon;
grant execute on function public.my_delivery_progress(text) to authenticated;

create or replace function public.get_tracking(p_token text)
returns table(agreement_id text, provider_lat double precision, provider_lng double precision, live_status text, provider_name text, provider_avatar text, stops_before integer, dest_lat double precision, dest_lng double precision)
language sql
security definer
set search_path to 'public'
as $function$
  -- Agreements: live tracking unchanged.
  select a.id, a.provider_lat, a.provider_lng, a.live_status, u.name, u.avatar, null::int,
         null::double precision, null::double precision
  from public.tracking_tokens t
  join public.agreements a on a.id = t.agreement_id
  left join public.users u on u.id = a.responder_user_id
  where t.id::text = p_token and t.expires_at > now() and t.agreement_id is not null
  union all
  -- Deliveries: progress only (coordinates always NULL).
  select d.appointment_id,
         null::double precision, null::double precision,
         case when d.status = 'DELIVERED' then 'DONE' else d.live_status end,
         case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.name else null end,
         case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.avatar else null end,
         (select count(*)::int from public.appointment_deliveries d2
            where d2.batch_id = d.batch_id and d.batch_id is not null
              and d2.stop_order is not null and d.stop_order is not null
              and d2.stop_order < d.stop_order
              and d2.status not in ('DELIVERED','CANCELLED')),
         null::double precision, null::double precision
  from public.tracking_tokens t
  join public.appointment_deliveries d
    on d.appointment_id = t.appointment_id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED','DELIVERED')
  left join public.users u on u.id = d.agent_user_id
  where t.id::text = p_token and t.expires_at > now() and t.appointment_id is not null;
$function$;

revoke all on function public.get_tracking(text) from public;
grant execute on function public.get_tracking(text) to anon, authenticated;

create or replace function public.cancel_delivery(p_delivery_id text, p_reason text, p_note text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

revoke all on function public.cancel_delivery(text, text, text) from public, anon;
grant execute on function public.cancel_delivery(text, text, text) to authenticated;

create or replace function public.decline_solo_delivery(p_delivery_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_owner text;
  v_biz_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;
  -- Only a not-yet-started single delivery. A run is declined as a run; a started delivery is "can't deliver".
  if v_row.batch_id is not null or v_row.status <> 'ASSIGNED' then raise exception 'INVALID_STATE'; end if;

  delete from public.handoff_attempts where delivery_id = p_delivery_id;
  -- The row goes (as for a declined run), so the order is back on the dispatch list and can be assigned again.
  delete from public.appointment_deliveries where id = p_delivery_id;

  select b.owner_user_id, b.name into v_owner, v_biz_name from public.businesses b where b.id = v_row.business_id;

  begin
    if v_owner is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        v_owner, 'DELIVERY', 'Delivery declined',
        'Your courier declined a delivery — please assign another rider.',
        '/business/' || v_row.business_id || '/manage/appointments?tab=deliveries',
        jsonb_build_object('appointmentId', v_row.appointment_id, 'statusPill', 'Declined', 'tone', 'danger',
                           'actions', jsonb_build_array('REASSIGN_DELIVERY')),
        'BUSINESS', v_row.business_id
      );
    end if;
  exception when others then null; end;

  return true;
end $function$;

revoke all on function public.decline_solo_delivery(text) from public, anon;
grant execute on function public.decline_solo_delivery(text) to authenticated;

create or replace function public.decline_delivery_batch(p_batch_id text)
returns delivery_batches
language plpgsql
security definer
set search_path to 'public'
as $function$
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

revoke all on function public.decline_delivery_batch(text) from public, anon;
grant execute on function public.decline_delivery_batch(text) to authenticated;

create or replace function public.accept_delivery_batch(p_batch_id text, p_stop_order text[] default null::text[])
returns delivery_batches
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_batch public.delivery_batches%rowtype;
  v_id text;
  v_i int := 0;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_batch from public.delivery_batches where id = p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if v_uid is distinct from v_batch.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_batch.status <> 'PENDING_ACCEPTANCE' then raise exception 'INVALID_BATCH_STATE'; end if;

  if p_stop_order is not null then
    foreach v_id in array p_stop_order loop
      v_i := v_i + 1;
      update public.appointment_deliveries set stop_order = v_i
        where id = v_id and batch_id = p_batch_id;
    end loop;
  end if;

  update public.delivery_batches set status = 'ACCEPTED', accepted_at = now()
    where id = p_batch_id returning * into v_batch;
  return v_batch;
end $function$;

revoke all on function public.accept_delivery_batch(text, text[]) from public, anon;
grant execute on function public.accept_delivery_batch(text, text[]) to authenticated;

create or replace function public.enforce_customer_daily_appointment_limit()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
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
end $function$;

revoke all on function public.enforce_customer_daily_appointment_limit() from public, anon, authenticated;

create or replace function public.business_delivery_stats(p_business_id text, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v_out jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, auth.uid()::text, 'appointments') then raise exception 'NOT_ALLOWED'; end if;

  select jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 365)),
    'delivered', count(*) filter (where d.status = 'DELIVERED'),
    'cancelled', count(*) filter (where d.status = 'CANCELLED'),
    'avg_minutes', (round(avg(extract(epoch from (d.delivered_at - d.created_at)) / 60.0)
                      filter (where d.status = 'DELIVERED' and d.delivered_at is not null)))::int,
    'fees_collected', coalesce(sum(a.delivery_fee) filter (where d.status = 'DELIVERED'), 0),
    'per_agent', coalesce((
      select jsonb_agg(jsonb_build_object('agent_user_id', x.agent_user_id, 'name', x.name, 'delivered', x.n) order by x.n desc)
        from (
          select d2.agent_user_id, coalesce(nullif(trim(u.name), ''), u.alias, 'Rider') as name, count(*) as n
            from public.appointment_deliveries d2
            left join public.users u on u.id = d2.agent_user_id
           where d2.business_id = p_business_id and d2.status = 'DELIVERED' and d2.created_at >= v_since
           group by d2.agent_user_id, u.name, u.alias
        ) x
    ), '[]'::jsonb)
  ) into v_out
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  where d.business_id = p_business_id and d.created_at >= v_since;

  return v_out;
end $function$;

revoke all on function public.business_delivery_stats(text, integer) from public, anon;
grant execute on function public.business_delivery_stats(text, integer) to authenticated;

drop policy if exists delivery_batches_select on public.delivery_batches;
create policy delivery_batches_select on public.delivery_batches for select using (
  agent_user_id = ((select auth.uid()))::text
  or public.has_business_scope(business_id, ((select auth.uid()))::text, 'delivery')
);

alter table public.events drop constraint if exists events_name_known;
alter table public.events add constraint events_name_known check (name in (
  'signup_completed', 'request_created', 'request_viewed', 'proposal_created', 'proposal_accepted',
  'booking_created', 'deal_completed', 'dispute_opened', 'review_left', 'share_link_opened',
  'otp_sent', 'otp_verified', 'otp_failed'
));

drop function if exists public.business_manager_ids(text);
drop function if exists public.person_first_name(text);

alter table public.appointment_deliveries
  drop column if exists heading,
  drop column if exists position_at,
  drop column if exists arrived_at,
  drop column if exists started_at,
  drop column if exists picked_up_at;
alter table public.delivery_batches drop column if exists position_at;
alter table public.appointments
  drop column if exists nudged_at,
  drop column if exists cash_outstanding_amount;

notify pgrst, 'reload schema';
