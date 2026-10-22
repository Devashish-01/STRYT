-- Rollback for 20261002_delivery_integrity.sql
-- Restores the previous definition of every function it replaced (the 20261001 versions of the cash functions and
-- my_deliveries, the earlier live versions of the rest), drops the trigger and decline_solo_delivery, and restores the
-- original constraints. Orders already cancelled stay cancelled; deliveries the trigger closed stay closed.

drop trigger if exists trg_cancel_delivery_on_order_cancel on public.appointments;
drop function if exists public.tg_cancel_delivery_on_order_cancel();
drop function if exists public.decline_solo_delivery(text);

create or replace function public.appointment_transition(p_id text, p_status text, p_response_note text default null::text)
returns appointments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_is_customer boolean;
  v_is_manager boolean;
  v_cancelled_by text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_is_customer := v_appointment.customer_user_id = v_uid and not v_appointment.is_walk_in;
  v_is_manager := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));

  if v_is_customer and p_status = 'CANCELLED'
     and v_appointment.status in ('PENDING', 'ACCEPTED') then
    v_cancelled_by := 'CUSTOMER';
  elsif v_is_manager and v_appointment.status = 'PENDING'
        and p_status in ('ACCEPTED', 'REJECTED') then
    v_cancelled_by := null;
  elsif v_is_manager and v_appointment.status = 'ACCEPTED'
        and p_status = 'CANCELLED' then
    v_cancelled_by := 'OWNER';
  elsif v_is_manager and v_appointment.status = 'COMPLETED'
        and p_status = 'NO_SHOW' then
    v_cancelled_by := null;
  else
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.appointments
  set status = p_status,
      response_note = case when p_response_note is null then response_note
        else nullif(left(trim(p_response_note), 1000), '') end,
      cancelled_by = case when p_status = 'CANCELLED' then v_cancelled_by else cancelled_by end
  where id = p_id and status = v_appointment.status
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$function$;

revoke all on function public.appointment_transition(text, text, text) from public, anon;
grant execute on function public.appointment_transition(text, text, text) to authenticated;

create or replace function public.reschedule_appointment(
  p_original_id text,
  p_scheduled_for timestamp with time zone,
  p_date_label text,
  p_time_label text,
  p_notes text default null::text,
  p_photo_url text default null::text,
  p_package_id text default null::text,
  p_package_name text default null::text,
  p_package_price numeric default null::numeric
)
returns appointments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_original public.appointments%rowtype;
  v_new public.appointments%rowtype;
  v_changed integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;

  select * into v_original from public.appointments
  where id = p_original_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  if v_original.customer_user_id is distinct from v_uid or v_original.is_walk_in then
    raise exception 'NOT_YOUR_BOOKING';
  end if;
  if v_original.status not in ('PENDING', 'ACCEPTED') then
    raise exception 'INVALID_TRANSITION';
  end if;

  -- Cancel the original first so its spots are freed before capacity check.
  update public.appointments
  set status = 'CANCELLED', cancelled_by = 'CUSTOMER',
      response_note = coalesce(response_note, 'Rescheduled')
  where id = p_original_id and status = v_original.status;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'INVALID_TRANSITION'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label, notes, photo_url,
    package_id, package_name, package_price,
    fulfillment_type, delivery_address_line, delivery_lat, delivery_lng,
    requested_delivery_window, party_size, rescheduled_from, target_package_key,
    payment_status, payment_method, payment_amount, payment_reference
  ) values (
    v_original.target_type, v_original.target_id, v_original.target_owner_user_id,
    v_original.target_name, v_original.target_avatar,
    v_uid, v_original.customer_name, v_original.customer_avatar,
    p_scheduled_for, p_date_label, p_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    coalesce(p_package_id, v_original.package_id),
    coalesce(p_package_name, v_original.package_name),
    coalesce(p_package_price, v_original.package_price),
    v_original.fulfillment_type, v_original.delivery_address_line,
    v_original.delivery_lat, v_original.delivery_lng,
    v_original.requested_delivery_window,
    coalesce(v_original.party_size, 1),
    p_original_id,
    v_original.target_package_key,
    v_original.payment_status,
    v_original.payment_method,
    v_original.payment_amount,
    v_original.payment_reference
  ) returning * into v_new;

  insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
  select v_new.id, catalog_item_id, item_name, unit_price, quantity
  from public.appointment_items
  where appointment_id = p_original_id;

  return v_new;
end
$function$;

revoke all on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) from public, anon;
grant execute on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) to authenticated;

