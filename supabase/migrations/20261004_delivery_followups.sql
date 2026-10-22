-- Migration 20261004: Delivery follow-ups — the items 20261003 left open.
--
-- DLV-016  "As soon as possible" is refused while the shop is closed (server-side; the order sheet already hid it).
-- DLV-009  Proof of delivery: a shop can allow "leave at the door" for prepaid orders. The rider arrives, waits five minutes,
--          takes a photo, and the delivery can then be completed without the customer's handoff code.
--
-- Additive: two columns on appointment_deliveries plus one on businesses (default off), four helper/RPC functions, and two
-- replaced bodies (appointment_create — one extra check; appointment_update_delivery_status — one relaxed guard and
-- the notification wording). No RETURNS TABLE is widened, so nothing is dropped.
-- Rollback: supabase/rollbacks/20261004_delivery_followups.rollback.sql

alter table public.businesses
  add column if not exists delivery_proof_allowed boolean not null default false;
comment on column public.businesses.delivery_proof_allowed is
  'Shop opt-in: a rider may leave a prepaid delivery at the door and complete it with a photo instead of the handoff code.';

alter table public.appointment_deliveries
  add column if not exists proof_photo_url text,
  add column if not exists proof_note text,
  add column if not exists proof_at timestamptz;

-- ── Opening hours, read the way the app reads them (src/utils/availability.ts) ───────────────────────────────────────
-- Both return NULL when the text isn't one of the formats understood here; callers treat NULL as "can't tell" and allow.
create or replace function public.hours_minutes(p_time text)
returns integer
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  s text := upper(btrim(coalesce(p_time, '')));
  num text;
  h integer;
  m integer;
begin
  num := btrim(regexp_replace(s, '(AM|PM)', '', 'g'));
  if num !~ '^\d{1,2}(:\d{2})?$' then return null; end if;
  h := split_part(num, ':', 1)::integer;
  m := coalesce(nullif(split_part(num, ':', 2), ''), '0')::integer;
  if s like '%PM%' and h < 12 then h := h + 12; end if;
  if s like '%AM%' and h = 12 then h := 0; end if;
  return h * 60 + m;
end $function$;

-- Whether minute-of-day p_now falls inside one range. p_spill = the part of the previous day's overnight range that runs
-- past midnight; otherwise the part of this day's range up to midnight (or its end, if it ends the same day).
create or replace function public.hours_range_hit(p_from integer, p_to integer, p_now integer, p_spill boolean)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when p_to = p_from then false
    when p_spill then p_to > 0 and p_to < p_from and p_now <= p_to
    else p_now >= p_from and p_now <= case when p_to < p_from then 1440 else p_to end
  end;
$function$;

create or replace function public.hours_open_at(p_hours text, p_at timestamptz)
returns boolean
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_local timestamp := p_at at time zone 'Asia/Kolkata';
  v_dow integer := extract(dow from v_local)::integer;
  v_codes text[] := array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  v_today text := v_codes[v_dow + 1];
  v_prev text := v_codes[((v_dow + 6) % 7) + 1];
  v_now integer := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  v_text text := btrim(coalesce(p_hours, ''));
  v_main text;
  v_doc jsonb;
  v_day text;
  v_range jsonb;
  v_f integer;
  v_t integer;
  v_days text[];
