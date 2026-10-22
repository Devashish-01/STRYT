-- Migration 20261001: Business home delivery, done properly.
--
-- Plan: archive/docs/plans/BUSINESS_DELIVERY_PLAN.md (phases 1, 3, 4, 5).
--
-- 1. Delivery terms on businesses: own delivery radius, flat fee, free-above amount, minimum order, prep time.
-- 2. appointment_create: enforces the minimum order, snapshots the fee onto the order, uses the delivery radius, and
--    accepts an ASAP flag (delivery only) so a grocery order is "as soon as possible", not a slot pick.
-- 3. Order lifecycle: appointments.ready_at ("packed"), mark_order_ready(), business_delivery_queue() (orders waiting for
--    a rider — until now only an absence, DLV-009).
-- 4. Cash on delivery: delivery_collect_cash() for the rider, business_cash_to_settle() / settle_agent_cash() for the owner.
-- 5. business_delivery_stats() for the owner's insights screen.
-- 6. my_deliveries() also returns what the rider has to collect.
--
-- Existing orders are unaffected: every new column has a default, delivery_fee on past orders is 0.

-- ── 1. Delivery terms ────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.businesses
  add column if not exists delivery_radius_km numeric,
  add column if not exists delivery_fee integer not null default 0,
  add column if not exists free_delivery_above integer,
  add column if not exists min_order_amount integer not null default 0,
  add column if not exists delivery_prep_min integer not null default 20;

alter table public.businesses drop constraint if exists businesses_delivery_terms_check;
alter table public.businesses add constraint businesses_delivery_terms_check check (
  (delivery_radius_km is null or (delivery_radius_km > 0 and delivery_radius_km <= 100))
  and delivery_fee between 0 and 5000
  and (free_delivery_above is null or free_delivery_above >= 0)
  and min_order_amount between 0 and 100000
  and delivery_prep_min between 0 and 240
);

-- ── 2. Order columns ─────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.appointments
  add column if not exists delivery_fee integer not null default 0,
  add column if not exists is_asap boolean not null default false,
  add column if not exists ready_at timestamptz,
  add column if not exists cash_collected_at timestamptz,
  add column if not exists cash_settled_at timestamptz;

create index if not exists idx_appointments_cash_unsettled
  on public.appointments (target_id) where cash_collected_at is not null and cash_settled_at is null;

-- ── 3. appointment_create ────────────────────────────────────────────────────────────────────────────────────────────
-- A new trailing parameter changes the signature, so the old one is dropped first (CREATE OR REPLACE would leave an
-- ambiguous overload behind).
drop function if exists public.appointment_create(
  text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb, text, text,
  double precision, double precision, text, integer, text
);

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

-- ── 4. Packed / ready ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.mark_order_ready(p_appointment_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_apt record;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select a.id, a.target_id, a.status, a.fulfillment_type, a.customer_user_id, a.target_name, a.ready_at
    into v_apt from public.appointments a
   where a.id = p_appointment_id and a.target_type = 'BUSINESS' for update;
  if v_apt.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not public.has_business_scope(v_apt.target_id, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if v_apt.status <> 'ACCEPTED' then raise exception 'ORDER_NOT_ACCEPTED'; end if;
  if v_apt.ready_at is not null then return true; end if;

  update public.appointments set ready_at = now() where id = p_appointment_id;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      v_apt.customer_user_id,
      'DELIVERY',
      case when v_apt.fulfillment_type = 'DELIVERY' then 'Your order is packed' else 'Your order is ready for pickup' end,
      case when v_apt.fulfillment_type = 'DELIVERY'
           then coalesce(v_apt.target_name, 'The shop') || ' has packed your order and is arranging a rider.'
           else coalesce(v_apt.target_name, 'The shop') || ' has your order ready — come and collect it.' end,
      '/appointments',
      jsonb_build_object('appointmentId', p_appointment_id, 'statusPill', 'Packed', 'tone', 'success')
    );
  exception when others then null; end;

  return true;
end $function$;

revoke all on function public.mark_order_ready(text) from public, anon;
grant execute on function public.mark_order_ready(text) to authenticated;

-- ── 5. Orders waiting for a rider ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.business_delivery_queue(p_business_id text)
returns table(
  appointment_id text, customer_name text, delivery_address_line text, scheduled_for timestamptz,
  time_label text, is_asap boolean, package_name text, package_price numeric, delivery_fee integer,
  ready_at timestamptz, payment_method text, payment_status text, is_out_of_range boolean, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, auth.uid()::text, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  return query
    select a.id, a.customer_name, a.delivery_address_line, a.scheduled_for, a.time_label, a.is_asap,
           a.package_name, a.package_price, a.delivery_fee, a.ready_at, a.payment_method, a.payment_status,
           coalesce(a.is_out_of_range, false), a.created_at
      from public.appointments a
     where a.target_type = 'BUSINESS' and a.target_id = p_business_id
       and a.fulfillment_type = 'DELIVERY' and a.status = 'ACCEPTED'
       and not exists (
         select 1 from public.appointment_deliveries d
          where d.appointment_id = a.id and d.status in ('ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'DELIVERED')
       )
     order by (a.ready_at is null), a.scheduled_for;
end $function$;

revoke all on function public.business_delivery_queue(text) from public, anon;
grant execute on function public.business_delivery_queue(text) to authenticated;

-- ── 6. Cash on delivery ──────────────────────────────────────────────────────────────────────────────────────────────
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

-- ── 7. Insights ──────────────────────────────────────────────────────────────────────────────────────────────────────
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

-- ── 8. my_deliveries: what the rider has to collect ──────────────────────────────────────────────────────────────────
-- RETURNS TABLE is widened, so the function is dropped first.
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

notify pgrst, 'reload schema';