create or replace function public.appointment_claim_payment(
  p_id text, p_method text, p_amount numeric default null::numeric, p_reference text default null::text
)
returns appointments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_amount numeric;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if v_appointment.customer_user_id is distinct from v_uid or v_appointment.is_walk_in then
    raise exception 'NOT_CUSTOMER';
  end if;
  if v_appointment.status not in ('PENDING', 'ACCEPTED', 'COMPLETED') then
    raise exception 'INVALID_TRANSITION';
  end if;
  if v_appointment.payment_status not in ('UNPAID', 'REJECTED') then
    raise exception 'PAYMENT_ALREADY_CLAIMED';
  end if;

  v_amount := coalesce(v_appointment.package_price, p_amount);
  if v_amount is null or v_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  update public.appointments
  set payment_method = p_method,
      payment_status = 'PENDING_CONFIRM',
      payment_amount = v_amount,
      payment_reference = nullif(left(trim(coalesce(p_reference, '')), 200), '')
  where id = p_id and payment_status in ('UNPAID', 'REJECTED')
  returning * into v_appointment;
  if not found then raise exception 'PAYMENT_ALREADY_CLAIMED'; end if;
  return v_appointment;
end
$function$;

revoke all on function public.appointment_claim_payment(text, text, numeric, text) from public, anon;
grant execute on function public.appointment_claim_payment(text, text, numeric, text) to authenticated;

create or replace function public.delivery_collect_cash(p_delivery_id text)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_d public.appointment_deliveries%rowtype;
  v_a record;
  v_amount numeric;
  v_agent_is_owner boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_d from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_d.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_d.status not in ('EN_ROUTE', 'ARRIVED') then raise exception 'INVALID_TRANSITION'; end if;

  select a.id, a.package_price, a.delivery_fee, a.payment_status, a.target_id into v_a
    from public.appointments a where a.id = v_d.appointment_id for update;
  if v_a.payment_status = 'PAID' then raise exception 'ALREADY_PAID'; end if;
  if v_a.payment_status = 'PENDING_CONFIRM' then raise exception 'PAYMENT_ALREADY_CLAIMED'; end if;

  v_amount := coalesce(v_a.package_price, 0) + coalesce(v_a.delivery_fee, 0);
  if v_amount <= 0 then raise exception 'NOTHING_TO_COLLECT'; end if;

  -- An owner delivering their own order has nothing to hand over to themselves.
  select exists (select 1 from public.businesses b where b.id = v_a.target_id and b.owner_user_id = v_uid)
    into v_agent_is_owner;

  update public.appointments
     set payment_method = 'CASH', payment_status = 'PAID', payment_amount = v_amount,
         payment_reference = coalesce(payment_reference, 'COD'),
         cash_collected_at = now(),
         cash_settled_at = case when v_agent_is_owner then now() else null end
   where id = v_a.id;

  return v_amount;
end $function$;

revoke all on function public.delivery_collect_cash(text) from public, anon;
grant execute on function public.delivery_collect_cash(text) to authenticated;

create or replace function public.business_cash_to_settle(p_business_id text)
returns table(agent_user_id text, agent_name text, orders integer, amount numeric, oldest timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, auth.uid()::text, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  return query
    select d.agent_user_id, coalesce(nullif(trim(u.name), ''), u.alias, 'Rider'),
           count(*)::int, sum(coalesce(a.payment_amount, 0)), min(a.cash_collected_at)
      from public.appointments a
      join public.appointment_deliveries d on d.appointment_id = a.id and d.status = 'DELIVERED'
      left join public.users u on u.id = d.agent_user_id
     where a.target_type = 'BUSINESS' and a.target_id = p_business_id
       and a.cash_collected_at is not null and a.cash_settled_at is null
     group by d.agent_user_id, u.name, u.alias
     order by min(a.cash_collected_at);
end $function$;

revoke all on function public.business_cash_to_settle(text) from public, anon;
grant execute on function public.business_cash_to_settle(text) to authenticated;

create or replace function public.settle_agent_cash(p_business_id text, p_agent_user_id text)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total numeric;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, auth.uid()::text, 'appointments') then raise exception 'NOT_ALLOWED'; end if;

  with settled as (
    update public.appointments a
       set cash_settled_at = now()
      from public.appointment_deliveries d
     where d.appointment_id = a.id and d.status = 'DELIVERED' and d.agent_user_id = p_agent_user_id
       and a.target_type = 'BUSINESS' and a.target_id = p_business_id
       and a.cash_collected_at is not null and a.cash_settled_at is null
    returning coalesce(a.payment_amount, 0) as amt
  )
  select coalesce(sum(amt), 0) into v_total from settled;

  return v_total;