begin
  if v_text = '' then return null; end if;

  -- Current format (v2): per-day ranges, up to two a day, overnight ranges allowed.
  if left(v_text, 1) = '{' then
    begin
      v_doc := v_text::jsonb;
    exception when others then
      return null;
    end;
    if (v_doc->>'v') is distinct from '2' or jsonb_typeof(v_doc->'days') is distinct from 'object' then return null; end if;
    foreach v_day in array array[v_today, v_prev] loop
      if coalesce((v_doc->'days'->v_day->>'open')::boolean, false) then
        for v_range in
          select r.value from jsonb_array_elements(coalesce(v_doc->'days'->v_day->'ranges', '[]'::jsonb)) with ordinality as r(value, ord)
          order by r.ord limit 2
        loop
          v_f := public.hours_minutes(v_range->>'from');
          v_t := public.hours_minutes(v_range->>'to');
          if v_f is null or v_t is null then return null; end if;
          if public.hours_range_hit(v_f, v_t, v_now, v_day = v_prev) then return true; end if;
        end loop;
      end if;
    end loop;
    return false;
  end if;

  v_main := btrim(split_part(v_text, '|', 1));
  if v_main = 'Open 24×7' then return true; end if;
  -- The old per-day list ("Mon 11:00–23:30, Tue Closed, …") isn't read here.
  if v_main like '%, %' or v_main like '%Closed%' or v_main ~ '^[A-Za-z]{3}\s\d{2}:\d{2}' then return null; end if;

  -- Old day-group pattern: "Mon–Sat from 09:00 AM to 07:00 PM".
  if position(' from ' in v_main) = 0 or position(' to ' in v_main) = 0 then return null; end if;
  v_f := public.hours_minutes(btrim(split_part(split_part(v_main, ' from ', 2), ' to ', 1)));
  v_t := public.hours_minutes(btrim(split_part(v_main, ' to ', 2)));
  if v_f is null or v_t is null then return null; end if;
  v_days := case
    when v_main like '%Mon' || chr(8211) || 'Sat%' or v_main like '%Mon-Sat%' then array['Mon','Tue','Wed','Thu','Fri','Sat']
    when v_main like '%Mon' || chr(8211) || 'Fri%' or v_main like '%Mon-Fri%' then array['Mon','Tue','Wed','Thu','Fri']
    when v_main like '%Sat' || chr(8211) || 'Sun%' or v_main like '%Sat-Sun%' then array['Sat','Sun']
    else array['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  end;
  if v_today = any(v_days) and public.hours_range_hit(v_f, v_t, v_now, false) then return true; end if;
  if v_prev = any(v_days) and public.hours_range_hit(v_f, v_t, v_now, true) then return true; end if;
  return false;
end $function$;

revoke all on function public.hours_minutes(text) from public, anon, authenticated;
revoke all on function public.hours_range_hit(integer, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.hours_open_at(text, timestamptz) from public, anon, authenticated;

-- ── DLV-016: appointment_create refuses ASAP while the shop is closed ────────────────────────────────────────────────
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
  v_hours text;
  v_manual boolean;
  v_until timestamptz;
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

  -- DLV-016: "as soon as possible" only while the shop is open — otherwise the order would sit unanswered. Same rule the order
  -- sheet applies (a manual "open until" wins, then the owner's open/closed switch, then the posted hours), enforced here
  -- because the RPC is reachable directly. Hours the server can't read count as open: a refused order is worse than a late one.
  if v_asap and p_target_type = 'BUSINESS' then
    select bz.hours, bz.is_available_now, bz.available_until into v_hours, v_manual, v_until
      from public.businesses bz where bz.id = p_target_id;
    if not (v_until is not null and v_until > now()) and v_manual is distinct from true then
      if v_manual = false or public.hours_open_at(v_hours, now()) = false then
        raise exception 'SHOP_CLOSED';
      end if;
    end if;
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

-- ── DLV-009: proof of delivery ───────────────────────────────────────────────────────────────────────────────────────
-- The rider records a photo; the ordinary DONE step then accepts it in place of the handoff code.
create or replace function public.delivery_record_proof(p_delivery_id text, p_photo_url text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_a record;
  v_allowed boolean;
  v_due numeric;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_row.status <> 'ARRIVED' then raise exception 'INVALID_TRANSITION'; end if;
  if v_row.handoff_verified then raise exception 'ALREADY_HANDED_OFF'; end if;

  select a.status, a.package_price, a.delivery_fee, a.payment_status, a.payment_amount, a.target_id into v_a
    from public.appointments a where a.id = v_row.appointment_id;
  if v_a.status is distinct from 'ACCEPTED' then raise exception 'ORDER_NOT_ACTIVE'; end if;

  select b.delivery_proof_allowed into v_allowed from public.businesses b where b.id = v_a.target_id;
  if not coalesce(v_allowed, false) then raise exception 'PROOF_NOT_ALLOWED'; end if;

  -- A door-step drop only works for an order that is already paid: nobody is there to hand money to.
  if v_a.payment_status is distinct from 'PENDING_CONFIRM' then
    v_due := coalesce(v_a.package_price, 0) + coalesce(v_a.delivery_fee, 0)
             - case when v_a.payment_status = 'PAID' then coalesce(v_a.payment_amount, 0) else 0 end;
    if v_due > 0 then raise exception 'PROOF_REQUIRES_PREPAID'; end if;
  end if;

  -- The rider must have actually waited for the customer.
  if v_row.arrived_at is null or v_row.arrived_at > now() - interval '5 minutes' then raise exception 'PROOF_TOO_EARLY'; end if;

  -- The photo has to be one this rider just uploaded for this purpose (uploads/<uid>/delivery-proof/…), not any link.
  if p_photo_url is null or length(p_photo_url) > 600
     or p_photo_url !~ '^https://' or position('/uploads/' || v_uid || '/delivery-proof/' in p_photo_url) = 0 then
    raise exception 'INVALID_PROOF_PHOTO';
  end if;

  update public.appointment_deliveries
     set proof_photo_url = p_photo_url,
         proof_note = nullif(left(btrim(coalesce(p_note, '')), 200), ''),
         proof_at = now()
   where id = p_delivery_id;
  return true;
end $function$;

revoke all on function public.delivery_record_proof(text, text, text) from public, anon;
grant execute on function public.delivery_record_proof(text, text, text) to authenticated;

-- What the proof screens need, for the three people allowed to see it: the rider, the customer, and the shop's managers.
-- The photo itself is only returned once the delivery is finished (or to the rider who took it).
create or replace function public.delivery_proof(p_delivery_id text)
returns table (
  proof_allowed boolean, can_record boolean, waited_min integer,
  proof_photo_url text, proof_note text, proof_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_customer text;
  v_allowed boolean;
  v_is_agent boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  select a.customer_user_id into v_customer from public.appointments a where a.id = v_row.appointment_id;
  v_is_agent := v_uid = v_row.agent_user_id;
  if not (v_is_agent or v_uid = v_customer or v_uid in (select public.business_manager_ids(v_row.business_id))) then
    raise exception 'NOT_ALLOWED';
  end if;
  select b.delivery_proof_allowed into v_allowed from public.businesses b where b.id = v_row.business_id;

  return query select
    coalesce(v_allowed, false),
    v_is_agent and coalesce(v_allowed, false) and v_row.status = 'ARRIVED' and not v_row.handoff_verified,
    case when v_row.arrived_at is null then null else greatest(0, floor(extract(epoch from (now() - v_row.arrived_at)) / 60))::integer end,
    case when v_is_agent or v_row.status = 'DELIVERED' then v_row.proof_photo_url else null end,
    case when v_is_agent or v_row.status = 'DELIVERED' then v_row.proof_note else null end,
    v_row.proof_at;
end $function$;

revoke all on function public.delivery_proof(text) from public, anon;
grant execute on function public.delivery_proof(text) to authenticated;

-- ── DLV-009: completing without the handoff code when a proof photo exists ───────────────────────────────────────────
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
  if p_status = 'DONE' and v_row.handoff_code is not null and not v_row.handoff_verified and v_row.proof_photo_url is null then
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
          case when v_row.proof_photo_url is not null then 'Order left at your door 📦' else 'Order delivered! 🎉' end,
          case when v_row.proof_photo_url is not null
               then 'Your order from ' || coalesce(v_biz_name, 'the store') || ' was left at your door. The rider took a photo as proof of delivery.'
               else 'Your order from ' || coalesce(v_biz_name, 'the store') || ' was delivered successfully.' end,
          '/appointments',
          jsonb_build_object(
            'deliveryId', p_delivery_id,
            'appointmentId', v_row.appointment_id,
            'statusPill', case when v_row.proof_photo_url is not null then 'Left at door' else 'Delivered' end,
            'tone', 'success',
            'leftAtDoor', v_row.proof_photo_url is not null
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

notify pgrst, 'reload schema';
