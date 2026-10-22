-- Migration 20261003: Delivery operations — the P1/P2 findings of archive/docs/gaps/DELIVERY_PRODUCTION_READINESS_GAP_LOG.md.
--
-- DLV-013  A delivery finished with money still owed is flagged (cash_outstanding_amount) and listed for the owner.
-- DLV-014  Delivery orders no longer count towards the 5-bookings-a-day limit; the day is the IST day.
-- DLV-015  Unanswered ASAP orders: the shop is nudged at 10 minutes and the order is cancelled at 30 (pg_cron).
-- DLV-018  A real pick-up step: the rider confirms pick-up before the delivery can start.
-- DLV-019  Rider position carries a timestamp, so the owner can tell "live" from "lost".
-- DLV-020  (done in 20261002)
-- DLV-023  Accepting a run validates the stop order.
-- DLV-027  Failed deliveries: reason-aware customer messages, an "I'm ready now" path, and every manager is told (not only the owner).
-- DLV-029  Ending a rider's access takes their not-yet-started deliveries back and warns the shop about any in flight.
-- DLV-033  The customer gets an honest ETA computed from the rider's fresh position — without ever receiving coordinates.
-- DLV-034  The customer can see the shop's phone from the tracking card.
-- DLV-035  The public tracking page shows a cancelled delivery as cancelled, and only the rider's first name (no photo).
-- DLV-038  Position writes are rate limited.
-- DLV-039  Delivery events are timestamped (picked up, started, arrived).
-- DLV-040  Notifications name people consistently (first name).
-- DLV-041  Admin overview of deliveries that need attention.
-- DLV-043  Delivery funnel events are added to the analytics whitelist.
-- D6       delivery_batches can be read by staff holding the appointments scope.
--
-- Depends on 20261001 and 20261002. Functions with a widened RETURNS TABLE are dropped first.

-- ── Columns ──────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.appointment_deliveries
  add column if not exists picked_up_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists position_at timestamptz,
  add column if not exists heading double precision;

alter table public.delivery_batches add column if not exists position_at timestamptz;

alter table public.appointments
  add column if not exists cash_outstanding_amount numeric,
  add column if not exists nudged_at timestamptz;

-- ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────
-- DLV-040: one way to name a person in a notification.
create or replace function public.person_first_name(p_uid text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(nullif(split_part(trim(u.name), ' ', 1), ''), nullif(u.alias, ''), 'Someone')
    from public.users u where u.id = p_uid;
$function$;

revoke all on function public.person_first_name(text) from public, anon, authenticated;

-- DLV-027: everyone who runs the shop's orders — the owner and active team members with the appointments scope (or full access).
create or replace function public.business_manager_ids(p_business_id text)
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select b.owner_user_id from public.businesses b where b.id = p_business_id and b.owner_user_id is not null
  union
  select s.grantee_user_id from public.business_access_sessions s
   where s.business_id = p_business_id and s.status = 'ACTIVE'
     and (s.expires_at is null or s.expires_at > now())
     and (s.access_level = 'FULL' or 'appointments' = any(s.scopes));
$function$;

revoke all on function public.business_manager_ids(text) from public, anon, authenticated;

-- ── DLV-018: pick-up step ────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.delivery_mark_picked_up(p_delivery_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_batch_status text;
  r record;
  v_customer text;
  v_biz_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_row.status <> 'ASSIGNED' then raise exception 'INVALID_TRANSITION'; end if;
  if not exists (select 1 from public.appointments a where a.id = v_row.appointment_id and a.status = 'ACCEPTED') then
    raise exception 'ORDER_NOT_ACTIVE';
  end if;
  if v_row.picked_up_at is not null then return true; end if;

  if v_row.batch_id is not null then
    select status into v_batch_status from public.delivery_batches where id = v_row.batch_id;
    if v_batch_status not in ('ACCEPTED', 'IN_PROGRESS') then raise exception 'BATCH_NOT_ACCEPTED'; end if;
  end if;

  select b.name into v_biz_name from public.businesses b where b.id = v_row.business_id;

  -- A run is picked up once: every not-yet-started stop of this rider's run is marked together.
  for r in
    with u as (
      update public.appointment_deliveries d
         set picked_up_at = now()
       where d.agent_user_id = v_uid and d.status = 'ASSIGNED' and d.picked_up_at is null
         and ((v_row.batch_id is not null and d.batch_id = v_row.batch_id) or d.id = v_row.id)
      returning d.id, d.appointment_id
    ) select * from u
  loop
    begin
      select a.customer_user_id into v_customer from public.appointments a where a.id = r.appointment_id;
      if v_customer is not null then
        insert into public.notifications (user_id, type, title, body, deep_link, metadata)
        values (
          v_customer, 'DELIVERY', 'Your order has been picked up',
          coalesce(v_biz_name, 'The shop') || ' has handed your order to the rider. It will be on its way shortly.',
          '/appointments',
          jsonb_build_object('deliveryId', r.id, 'appointmentId', r.appointment_id, 'statusPill', 'Picked up', 'tone', 'brand')
        );
      end if;
    exception when others then null; end;
  end loop;

  return true;
end $function$;

revoke all on function public.delivery_mark_picked_up(text) from public, anon;
grant execute on function public.delivery_mark_picked_up(text) to authenticated;

-- ── Status machine: pick-up required, timeline stamped, money still owed flagged (DLV-018, 039, 013, 040) ───────────
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

-- ── DLV-019 / DLV-038: position carries a time, and writes are rate limited ──────────────────────────────────────────
create or replace function public.update_delivery_position(
  p_delivery_id text, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null::double precision, p_heading double precision default null::double precision
)
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

  -- At most one write every 2 s per delivery: a client stuck in a loop can't hammer the table.
  update public.appointment_deliveries
     set lat = p_lat, lng = p_lng, heading = coalesce(p_heading, heading), position_at = now()
   where id = p_delivery_id
     and agent_user_id = v_uid
     and status in ('EN_ROUTE','ARRIVED')
     and (position_at is null or position_at < now() - interval '2 seconds');
end $function$;

revoke all on function public.update_delivery_position(text, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.update_delivery_position(text, double precision, double precision, double precision, double precision) to authenticated;

create or replace function public.update_delivery_batch_position(
  p_batch_id text, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null::double precision, p_heading double precision default null::double precision
)
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
  if not exists (select 1 from public.delivery_batches
                  where id = p_batch_id and agent_user_id = v_uid and status in ('ACCEPTED','IN_PROGRESS')) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.delivery_batches
     set lat = p_lat, lng = p_lng, accuracy = p_accuracy, heading = p_heading, position_at = now()
   where id = p_batch_id and agent_user_id = v_uid and status in ('ACCEPTED','IN_PROGRESS')
     and (position_at is null or position_at < now() - interval '2 seconds');
end $function$;

revoke all on function public.update_delivery_batch_position(text, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.update_delivery_batch_position(text, double precision, double precision, double precision, double precision) to authenticated;

-- ── my_deliveries: pick-up state and where the shop is (DLV-018) ──────────────────────────────────────────────────────
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
  customer_phone text, business_phone text, order_notes text, requested_window text, package_name text, items jsonb,
  picked_up_at timestamptz, business_lat double precision, business_lng double precision, business_address text
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
       from public.appointment_items i where i.appointment_id = a.id),
    d.picked_up_at, b.lat, b.lng, b.address_line1
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

-- ── Owner's live board: timeline, position freshness, why a delivery ended (DLV-019, 028, 039; D5) ─────────────────────
drop function if exists public.business_active_deliveries(text);

create or replace function public.business_active_deliveries(p_business_id text)
returns table(
  id text, appointment_id text, status text, live_status text, agent_user_id text, agent_name text, agent_avatar text, agent_phone text,
  customer_name text, delivery_address_line text, delivery_lat double precision, delivery_lng double precision,
  delivery_eta_text text, scheduled_for timestamp with time zone, date_label text, time_label text,
  batch_id text, stop_order integer, batch_status text, agent_lat double precision, agent_lng double precision,
  agent_heading double precision, handoff_verified boolean, created_at timestamp with time zone, delivered_at timestamp with time zone,
  position_at timestamptz, picked_up_at timestamptz, started_at timestamptz, arrived_at timestamptz,
  cancel_reason text, cancel_note text, cancelled_by text
)
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
    coalesce(batch.lat, d.lat), coalesce(batch.lng, d.lng), coalesce(batch.heading, d.heading),
    d.handoff_verified,
    d.created_at, d.delivered_at,
    coalesce(batch.position_at, d.position_at), d.picked_up_at, d.started_at, d.arrived_at,
    d.cancel_reason, d.cancel_note, d.cancelled_by
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

-- ── Customer progress: honest ETA (no coordinates), shop phone, pick-up (DLV-033, 034, 018) ─────────────────────────
drop function if exists public.my_delivery_progress(text);

create or replace function public.my_delivery_progress(p_appointment_id text)
returns table(
  id text, status text, live_status text, handoff_code text, handoff_verified boolean, agent_name text, agent_phone text,
  agent_avatar text, agent_revealed boolean, eta_text text, stops_before integer, cancel_reason text, cancel_note text,
  eta_minutes integer, business_phone text, picked_up boolean
)
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
    case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then public.person_first_name(d.agent_user_id) else null end,
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
    d.cancel_note,
    -- Minutes away, from the rider's position when it is fresh (< 5 min old). Only the number leaves the database; the
    -- customer never receives a coordinate (the product decision enforced since 20260853).
    case
      when d.status = 'EN_ROUTE'
       and coalesce(batch.position_at, d.position_at) > now() - interval '5 minutes'
       and coalesce(batch.lat, d.lat) is not null and coalesce(batch.lng, d.lng) is not null
       and a.delivery_lat is not null and a.delivery_lng is not null
      then greatest(
             2,
             ceil(
               ST_Distance(
                 ST_SetSRID(ST_MakePoint(coalesce(batch.lng, d.lng), coalesce(batch.lat, d.lat)), 4326)::geography,
                 ST_SetSRID(ST_MakePoint(a.delivery_lng, a.delivery_lat), 4326)::geography
               ) / 1000.0 / 18.0 * 60.0
             )
             + 6 * coalesce((select count(*) from public.appointment_deliveries d3
                              where d3.batch_id = d.batch_id and d.batch_id is not null
                                and d3.stop_order is not null and d.stop_order is not null
                                and d3.stop_order < d.stop_order
                                and d3.status not in ('DELIVERED','CANCELLED')), 0)
           )::int
      else null
    end,
    b.phone,
    (d.picked_up_at is not null)
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.users u on u.id = d.agent_user_id
  left join public.businesses b on b.id = a.target_id
  left join public.delivery_batches batch on batch.id = d.batch_id
  where d.appointment_id = p_appointment_id
    and a.customer_user_id = v_uid
  order by d.created_at desc
  limit 1;
end $function$;

revoke all on function public.my_delivery_progress(text) from public, anon;
grant execute on function public.my_delivery_progress(text) to authenticated;

-- ── Public tracking page: cancelled shows as cancelled; first name only, no photo (DLV-035) ───────────────────────────
create or replace function public.get_tracking(p_token text)
returns table(
  agreement_id text, provider_lat double precision, provider_lng double precision, live_status text,
  provider_name text, provider_avatar text, stops_before integer, dest_lat double precision, dest_lng double precision
)
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
  -- Deliveries: progress only (coordinates always NULL). The latest delivery for the order, including a cancelled one, so a
  -- cancelled delivery reads as cancelled rather than as an expired link.
  select d.appointment_id,
         null::double precision, null::double precision,
         case when d.status = 'DELIVERED' then 'DONE' when d.status = 'CANCELLED' then 'CANCELLED' else d.live_status end,
         -- The link travels through chats; it only ever carries the rider's first name and no photo.
         case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then public.person_first_name(d.agent_user_id) else null end,
         null::text,
         (select count(*)::int from public.appointment_deliveries d2
            where d2.batch_id = d.batch_id and d.batch_id is not null
              and d2.stop_order is not null and d.stop_order is not null
              and d2.stop_order < d.stop_order
              and d2.status not in ('DELIVERED','CANCELLED')),
         null::double precision, null::double precision
  from public.tracking_tokens t
  join lateral (
    select d0.* from public.appointment_deliveries d0
     where d0.appointment_id = t.appointment_id
     order by d0.created_at desc limit 1
  ) d on true
  where t.id::text = p_token and t.expires_at > now() and t.appointment_id is not null;
$function$;

revoke all on function public.get_tracking(text) from public;
grant execute on function public.get_tracking(text) to anon, authenticated;

-- ── DLV-027: failed deliveries ───────────────────────────────────────────────────────────────────────────────────────
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
  v_customer   text;
  v_agent_uid  text;
  v_agent_name text;
  v_mgr        text;
  v_title      text;
  v_body       text;
  v_actions    jsonb;
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

  select b.name into v_biz_name from public.businesses b where b.id = v_row.business_id;
  select a.customer_user_id into v_customer
    from public.appointments a where a.id = v_row.appointment_id;
  if v_agent_uid is not null then
    v_agent_name := public.person_first_name(v_agent_uid);
  end if;

  begin
    if v_actor = 'AGENT' then
      -- Everyone who runs the shop's orders is told, not only the owner (DLV-027).
      for v_mgr in select public.business_manager_ids(v_row.business_id) loop
        insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
        values (
          v_mgr,
          'DELIVERY',
          'Delivery couldn''t be completed',
          coalesce(v_agent_name, 'Your courier') || ' marked a delivery undeliverable (' || coalesce(p_reason, 'Issue reported') || ').',
          '/business/' || v_row.business_id || '/manage/appointments?tab=deliveries',
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
      end loop;
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

    -- What the customer is told depends on why: "we are arranging another" is wrong when they were the reason.
    if v_customer is not null then
      if v_actor = 'AGENT' and p_reason = 'CUSTOMER_UNAVAILABLE' then
        v_title := 'We couldn''t reach you';
        v_body := coalesce(v_biz_name, 'The shop') || ' tried to deliver but you weren''t available. Tell them when you''re ready and they''ll send it again.';
        v_actions := jsonb_build_array('READY_FOR_REDELIVERY', 'TRACK_DELIVERY');
      elsif v_actor = 'AGENT' and p_reason = 'ADDRESS_PROBLEM' then
        v_title := 'Problem with your address';
        v_body := 'The rider couldn''t reach your address. Contact ' || coalesce(v_biz_name, 'the shop') || ' or tell them when you''re ready to try again.';
        v_actions := jsonb_build_array('READY_FOR_REDELIVERY', 'TRACK_DELIVERY');
      elsif v_actor = 'AGENT' and p_reason = 'CUSTOMER_REFUSED' then
        v_title := 'Delivery not completed';
        v_body := 'This delivery was marked as refused. If that is a mistake, please contact ' || coalesce(v_biz_name, 'the shop') || '.';
        v_actions := jsonb_build_array('TRACK_DELIVERY');
      else
        v_title := 'Delivery delayed';
        v_body := coalesce(v_biz_name, 'The business') || ' is arranging a new delivery for your order.';
        v_actions := jsonb_build_array('TRACK_DELIVERY');
      end if;

      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        v_customer,
        'DELIVERY',
        v_title,
        v_body,
        '/appointments',
        jsonb_build_object(
          'deliveryId', p_delivery_id,
          'appointmentId', v_row.appointment_id,
          'cancelReason', p_reason,
          'statusPill', 'Rescheduling',
          'tone', 'warning',
          'actions', v_actions
        )
      );
    end if;
  exception when others then null; end;
end $function$;

revoke all on function public.cancel_delivery(text, text, text) from public, anon;
grant execute on function public.cancel_delivery(text, text, text) to authenticated;

-- "I'm ready now": the customer asks the shop to send a rider again after a failed attempt they caused.
create or replace function public.customer_ready_for_redelivery(p_appointment_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_a record;
  v_mgr text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select a.id, a.target_id, a.target_type, a.customer_user_id, a.status, a.fulfillment_type, a.customer_name
    into v_a from public.appointments a where a.id = p_appointment_id for update;
  if v_a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if v_a.customer_user_id is distinct from v_uid then raise exception 'NOT_YOUR_BOOKING'; end if;
  if v_a.target_type <> 'BUSINESS' or v_a.fulfillment_type <> 'DELIVERY' or v_a.status <> 'ACCEPTED' then
    raise exception 'INVALID_TRANSITION';
  end if;
  if exists (select 1 from public.appointment_deliveries d
              where d.appointment_id = p_appointment_id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')) then
    raise exception 'DELIVERY_IN_PROGRESS';
  end if;

  -- One ping per ten minutes; tapping again must not spam the shop.
  if exists (select 1 from public.notifications n
              where n.entity_id = v_a.target_id and n.type = 'DELIVERY'
                and n.metadata->>'appointmentId' = p_appointment_id
                and n.metadata->>'statusPill' = 'Ready'
                and n.created_at > now() - interval '10 minutes') then
    return false;
  end if;

  for v_mgr in select public.business_manager_ids(v_a.target_id) loop
    insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
    values (
      v_mgr, 'DELIVERY', 'Customer is ready for delivery',
      public.person_first_name(v_uid) || ' is available now — please send a rider.',
      '/business/' || v_a.target_id || '/manage/appointments?tab=deliveries',
      jsonb_build_object('appointmentId', p_appointment_id, 'statusPill', 'Ready', 'tone', 'success',
                         'actions', jsonb_build_array('REASSIGN_DELIVERY')),
      'BUSINESS', v_a.target_id
    );
  end loop;
  return true;
end $function$;

revoke all on function public.customer_ready_for_redelivery(text) from public, anon;
grant execute on function public.customer_ready_for_redelivery(text) to authenticated;

-- Declines tell every manager, not only the owner (DLV-027).
create or replace function public.decline_solo_delivery(p_delivery_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_mgr text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_row.batch_id is not null or v_row.status <> 'ASSIGNED' then raise exception 'INVALID_STATE'; end if;

  delete from public.handoff_attempts where delivery_id = p_delivery_id;
  delete from public.appointment_deliveries where id = p_delivery_id;

  begin
    for v_mgr in select public.business_manager_ids(v_row.business_id) loop
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        v_mgr, 'DELIVERY', 'Delivery declined',
        public.person_first_name(v_uid) || ' declined a delivery — please assign another rider.',
        '/business/' || v_row.business_id || '/manage/appointments?tab=deliveries',
        jsonb_build_object('appointmentId', v_row.appointment_id, 'statusPill', 'Declined', 'tone', 'danger',
                           'actions', jsonb_build_array('REASSIGN_DELIVERY')),
        'BUSINESS', v_row.business_id
      );
    end loop;
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
  v_mgr text;
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

  begin
    for v_mgr in select public.business_manager_ids(v_batch.business_id) loop
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        v_mgr,
        'DELIVERY',
        'Delivery run declined',
        'Your courier declined ' || v_count || ' ' || (case when v_count = 1 then 'delivery' else 'deliveries' end) || ' — please reassign.',
        '/business/' || v_batch.business_id || '/manage/appointments?tab=deliveries',
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
    end loop;
  exception when others then null; end;

  return v_batch;
end $function$;

revoke all on function public.decline_delivery_batch(text) from public, anon;
grant execute on function public.decline_delivery_batch(text) to authenticated;

-- ── DLV-023: accepting a run needs a complete, duplicate-free stop order ─────────────────────────────────────────────
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
  v_stops int;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_batch from public.delivery_batches where id = p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if v_uid is distinct from v_batch.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_batch.status <> 'PENDING_ACCEPTANCE' then raise exception 'INVALID_BATCH_STATE'; end if;

  if p_stop_order is not null then
    select count(*) into v_stops from public.appointment_deliveries where batch_id = p_batch_id;
    -- Exactly the run's stops, each once: no strays, no duplicates, none left unordered.
    if coalesce(array_length(p_stop_order, 1), 0) <> v_stops
       or (select count(distinct x) from unnest(p_stop_order) as x) <> v_stops
       or exists (select 1 from unnest(p_stop_order) as x
                   where not exists (select 1 from public.appointment_deliveries d where d.id = x and d.batch_id = p_batch_id)) then
      raise exception 'INVALID_STOP_ORDER';
    end if;

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

-- ── DLV-014: delivery orders don't count towards the daily booking limit; the day is the IST day ─────────────────────
create or replace function public.enforce_customer_daily_appointment_limit()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_count integer;
  v_day_start timestamptz;
begin
  if coalesce(new.is_walk_in, false) then
    return new;
  end if;

  if new.status in ('CANCELLED', 'REJECTED') then
    return new;
  end if;

  -- Ordering groceries and medicine in a day is normal; the limit exists to stop slot hoarding, which delivery isn't.
  if new.fulfillment_type = 'DELIVERY' then
    return new;
  end if;

  -- The customer's day, not the database's (UTC): a booking at 01:00 IST belongs to that IST day.
  v_day_start := date_trunc('day', new.scheduled_for at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';

  perform pg_advisory_xact_lock(hashtext(new.customer_user_id || '|' || v_day_start::text));

  select count(*)
    into v_count
    from public.appointments a
   where a.customer_user_id = new.customer_user_id
     and a.id is distinct from new.id
     and coalesce(a.is_walk_in, false) = false
     and a.fulfillment_type is distinct from 'DELIVERY'
     and a.status not in ('CANCELLED', 'REJECTED')
     and a.scheduled_for >= v_day_start
     and a.scheduled_for <  v_day_start + interval '1 day';

  if v_count >= 5 then
    raise exception 'You''ve reached the limit of 5 bookings for this day. Please pick another date.';
  end if;

  return new;
end $function$;

revoke all on function public.enforce_customer_daily_appointment_limit() from public, anon, authenticated;

-- ── DLV-015: unanswered ASAP orders ──────────────────────────────────────────────────────────────────────────────────
-- The existing hold sweep only releases requests whose slot is still in the future; an ASAP order's "slot" is minutes away,
-- so it was never released and a customer waited forever. Nudge the shop at 10 minutes, cancel (auto-cancel notice to the
-- customer comes from notify_on_appointment_status) at 30.
create or replace function public.nudge_pending_asap_orders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_mgr text;
  v_n integer := 0;
begin
  for r in
    select a.id, a.target_id, a.customer_name from public.appointments a
     where a.status = 'PENDING' and a.is_asap and a.nudged_at is null and a.target_type = 'BUSINESS'
       and a.created_at <= now() - interval '10 minutes' and a.created_at > now() - interval '30 minutes'
     for update skip locked
  loop
    for v_mgr in select public.business_manager_ids(r.target_id) loop
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        v_mgr, 'APPOINTMENT', 'An order is waiting for you',
        coalesce(r.customer_name, 'A customer') || ' asked for delivery as soon as possible — accept or decline it soon, it expires in 20 minutes.',
        '/business/' || r.target_id || '/manage/appointments',
        jsonb_build_object('appointmentId', r.id, 'statusPill', 'Waiting', 'tone', 'warning'),
        'BUSINESS', r.target_id
      );
    end loop;
    update public.appointments set nudged_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

revoke all on function public.nudge_pending_asap_orders() from public, anon, authenticated;

create or replace function public.expire_stale_asap_orders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n integer;
begin
  update public.appointments
     set status = 'CANCELLED', cancelled_by = 'SYSTEM',
         response_note = coalesce(response_note, 'The shop didn''t respond in time')
   where status = 'PENDING' and is_asap and created_at <= now() - interval '30 minutes';
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

revoke all on function public.expire_stale_asap_orders() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('nudge-pending-asap-orders', '* * * * *', 'select public.nudge_pending_asap_orders();');
  perform cron.schedule('expire-stale-asap-orders', '* * * * *', 'select public.expire_stale_asap_orders();');
exception when others then null;
end $$;

-- ── DLV-013: money still owed after delivery ─────────────────────────────────────────────────────────────────────────
create or replace function public.business_cash_outstanding(p_business_id text)
returns table(appointment_id text, customer_name text, amount numeric, delivered_at timestamptz, agent_name text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, auth.uid()::text, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  return query
    select a.id, a.customer_name, a.cash_outstanding_amount, d.delivered_at, public.person_first_name(d.agent_user_id)
      from public.appointments a
      join public.appointment_deliveries d on d.appointment_id = a.id and d.status = 'DELIVERED'
     where a.target_type = 'BUSINESS' and a.target_id = p_business_id
       and a.cash_outstanding_amount > 0 and a.payment_status is distinct from 'PAID'
     order by d.delivered_at desc;
end $function$;

revoke all on function public.business_cash_outstanding(text) from public, anon;
grant execute on function public.business_cash_outstanding(text) to authenticated;

-- The shop has received what was owed (cash or otherwise) for a delivered order.
create or replace function public.mark_outstanding_paid(p_appointment_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_a record;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select a.id, a.target_id, a.package_price, a.delivery_fee, a.cash_outstanding_amount, a.payment_status
    into v_a from public.appointments a where a.id = p_appointment_id and a.target_type = 'BUSINESS' for update;
  if v_a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not public.has_business_scope(v_a.target_id, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if coalesce(v_a.cash_outstanding_amount, 0) <= 0 then raise exception 'NOTHING_OUTSTANDING'; end if;

  update public.appointments
     set payment_status = 'PAID',
         payment_method = coalesce(payment_method, 'CASH'),
         payment_amount = coalesce(package_price, 0) + coalesce(delivery_fee, 0),
         payment_reference = coalesce(payment_reference, 'COD'),
         cash_outstanding_amount = null
   where id = p_appointment_id;
  return true;
end $function$;

revoke all on function public.mark_outstanding_paid(text) from public, anon;
grant execute on function public.mark_outstanding_paid(text) to authenticated;

-- ── DLV-039: honest delivery time (rider started -> delivered), not "assigned -> delivered" ───────────────────────────
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
    'avg_minutes', (round(avg(extract(epoch from (d.delivered_at - coalesce(d.started_at, d.created_at))) / 60.0)
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

-- ── DLV-029: ending a rider's access ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_unassign_deliveries_on_access_end()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_mgr text;
  v_inflight int := 0;
  v_returned int := 0;
begin
  if old.status is distinct from 'ACTIVE' or new.status not in ('REVOKED', 'EXPIRED', 'DENIED') then
    return new;
  end if;

  for r in
    select * from public.appointment_deliveries
     where business_id = new.business_id and agent_user_id = new.grantee_user_id
       and status in ('ASSIGNED', 'EN_ROUTE', 'ARRIVED')
     for update
  loop
    if r.status = 'ASSIGNED' then
      -- Not started: take it back, so the order returns to the dispatch list instead of waiting on someone who can't act.
      delete from public.handoff_attempts where delivery_id = r.id;
      delete from public.appointment_deliveries where id = r.id;
      v_returned := v_returned + 1;
      if r.batch_id is not null and not exists (
        select 1 from public.appointment_deliveries d where d.batch_id = r.batch_id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
      ) then
        update public.delivery_batches set status = 'CANCELLED', completed_at = now()
         where id = r.batch_id and status in ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS');
      end if;
    else
      v_inflight := v_inflight + 1;
    end if;
  end loop;

  if v_returned + v_inflight > 0 then
    begin
      for v_mgr in select public.business_manager_ids(new.business_id) loop
        insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
        values (
          v_mgr, 'DELIVERY', 'A rider''s access ended',
          case when v_inflight > 0
               then v_inflight || ' delivery(ies) are still out with them — check the live board. ' || v_returned || ' not started were taken back.'
               else v_returned || ' delivery(ies) were taken back and need a new rider.' end,
          '/business/' || new.business_id || '/manage/appointments?tab=deliveries',
          jsonb_build_object('statusPill', 'Reassign', 'tone', 'warning', 'actions', jsonb_build_array('REASSIGN_DELIVERY')),
          'BUSINESS', new.business_id
        );
      end loop;
    exception when others then null; end;
  end if;

  return new;
end $function$;

revoke all on function public.tg_unassign_deliveries_on_access_end() from public, anon, authenticated;

drop trigger if exists trg_unassign_deliveries_on_access_end on public.business_access_sessions;
create trigger trg_unassign_deliveries_on_access_end
  after update of status on public.business_access_sessions
  for each row execute function public.tg_unassign_deliveries_on_access_end();

-- ── D6: staff holding the appointments scope can read runs ───────────────────────────────────────────────────────────
drop policy if exists delivery_batches_select on public.delivery_batches;
create policy delivery_batches_select on public.delivery_batches for select using (
  agent_user_id = ((select auth.uid()))::text
  or public.has_business_scope(business_id, ((select auth.uid()))::text, 'delivery')
  or public.has_business_scope(business_id, ((select auth.uid()))::text, 'appointments')
);

-- ── DLV-041: admin overview of deliveries that need attention ────────────────────────────────────────────────────────
create or replace function public.admin_delivery_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_out jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;

  select jsonb_build_object(
    'active', (select count(*) from public.appointment_deliveries where status in ('ASSIGNED','EN_ROUTE','ARRIVED')),
    'delivered_7d', (select count(*) from public.appointment_deliveries where status = 'DELIVERED' and delivered_at > now() - interval '7 days'),
    'failed_7d', (select count(*) from public.appointment_deliveries where status = 'CANCELLED' and cancelled_at > now() - interval '7 days'),
    'awaiting_rider', (select count(*) from public.appointments a
                        where a.fulfillment_type = 'DELIVERY' and a.status = 'ACCEPTED'
                          and not exists (select 1 from public.appointment_deliveries d
                                           where d.appointment_id = a.id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED','DELIVERED'))),
    'cash_outstanding', coalesce((select sum(cash_outstanding_amount) from public.appointments
                                   where cash_outstanding_amount > 0 and payment_status is distinct from 'PAID'), 0),
    'cash_unsettled', coalesce((select sum(coalesce(cash_collected_amount, payment_amount, 0)) from public.appointments
                                 where cash_collected_at is not null and cash_settled_at is null), 0),
    'attention', coalesce((
      select jsonb_agg(to_jsonb(y) order by y.since) from (
        select x.* from (
          select d.id as delivery_id, d.appointment_id, d.business_id, b.name as business_name, d.status,
                 case
                   when d.status = 'ASSIGNED' and d.created_at < now() - interval '30 minutes' then 'Not started for 30+ min'
                   when d.status = 'EN_ROUTE' and coalesce(d.position_at, d.started_at) < now() - interval '10 minutes' then 'Location lost for 10+ min'
                   when d.status = 'ARRIVED' and d.arrived_at < now() - interval '20 minutes' then 'At the door for 20+ min'
                 end as issue,
                 d.created_at as since
            from public.appointment_deliveries d
            left join public.businesses b on b.id = d.business_id
           where d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
        ) x where x.issue is not null order by x.since limit 50
      ) y
    ), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $function$;

revoke all on function public.admin_delivery_overview() from public, anon;
grant execute on function public.admin_delivery_overview() to authenticated;

-- ── DLV-043: delivery funnel events (the whitelist is the collection notice, see 20260996) ────────────────────────────
alter table public.events drop constraint if exists events_name_known;
alter table public.events add constraint events_name_known check (name in (
  'signup_completed', 'request_created', 'request_viewed', 'proposal_created', 'proposal_accepted',
  'booking_created', 'deal_completed', 'dispute_opened', 'review_left', 'share_link_opened',
  'otp_sent', 'otp_verified', 'otp_failed',
  'delivery_packed', 'delivery_assigned', 'delivery_picked_up', 'delivery_started', 'delivery_arrived',
  'delivery_delivered', 'delivery_failed', 'delivery_declined', 'delivery_cash_collected', 'delivery_cash_settled'
));

notify pgrst, 'reload schema';