end $function$;

revoke all on function public.settle_agent_cash(text, text) from public, anon;
grant execute on function public.settle_agent_cash(text, text) to authenticated;

drop function if exists public.my_deliveries();

create or replace function public.my_deliveries()
returns table(
  id text, appointment_id text, business_id text, business_name text, customer_name text, customer_area text,
  delivery_address_line text, delivery_lat double precision, delivery_lng double precision,
  scheduled_for timestamp with time zone, date_label text, time_label text, status text, live_status text,
  handoff_code text, handoff_verified boolean, lat double precision, lng double precision, batch_id text,
  stop_order integer, batch_status text, batch_lat double precision, batch_lng double precision,
  created_at timestamp with time zone, delivered_at timestamp with time zone,
  amount_due numeric, delivery_fee integer, payment_method text, payment_status text, cash_collected_at timestamptz
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
    case when a.payment_status = 'PAID' then 0 else coalesce(a.package_price, 0) + coalesce(a.delivery_fee, 0) end,
    a.delivery_fee, a.payment_method, a.payment_status, a.cash_collected_at
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

create or replace function public.confirm_handoff(p_delivery_id text, p_code text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_attempt public.handoff_attempts%rowtype;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_matches boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;

  select * into v_attempt from public.handoff_attempts where delivery_id = p_delivery_id for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    raise exception 'Too many wrong attempts — wait a few minutes and ask the customer to confirm again.';
  end if;

  v_matches := v_row.handoff_code is not distinct from p_code;

  if v_matches then
    delete from public.handoff_attempts where delivery_id = p_delivery_id;
    update public.appointment_deliveries
       set handoff_verified = true, status = case when status = 'EN_ROUTE' then 'ARRIVED' else status end
     where id = p_delivery_id;
    return true;
  end if;

  insert into public.handoff_attempts (delivery_id, fail_count, last_attempt_at, locked_until)
  values (p_delivery_id, 1, now(), null)
  on conflict (delivery_id) do update
  set fail_count = case
        when handoff_attempts.last_attempt_at <= now() - v_window
          or handoff_attempts.locked_until is not null
        then 1 else handoff_attempts.fail_count + 1 end,
      last_attempt_at = now(),
      locked_until = case
        when (case
          when handoff_attempts.last_attempt_at <= now() - v_window
            or handoff_attempts.locked_until is not null
          then 1 else handoff_attempts.fail_count + 1 end) >= v_max_attempts
        then now() + v_window else null end;

  return false;
end
$function$;

revoke all on function public.confirm_handoff(text, text) from public, anon;
grant execute on function public.confirm_handoff(text, text) to authenticated;

create or replace function public.assign_delivery(p_appointment_id text, p_agent_user_id text)
returns appointment_deliveries
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Staff (or a rider holding the appointments scope) must not see the customer's handoff code (20260967).
  v_row.handoff_code := null;
  return v_row;
end $function$;

revoke all on function public.assign_delivery(text, text) from public, anon;
grant execute on function public.assign_delivery(text, text) to authenticated;

-- Rows the order-cancel trigger closed use values the original constraints do not allow; fold them into the nearest ones.
update public.appointment_deliveries set cancel_reason = 'OTHER', cancelled_by = 'BUSINESS',
  cancel_note = coalesce(cancel_note, 'Order cancelled') where cancel_reason = 'ORDER_CANCELLED' or cancelled_by = 'SYSTEM';

alter table public.appointment_deliveries drop constraint if exists appointment_deliveries_cancelled_by_check;
alter table public.appointment_deliveries add constraint appointment_deliveries_cancelled_by_check
  check (cancelled_by is null or cancelled_by = any (array['AGENT'::text, 'BUSINESS'::text]));
alter table public.appointment_deliveries drop constraint if exists appointment_deliveries_cancel_reason_check;
alter table public.appointment_deliveries add constraint appointment_deliveries_cancel_reason_check
  check (cancel_reason is null or cancel_reason = any (array[
    'CUSTOMER_UNAVAILABLE'::text, 'ADDRESS_PROBLEM'::text, 'CUSTOMER_REFUSED'::text, 'UNSAFE'::text, 'AGENT_EMERGENCY'::text, 'OTHER'::text
  ]));

alter table public.appointments drop column if exists cash_collected_amount;

notify pgrst, 'reload schema';
