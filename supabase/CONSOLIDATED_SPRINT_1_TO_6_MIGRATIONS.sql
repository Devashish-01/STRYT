-- ==============================================================================
-- STRYT: CONSOLIDATED SPRINTS 1 TO 6 MIGRATIONS (20260940 - 20260945)
-- Run this directly in Supabase Dashboard -> SQL Editor
-- ==============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- START OF: 20260940_get_public_profile_alias_privacy.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Migration: 20260940_get_public_profile_alias_privacy.sql
-- Goal: Return alias in get_public_profile and enforce real name privacy masking (PROF-2).
-- Author: STRYT Engineering / Sprint 1

drop function if exists public.get_public_profile(text);

create or replace function public.get_public_profile(target_id text)
returns table (
  id text,
  name text,
  phone text,
  avatar text,
  area text,
  rating_avg numeric,
  rating_count int,
  created_at timestamptz,
  show_posts_publicly boolean,
  show_asks_publicly boolean,
  show_badges_publicly boolean,
  show_phone_publicly boolean,
  show_city_publicly boolean,
  show_rating_publicly boolean,
  distance_km numeric,
  email text,
  show_email_publicly boolean,
  show_name_publicly boolean,
  alias text
)
language plpgsql security definer stable set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_is_self_or_admin boolean;
  v_my_lat double precision;
  v_my_lng double precision;
begin
  select (u.id = v_uid) or ('admin' = any(u.roles))
    into v_is_self_or_admin
    from public.users u where u.id = v_uid;

  select u.lat, u.lng into v_my_lat, v_my_lng from public.users u where u.id = v_uid;

  return query
    select
      u.id,
      case when v_is_self_or_admin or coalesce(u.show_name_publicly, false) then u.name else null end,
      case when v_is_self_or_admin or u.show_phone_publicly then u.phone else null end,
      u.avatar,
      case when v_is_self_or_admin or u.show_city_publicly then u.area else null end,
      u.rating_avg,
      u.rating_count,
      u.created_at,
      u.show_posts_publicly,
      u.show_asks_publicly,
      u.show_badges_publicly,
      u.show_phone_publicly,
      u.show_city_publicly,
      u.show_rating_publicly,
      case when v_my_lat is null or v_my_lng is null or u.lat is null or u.lng is null then null
           else round((2 * 6371 * asin(sqrt(
             sin(radians(u.lat - v_my_lat) / 2) ^ 2 +
             cos(radians(v_my_lat)) * cos(radians(u.lat)) * sin(radians(u.lng - v_my_lng) / 2) ^ 2
           )))::numeric, 1)
      end,
      case when v_is_self_or_admin or coalesce(u.show_email_publicly, false) then u.email else null end,
      coalesce(u.show_email_publicly, false),
      coalesce(u.show_name_publicly, false),
      u.alias
    from public.users u
    where u.id = target_id
      and (v_is_self_or_admin or (u.customer_enabled = true and u.customer_deleted_at is null) or u.id = v_uid);
end $$;

revoke execute on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to authenticated, anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- START OF: 20260941_enforce_slot_capacity_blocked_slots.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Migration: 20260941_enforce_slot_capacity_blocked_slots.sql
-- Goal: Enforce blocked_slots server-side in appointments capacity trigger (SLOT_BLOCKING: S1).
-- Author: STRYT Engineering / Sprint 1

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

  -- Only re-check when something capacity- or schedule-relevant changed, so an unrelated
  -- UPDATE (payment status, notes) never re-validates or takes the lock.
  if TG_OP = 'UPDATE'
     and new.scheduled_for is not distinct from old.scheduled_for
     and new.time_label    is not distinct from old.time_label
     and new.date_label    is not distinct from old.date_label
     and new.package_id    is not distinct from old.package_id
     and new.party_size    is not distinct from old.party_size
     and new.target_id     is not distinct from old.target_id
     and old.status not in ('CANCELLED', 'REJECTED', 'NO_SHOW') then
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

  -- 3) Check slot capacity usage
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

  -- 4) Check business-wide concurrent bookings ceiling
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

-- Ensure trigger is active
DROP TRIGGER IF EXISTS trg_enforce_slot_capacity ON public.appointments;
CREATE TRIGGER trg_enforce_slot_capacity
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slot_capacity();


-- ─────────────────────────────────────────────────────────────────────────────
-- START OF: 20260942_inperson_payment_and_party_quantity.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Sprint 2 — Domain 2 (Appointments & Scheduling), server-side half.
--
-- Gap B2 / P3: in-person cash payments were impossible on any booking a
--   customer made through the app — appointment_record_walk_in_payment
--   accepted walk-ins only. Widened to any booking the caller manages.
--
-- Gap B1 (server half) + inventory correctness: both appointment_create paths
--   synthesised their fallback line item with a hardcoded quantity of 1,
--   so group bookings under-reserved catalog stock and recorded a misleading
--   1 x <full party total> line.
--
-- Generated by transforming the live pg_get_functiondef output, so every part
-- of these functions not described above is byte-identical to what was
-- already deployed.

CREATE OR REPLACE FUNCTION public.appointment_create(p_target_type text, p_target_id text, p_scheduled_for timestamp with time zone, p_date_label text, p_time_label text, p_notes text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text, p_package_id text DEFAULT NULL::text, p_package_name text DEFAULT NULL::text, p_package_price numeric DEFAULT NULL::numeric, p_items jsonb DEFAULT NULL::jsonb, p_fulfillment_type text DEFAULT 'IN_STORE'::text, p_delivery_address_line text DEFAULT NULL::text, p_delivery_lat double precision DEFAULT NULL::double precision, p_delivery_lng double precision DEFAULT NULL::double precision, p_requested_delivery_window text DEFAULT NULL::text, p_party_size integer DEFAULT 1, p_target_package_key text DEFAULT NULL::text)
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
      raise exception 'OUT_OF_SERVICE_AREA';
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

  if (v_items is null or jsonb_array_length(v_items) = 0) and p_package_id is not null then
    -- package_price is the line TOTAL for the whole party, so the per-unit
    -- price is recovered by dividing it back out. Quantity is the party size,
    -- which is what reserve_catalog_items() needs in order to hold the right
    -- amount of stock.
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

CREATE OR REPLACE FUNCTION public.appointment_create_walk_in(p_target_type text, p_target_id text, p_customer_name text, p_customer_phone text, p_scheduled_for timestamp with time zone, p_date_label text, p_time_label text, p_package_id text DEFAULT NULL::text, p_package_name text DEFAULT NULL::text, p_package_price numeric DEFAULT NULL::numeric, p_items jsonb DEFAULT NULL::jsonb, p_party_size integer DEFAULT 1, p_target_package_key text DEFAULT NULL::text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- package_price is the line TOTAL for the whole party, so the per-unit
    -- price is recovered by dividing it back out. Quantity is the party size,
    -- which is what reserve_catalog_items() needs in order to hold the right
    -- amount of stock.
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

CREATE OR REPLACE FUNCTION public.appointment_record_walk_in_payment(p_id text, p_method text, p_amount numeric DEFAULT NULL::numeric, p_reference text DEFAULT NULL::text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
  v_amount numeric;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_APPOINTMENT_MANAGER'; end if;
  if v_appointment.payment_status not in ('UNPAID', 'REJECTED') then raise exception 'INVALID_TRANSITION'; end if;

  v_amount := coalesce(p_amount, v_appointment.package_price);
  if v_amount is null or v_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  update public.appointments
  set payment_method = p_method, payment_status = 'PAID', payment_amount = v_amount,
      payment_reference = nullif(left(trim(coalesce(p_reference, '')), 200), '')
  where id = p_id and payment_status in ('UNPAID', 'REJECTED')
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$function$;

CREATE OR REPLACE FUNCTION public.appointment_set_unpaid_amount(p_id text, p_amount numeric)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_APPOINTMENT_MANAGER'; end if;

  update public.appointments
  set package_price = p_amount, payment_amount = p_amount, payment_status = 'UNPAID'
  where id = p_id
  returning * into v_appointment;
  return v_appointment;
end
$function$;

revoke all on function public.appointment_set_unpaid_amount(text, numeric) from public, anon;
grant execute on function public.appointment_set_unpaid_amount(text, numeric) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- START OF: 20260943_sprint4_delivery_chat_hardening.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================================================
-- 20260943_sprint4_delivery_chat_hardening.sql
--
-- Sprint 4: Realtime Engine — Local Delivery & 1:1 Chat Hardening
--
-- 1. get_tracking: include 'DELIVERED' status with live_status = 'DONE' so
--    completed delivery tracking links don't falsely claim to be expired (T3).
-- 2. my_delivery_progress: return cancel_reason and cancel_note so customers
--    understand why an in-flight delivery was cancelled (T5).
-- 3. assign_delivery: reset batch_id and stop_order upon reassignment,
--    decoupling the stop from prior courier batches (D1).
-- 4. messages RLS: enforce block checks at insert time (C2).
-- 5. messages trigger: insert a notification row on new chat messages so
--    push notifications dispatch when the recipient is offline/backgrounded (C1).
-- ============================================================

-- ── 1. get_tracking: include DELIVERED for delivery tokens ────────────────
DROP FUNCTION IF EXISTS public.get_tracking(text);
CREATE OR REPLACE FUNCTION public.get_tracking(p_token text)
 RETURNS TABLE(agreement_id text, provider_lat double precision, provider_lng double precision,
               live_status text, provider_name text, provider_avatar text, stops_before int,
               dest_lat double precision, dest_lng double precision)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

GRANT EXECUTE ON FUNCTION public.get_tracking(text) TO anon, authenticated;

-- ── 2. my_delivery_progress: include cancellation context ──────────────────
DROP FUNCTION IF EXISTS public.my_delivery_progress(text);
CREATE OR REPLACE FUNCTION public.my_delivery_progress(p_appointment_id text)
RETURNS TABLE(
  id text, status text, live_status text,
  handoff_code text, handoff_verified boolean,
  agent_name text, agent_phone text, agent_avatar text,
  agent_revealed boolean,
  eta_text text, stops_before int,
  cancel_reason text, cancel_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

REVOKE ALL ON FUNCTION public.my_delivery_progress(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_delivery_progress(text) TO authenticated;

-- ── 3. assign_delivery: decouple stop from prior batch on reassignment ─────
CREATE OR REPLACE FUNCTION public.assign_delivery(p_appointment_id text, p_agent_user_id text)
 RETURNS public.appointment_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text; v_biz text; v_row public.appointment_deliveries%rowtype; v_code text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select a.target_id into v_biz from public.appointments a
    where a.id = p_appointment_id and a.target_type = 'BUSINESS';
  if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if not public.has_business_access(v_biz, p_agent_user_id) then raise exception 'AGENT_NOT_TEAM_MEMBER'; end if;
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
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (p_agent_user_id, 'QUEUE_UPDATE', 'New delivery assigned', 'You have a new delivery to complete.', '/delivery');
  exception when others then null; end;
  return v_row;
end $function$;

-- ── 4. messages RLS: check blocks on insert ────────────────────────────────
drop policy if exists insert_own_messages on public.messages;
create policy insert_own_messages on public.messages
  for insert with check (
    auth.role() = 'authenticated'
    and sender_id = auth.uid()::text
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_a = auth.uid()::text or c.participant_b = auth.uid()::text)
        and not public._user_blocks_exists(c.participant_a, c.participant_b)
    )
  );

-- ── 5. messages trigger: insert notification for recipient ──────────────────
CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_conv public.conversations%rowtype;
  v_recipient text;
  v_sender_name text;
begin
  select * into v_conv from public.conversations where id = NEW.conversation_id;
  if not found then return NEW; end if;

  v_recipient := case when v_conv.participant_a = NEW.sender_id then v_conv.participant_b else v_conv.participant_a end;
  if v_recipient is null then return NEW; end if;

  -- Do not notify if blocked between either party
  if public._user_blocks_exists(NEW.sender_id, v_recipient) then return NEW; end if;

  select coalesce(name, alias, 'Someone') into v_sender_name from public.users where id = NEW.sender_id;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      v_recipient,
      'CHAT',
      coalesce(v_sender_name, 'New message'),
      case when NEW.image_url is not null and (NEW.body is null or NEW.body = '') then '📷 Sent a photo' else substring(NEW.body from 1 for 100) end,
      '/chat/' || NEW.conversation_id
    );
  exception when others then null; end;

  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS tr_notify_on_chat_message ON public.messages;
CREATE TRIGGER tr_notify_on_chat_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_chat_message();


-- ─────────────────────────────────────────────────────────────────────────────
-- START OF: 20260944_sprint5_custom_requests_bids_bulk.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ==============================================================================
-- 20260944 — Sprint 5: Custom Requests, Bids, Agreements & Bulk Deals Hardening
--
-- Covers:
-- 1. Agreements schema expansion (responder_entity_id, responder_type)
-- 2. Multi-user team scoping for agreements RLS & lifecycle RPCs (A1)
-- 3. Elimination of direct UPDATE bypass on agreements (A4)
-- 4. Bilateral proposal counter acceptance & leads team scope on withdraw/counter (P1, P2)
-- 5. Realtime publication for proposal_counters & touch proposals.updated_at (P5)
-- 6. Unique index guarding against duplicate active quotes (P3)
-- 7. PENDING agreement 12h auto-cancel extension & safe proposal reversion (A3, A11)
-- 8. Dispute notification trigger (A7)
-- 9. Lightweight me_too_toggle RPC (R7)
-- 10. No-deposit bulk deal claim pass minting & balance_due tracking (BLK-1, BLK-4)
-- 11. Guard against deleting campaigns with active unredeemed passes (BLK-2)
-- 12. Delegated manager access (catalog scope) on bulk deals close & extend (BLK-3)
-- 13. Cross-store voucher redemption guard (BLK-5)
-- ==============================================================================

-- ── 1. Agreements Schema & Indexes ───────────────────────────────────────────

alter table public.agreements
  add column if not exists responder_entity_id text,
  add column if not exists responder_type text;

create index if not exists idx_agreements_responder_entity
  on public.agreements (responder_entity_id)
  where responder_entity_id is not null;

-- ── 2. Read Agreements RLS Policy ─────────────────────────────────────────────

drop policy if exists read_agreements on public.agreements;

create policy read_agreements on public.agreements
  for select to authenticated
  using (
    (select auth.uid()) is not null
    and (
      (select auth.uid())::text in (requester_user_id, responder_user_id)
      or (
        responder_entity_id is not null
        and public.has_business_scope(responder_entity_id, (select auth.uid())::text, 'leads')
      )
      or exists (
        select 1 from public.users u
        where u.id = (select auth.uid())::text
          and u.roles && array['admin', 'super_admin']::text[]
      )
    )
  );

-- ── 3. Drop Direct Client UPDATE Policy (A4 Vulnerability) ───────────────────

drop policy if exists upd_agreements on public.agreements;

-- ── 4. Proposals Unique Index (P3) ───────────────────────────────────────────

create unique index if not exists idx_proposals_active_user
  on public.proposals (request_id, responder_user_id)
  where status = 'SUBMITTED';

-- Ensure proposal_counters is in Supabase Realtime publication (P5)
do $$
begin
  alter publication supabase_realtime add table public.proposal_counters;
exception when others then
  null; -- Already in publication or publication not available
end $$;

-- ── 5. Bilateral Counter Acceptance & Team Permissions (P1, P2) ───────────────

create or replace function public.accept_proposal(p_proposal_id text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
  v_agreement_id text;
  v_rejected_responder text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_proposal from public.proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_request from public.requests
  where id = v_proposal.request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if v_request.requester_user_id is distinct from v_uid then
    raise exception 'NOT_REQUEST_OWNER';
  end if;
  if v_request.status <> 'OPEN' or v_proposal.status <> 'SUBMITTED' then
    raise exception 'REQUEST_NOT_OPEN';
  end if;
  if v_proposal.price is null or v_proposal.price <= 0 then
    raise exception 'INVALID_PRICE';
  end if;

  if exists (select 1 from public.agreements a
             where a.request_id = v_request.id or a.proposal_id = p_proposal_id) then
    raise exception 'AGREEMENT_ALREADY_EXISTS';
  end if;

  update public.proposals set status = 'ACCEPTED'
  where id = p_proposal_id and status = 'SUBMITTED';
  if not found then raise exception 'PROPOSAL_ALREADY_DECIDED'; end if;

  insert into public.agreements (
    request_id, request_title, proposal_id, requester_user_id, responder_user_id,
    responder_entity_id, responder_type,
    agreed_price, terms, requester_confirmed, responder_confirmed, payment_mode, status
  ) values (
    v_request.id, v_request.title, p_proposal_id,
    v_request.requester_user_id, v_proposal.responder_user_id,
    v_proposal.responder_entity_id, v_proposal.responder_type,
    v_proposal.price, coalesce(v_proposal.message, ''), false, false, 'OFFLINE', 'PENDING'
  ) returning id into v_agreement_id;

  update public.requests set status = 'IN_PROGRESS'
  where id = v_request.id and status = 'OPEN';
  if not found then raise exception 'REQUEST_ALREADY_DECIDED'; end if;

  for v_rejected_responder in
    update public.proposals set status = 'REJECTED'
    where request_id = v_request.id and id <> p_proposal_id and status = 'SUBMITTED'
    returning responder_user_id
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_rejected_responder, 'PROPOSAL', 'Quote not accepted',
        'The requester went with another quote for "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
        '/request/' || v_request.id);
    exception when others then null;
    end;
  end loop;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    v_proposal.responder_user_id, 'AGREEMENT', 'Your quote was accepted! 🎉',
    'Confirm within 12 hours to lock in "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
    '/agreement/' || v_agreement_id,
    jsonb_build_object('amount', v_proposal.price, 'amountLabel', 'Accepted at', 'statusPill', 'Confirm now', 'tone', 'success')
  );

  return v_agreement_id;
end
$$;

revoke execute on function public.accept_proposal(text) from public, anon;
grant execute on function public.accept_proposal(text) to authenticated;


create or replace function public.accept_proposal_counter(
  p_proposal_id text, p_counter_id text
) returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
  v_counter public.proposal_counters%rowtype;
  v_agreement_id text;
  v_rejected_responder text;
  v_is_requester boolean := false;
  v_is_responder boolean := false;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_proposal from public.proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_request from public.requests
  where id = v_proposal.request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if v_request.status <> 'OPEN' or v_proposal.status <> 'SUBMITTED' then
    raise exception 'REQUEST_NOT_OPEN';
  end if;

  select * into v_counter
  from public.proposal_counters c
  where c.proposal_id = p_proposal_id
  order by c.created_at desc, c.id desc
  limit 1 for update;

  if not found or v_counter.id is distinct from p_counter_id then
    raise exception 'COUNTER_NOT_LATEST';
  end if;
  if v_counter.amount is null or v_counter.amount <= 0 then
    raise exception 'INVALID_PRICE';
  end if;

  -- Determine party role and validate bilateral counter offer author
  if v_uid = v_request.requester_user_id then
    v_is_requester := true;
    if v_counter.by_user_id is distinct from v_proposal.responder_user_id then
      raise exception 'COUNTER_NOT_OFFERED_BY_RESPONDER';
    end if;
  elsif v_uid = v_proposal.responder_user_id
        or (v_proposal.responder_type = 'business' and public.has_business_scope(v_proposal.responder_entity_id, v_uid, 'leads'))
        or (v_proposal.responder_type = 'provider' and exists(select 1 from public.providers p where p.id = v_proposal.responder_entity_id and p.user_id = v_uid))
        or public.is_admin(v_uid) then
    v_is_responder := true;
    if v_counter.by_user_id is distinct from v_request.requester_user_id then
      raise exception 'COUNTER_NOT_OFFERED_BY_REQUESTER';
    end if;
  else
    raise exception 'NOT_AUTHORIZED_TO_ACCEPT_COUNTER';
  end if;

  if exists (select 1 from public.agreements a
             where a.request_id = v_request.id or a.proposal_id = p_proposal_id) then
    raise exception 'AGREEMENT_ALREADY_EXISTS';
  end if;

  update public.proposals set status = 'ACCEPTED'
  where id = p_proposal_id and status = 'SUBMITTED';
  if not found then raise exception 'PROPOSAL_ALREADY_DECIDED'; end if;

  insert into public.agreements (
    request_id, request_title, proposal_id, requester_user_id, responder_user_id,
    responder_entity_id, responder_type,
    agreed_price, terms, requester_confirmed, responder_confirmed, payment_mode, status
  ) values (
    v_request.id, v_request.title, p_proposal_id,
    v_request.requester_user_id, v_proposal.responder_user_id,
    v_proposal.responder_entity_id, v_proposal.responder_type,
    v_counter.amount::integer, coalesce(v_proposal.message, ''),
    -- Pre-confirm the party that called accept_proposal_counter
    v_is_requester, v_is_responder,
    'OFFLINE', 'PENDING'
  ) returning id into v_agreement_id;

  update public.requests set status = 'IN_PROGRESS'
  where id = v_request.id and status = 'OPEN';
  if not found then raise exception 'REQUEST_ALREADY_DECIDED'; end if;

  for v_rejected_responder in
    update public.proposals set status = 'REJECTED'
    where request_id = v_request.id and id <> p_proposal_id and status = 'SUBMITTED'
    returning responder_user_id
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_rejected_responder, 'PROPOSAL', 'Quote not accepted',
        'The requester went with another quote for "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
        '/request/' || v_request.id);
    exception when others then null;
    end;
  end loop;

  -- Notify other party of accepted counter
  declare
    v_notif_target text := case when v_is_requester then v_proposal.responder_user_id else v_request.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      v_notif_target, 'AGREEMENT', 'Counter-offer accepted! 🎉',
      'The counter of ₹' || v_counter.amount::text || ' was accepted. Confirm within 12 hours to lock in.',
      '/agreement/' || v_agreement_id,
      jsonb_build_object('amount', v_counter.amount, 'amountLabel', 'Agreed at', 'statusPill', 'Confirm now', 'tone', 'success')
    );
  exception when others then null;
  end;

  return v_agreement_id;
end;
$$;

revoke execute on function public.accept_proposal_counter(text, text) from public, anon;
grant execute on function public.accept_proposal_counter(text, text) to authenticated;


create or replace function public.withdraw_proposal(p_proposal_id text)
returns public.proposals
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_proposal from public.proposals where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  if v_proposal.responder_user_id is distinct from v_uid
     and not (v_proposal.responder_type = 'business' and public.has_business_scope(v_proposal.responder_entity_id, v_uid, 'leads'))
     and not (v_proposal.responder_type = 'provider' and exists(select 1 from public.providers p where p.id = v_proposal.responder_entity_id and p.user_id = v_uid))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_YOUR_PROPOSAL';
  end if;

  if v_proposal.status <> 'SUBMITTED' then
    raise exception 'INVALID_TRANSITION';
  end if;

  select * into v_request from public.requests where id = v_proposal.request_id;
  if found and v_request.status <> 'OPEN' then
    raise exception 'REQUEST_NOT_OPEN';
  end if;

  update public.proposals set status = 'WITHDRAWN' where id = p_proposal_id;
  select * into v_proposal from public.proposals where id = p_proposal_id;
  return v_proposal;
end;
$$;

revoke all on function public.withdraw_proposal(text) from public, anon;
grant execute on function public.withdraw_proposal(text) to authenticated;


create or replace function public.proposal_submit_counter(
  p_proposal_id text, p_amount numeric, p_message text default null
) returns public.proposal_counters
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
  v_counter public.proposal_counters%rowtype;
  v_other text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_proposal from public.proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_request from public.requests
  where id = v_proposal.request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if v_uid not in (v_request.requester_user_id, v_proposal.responder_user_id)
     and not (v_proposal.responder_type = 'business' and public.has_business_scope(v_proposal.responder_entity_id, v_uid, 'leads'))
     and not (v_proposal.responder_type = 'provider' and exists(select 1 from public.providers p where p.id = v_proposal.responder_entity_id and p.user_id = v_uid))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_A_PARTY';
  end if;

  if v_request.status <> 'OPEN' or v_proposal.status <> 'SUBMITTED' then
    raise exception 'NEGOTIATION_CLOSED';
  end if;

  insert into public.proposal_counters (proposal_id, by_user_id, amount, message)
  values (p_proposal_id, v_uid, p_amount, left(coalesce(p_message, ''), 1000))
  returning * into v_counter;

  -- Touch proposal updated_at so standard proposals realtime subscriptions fire
  update public.proposals set updated_at = now() where id = p_proposal_id;

  v_other := case when v_uid = v_request.requester_user_id
    then v_proposal.responder_user_id else v_request.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_other, 'PROPOSAL_COUNTER', 'New counter-offer',
      '₹' || p_amount::text || ' on "' || left(coalesce(v_request.title, 'your request'), 60) || '".',
      '/request/' || v_request.id);
  exception when others then null;
  end;

  return v_counter;
end;
$$;

revoke execute on function public.proposal_submit_counter(text, numeric, text) from public, anon;
grant execute on function public.proposal_submit_counter(text, numeric, text) to authenticated;

-- ── 6. Agreement Lifecycle RPCs Team Scope & Expiry (A1, A3, A11) ─────────────

create or replace function public.agreement_confirm(p_id text)
returns public.agreements
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
  v_other text;
  v_was_confirmed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements
  where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_agreement.status <> 'PENDING' then raise exception 'INVALID_TRANSITION'; end if;
  if v_agreement.created_at is not null
     and v_agreement.created_at <= now() - interval '12 hours' then
    raise exception 'AGREEMENT_EXPIRED';
  end if;

  if v_uid = v_agreement.requester_user_id then
    v_was_confirmed := coalesce(v_agreement.requester_confirmed, false);
    v_other := v_agreement.responder_user_id;
    update public.agreements set requester_confirmed = true where id = p_id;
  elsif v_uid = v_agreement.responder_user_id
        or (v_agreement.responder_entity_id is not null and public.has_business_scope(v_agreement.responder_entity_id, v_uid, 'leads'))
        or (v_agreement.responder_type = 'provider' and exists(select 1 from public.providers p where p.id = v_agreement.responder_entity_id and p.user_id = v_uid))
        or public.is_admin(v_uid) then
    v_was_confirmed := coalesce(v_agreement.responder_confirmed, false);
    v_other := v_agreement.requester_user_id;
    update public.agreements set responder_confirmed = true where id = p_id;
  else
    raise exception 'NOT_A_PARTY';
  end if;

  update public.agreements
  set status = 'ACTIVE'
  where id = p_id
    and coalesce(requester_confirmed, false)
    and coalesce(responder_confirmed, false);

  select * into v_agreement from public.agreements where id = p_id;

  if not v_was_confirmed and v_agreement.status = 'PENDING' and v_other is not null then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_other, 'AGREEMENT', 'Confirm within 12 hours',
        'The other side confirmed — confirm now or this agreement will auto-cancel.',
        '/agreement/' || p_id);
    exception when others then null;
    end;
  end if;

  return v_agreement;
end
$$;

revoke execute on function public.agreement_confirm(text) from public, anon;
grant execute on function public.agreement_confirm(text) to authenticated;


create or replace function public.cancel_expired_agreements()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_ag record;
begin
  -- 12-hour confirmation window for PENDING agreements
  for v_ag in
    select * from public.agreements
    where status = 'PENDING'
      and created_at < now() - interval '12 hours'
  loop
    update public.agreements set status = 'CANCELLED' where id = v_ag.id;
    update public.requests set status = 'OPEN' where id = v_ag.request_id;
    -- Only revert proposals that were accepted or rejected, protecting WITHDRAWN proposals (A11)
    update public.proposals set status = 'SUBMITTED'
    where request_id = v_ag.request_id and status in ('ACCEPTED', 'REJECTED');
  end loop;

  -- 24h payment reminder
  insert into public.notifications (user_id, type, title, body, deep_link)
  select a.requester_user_id, 'AGREEMENT', 'Payment reminder',
         'You still need to pay for "' || coalesce(a.request_title, 'your agreement')
           || '" — this deal auto-cancels after 3 days unpaid.',
         '/agreement/' || a.id
    from public.agreements a
   where a.status = 'ACTIVE'
     and coalesce(a.payment_status, 'UNPAID') in ('UNPAID', 'REJECTED')
     and a.created_at < now() - interval '24 hours'
     and not exists (
       select 1 from public.notifications n
        where n.deep_link = '/agreement/' || a.id and n.title = 'Payment reminder'
     );

  -- 72h unpaid auto-cancel
  for v_ag in
    select * from public.agreements
    where status = 'ACTIVE'
      and coalesce(payment_status, 'UNPAID') in ('UNPAID', 'REJECTED')
      and created_at < now() - interval '72 hours'
  loop
    update public.agreements set status = 'CANCELLED' where id = v_ag.id;
    update public.requests set status = 'OPEN' where id = v_ag.request_id;
    update public.proposals set status = 'SUBMITTED'
    where request_id = v_ag.request_id and status in ('ACCEPTED', 'REJECTED');

    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values
        (v_ag.requester_user_id, 'AGREEMENT', 'Agreement auto-cancelled',
         'Payment was never made for "' || coalesce(v_ag.request_title, 'your agreement') || '" — it has been cancelled.',
         '/agreement/' || v_ag.id),
        (v_ag.responder_user_id, 'AGREEMENT', 'Agreement auto-cancelled',
         'The unpaid agreement for "' || coalesce(v_ag.request_title, 'your agreement') || '" has been cancelled.',
         '/agreement/' || v_ag.id);
    exception when others then null;
    end;
  end loop;
end;
$$;

revoke execute on function public.cancel_expired_agreements() from public, anon;
grant execute on function public.cancel_expired_agreements() to authenticated;


create or replace function public.agreement_cancel(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
  v_other text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_agreement.requester_user_id
     and v_uid is distinct from v_agreement.responder_user_id
     and not (v_agreement.responder_entity_id is not null and public.has_business_scope(v_agreement.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_A_PARTY';
  end if;

  if v_agreement.status <> 'ACTIVE' then raise exception 'INVALID_TRANSITION'; end if;
  if coalesce(v_agreement.payment_status, 'UNPAID') not in ('UNPAID', 'REJECTED') then
    raise exception 'PAYMENT_IN_PROGRESS';
  end if;

  update public.agreements set status = 'CANCELLED' where id = p_id and status = 'ACTIVE';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  update public.requests set status = 'OPEN' where id = v_agreement.request_id;
  update public.proposals set status = 'SUBMITTED'
  where request_id = v_agreement.request_id and status in ('ACCEPTED', 'REJECTED');

  v_other := case when v_uid = v_agreement.requester_user_id
    then v_agreement.responder_user_id else v_agreement.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_other, 'AGREEMENT', 'Agreement cancelled',
      'The agreement for "' || coalesce(v_agreement.request_title, 'your request') || '" was cancelled before payment.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end;
$$;

revoke execute on function public.agreement_cancel(text) from public, anon;
grant execute on function public.agreement_cancel(text) to authenticated;


create or replace function public.agreement_confirm_payment(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_agreement.responder_user_id
     and not (v_agreement.responder_entity_id is not null and public.has_business_scope(v_agreement.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_RESPONDER';
  end if;

  if v_agreement.status <> 'ACTIVE' or v_agreement.payment_status <> 'PENDING_CONFIRM' then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.agreements
  set payment_status = 'PAID', status = 'DEPOSIT_PAID'
  where id = p_id and status = 'ACTIVE' and payment_status = 'PENDING_CONFIRM';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_agreement.requester_user_id, 'AGREEMENT', 'Payment confirmed ✓',
      'Your payment for "' || left(coalesce(v_agreement.request_title, 'this agreement'), 60) || '" was confirmed.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end;
$$;

revoke execute on function public.agreement_confirm_payment(text) from public, anon;
grant execute on function public.agreement_confirm_payment(text) to authenticated;


create or replace function public.agreement_reject_payment(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_agreement.responder_user_id
     and not (v_agreement.responder_entity_id is not null and public.has_business_scope(v_agreement.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_RESPONDER';
  end if;

  if v_agreement.status <> 'ACTIVE' or v_agreement.payment_status <> 'PENDING_CONFIRM' then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.agreements set payment_status = 'REJECTED'
  where id = p_id and status = 'ACTIVE' and payment_status = 'PENDING_CONFIRM';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_agreement.requester_user_id, 'AGREEMENT', 'Payment not verified',
      'Your payment claim for "' || left(coalesce(v_agreement.request_title, 'this agreement'), 60) || '" wasn''t confirmed. Try again.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end;
$$;

revoke execute on function public.agreement_reject_payment(text) from public, anon;
grant execute on function public.agreement_reject_payment(text) to authenticated;


create or replace function public.agreement_start_work(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_ag.responder_user_id
     and not (v_ag.responder_entity_id is not null and public.has_business_scope(v_ag.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_RESPONDER';
  end if;

  if v_ag.status <> 'DEPOSIT_PAID' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'IN_PROGRESS' where id = p_id;
end;
$$;

revoke execute on function public.agreement_start_work(text) from public, anon;
grant execute on function public.agreement_start_work(text) to authenticated;


create or replace function public.agreement_submit_review(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_ag.responder_user_id
     and not (v_ag.responder_entity_id is not null and public.has_business_scope(v_ag.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_RESPONDER';
  end if;

  if v_ag.status <> 'IN_PROGRESS' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'REVIEW' where id = p_id;
end;
$$;

revoke execute on function public.agreement_submit_review(text) from public, anon;
grant execute on function public.agreement_submit_review(text) to authenticated;


create or replace function public.agreement_dispute(p_id text, p_reason text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_ag public.agreements%rowtype;
  v_other text;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid not in (v_ag.requester_user_id, v_ag.responder_user_id)
     and not (v_ag.responder_entity_id is not null and public.has_business_scope(v_ag.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_A_PARTY';
  end if;

  if v_ag.status not in ('IN_PROGRESS', 'REVIEW', 'DEPOSIT_PAID', 'ACTIVE') then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.agreements set status = 'DISPUTED', dispute_reason = p_reason where id = p_id;

  v_other := case when v_uid = v_ag.requester_user_id then v_ag.responder_user_id else v_ag.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_other, 'AGREEMENT', 'Dispute raised on agreement',
      'A dispute was raised on "' || left(coalesce(v_ag.request_title, 'this agreement'), 60) || '". Reason: ' || left(coalesce(p_reason, 'None stated'), 80),
      '/agreement/' || p_id);
  exception when others then null;
  end;
end;
$$;

revoke execute on function public.agreement_dispute(text, text) from public, anon;
grant execute on function public.agreement_dispute(text, text) to authenticated;

-- ── 7. Lightweight Me Too Toggle RPC (R7) ────────────────────────────────────

create or replace function public.me_too_toggle(p_request_id text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_req public.requests%rowtype;
  v_exists boolean;
  v_count integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_req from public.requests where id = p_request_id;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'OPEN' then raise exception 'REQUEST_CLOSED'; end if;

  select exists(
    select 1 from public.request_me_toos
    where request_id = p_request_id and user_id = v_uid
  ) into v_exists;

  if v_exists then
    delete from public.request_me_toos
    where request_id = p_request_id and user_id = v_uid;

    select count(*) into v_count
    from public.request_me_toos where request_id = p_request_id;

    update public.requests set me_too_count = v_count where id = p_request_id;
    return jsonb_build_object('ok', true, 'meTooed', false, 'count', v_count);
  else
    insert into public.request_me_toos (request_id, user_id, quantity)
    values (p_request_id, v_uid, 1)
    on conflict (request_id, user_id) do nothing;

    select count(*) into v_count
    from public.request_me_toos where request_id = p_request_id;

    update public.requests set me_too_count = v_count where id = p_request_id;
    return jsonb_build_object('ok', true, 'meTooed', true, 'count', v_count);
  end if;
end;
$$;

revoke execute on function public.me_too_toggle(text) from public, anon;
grant execute on function public.me_too_toggle(text) to authenticated;

-- ── 8. Bulk Deals & Group Buy Hardening (BLK-1, BLK-2, BLK-3, BLK-4, BLK-5) ──

alter table public.bulk_deal_tokens
  add column if not exists deposit_paid numeric(10,2) default 0,
  add column if not exists balance_due numeric(10,2) default 0;

create or replace function public._bulk_deal_close_internal(
  p_deal_id text, p_trigger text, p_outcome text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_deal public.bulk_deals%rowtype;
  v_paid_qty integer;
  v_unit_price numeric;
  v_tier jsonb;
  v_deposit_paid numeric;
  v_balance_due numeric;
  m record;
begin
  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.closed_at is not null then return; end if; -- already closed

  -- BLK-1: Count pledges where deposit was PAID OR deal had no deposit requirement
  select coalesce(sum(quantity), 0) into v_paid_qty
    from public.bulk_deal_pledges
   where deal_id = p_deal_id
     and (v_deal.deposit_amount is null or v_deal.deposit_amount = 0 or deposit_status = 'PAID');

  if p_outcome is null and v_paid_qty >= v_deal.moq then
    p_outcome := 'FULFILLED';
  end if;

  update public.bulk_deals set closed_at = now(), close_outcome = p_outcome where id = p_deal_id;

  if p_outcome = 'FULFILLED' then
    select t into v_tier
      from jsonb_array_elements(coalesce(v_deal.tiers, '[]'::jsonb)) as t
     where (t->>'minQty')::numeric <= v_paid_qty
     order by (t->>'minQty')::numeric desc
     limit 1;
    v_unit_price := coalesce((v_tier->>'unitPrice')::numeric, v_deal.regular_price);

    for m in
      select user_id, quantity, deposit_amount_paid
        from public.bulk_deal_pledges
       where deal_id = p_deal_id
         and (v_deal.deposit_amount is null or v_deal.deposit_amount = 0 or deposit_status = 'PAID')
    loop
      v_deposit_paid := coalesce(m.deposit_amount_paid, 0);
      v_balance_due := greatest(0, (m.quantity * coalesce(v_unit_price, 0)) - v_deposit_paid);

      insert into public.bulk_deal_tokens (
        token_code, deal_id, holder_user_id, issuer_user_id, business_id,
        quantity, unit_price, item_label, deposit_paid, balance_due
      ) values (
        'STRYT-D-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)),
        p_deal_id, m.user_id, v_deal.owner_user_id, v_deal.business_id,
        m.quantity, v_unit_price, v_deal.title, v_deposit_paid, v_balance_due
      )
      on conflict (deal_id, holder_user_id) do update
        set unit_price = excluded.unit_price,
            deposit_paid = excluded.deposit_paid,
            balance_due = excluded.balance_due;

      insert into public.notifications (user_id, type, title, body, deep_link)
      values (m.user_id, 'BULK_DEAL_UNLOCKED', 'Claim pass ready — "' || v_deal.title || '"',
              'The campaign closed and hit its target — your claim pass is ready.', '/community/activity');
    end loop;

  elsif p_outcome = 'REFUNDED' then
    for m in select user_id from public.bulk_deal_pledges where deal_id = p_deal_id and deposit_status = 'PAID' loop
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (m.user_id, 'BULK_DEAL_REFUNDED', '"' || v_deal.title || '" didn''t reach its target',
              'The business will refund your deposit directly.', '/business/' || v_deal.business_id);
    end loop;
  end if;
end;
$$;


create or replace function public.bulk_deal_delete(p_deal_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledger text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  if v_deal.owner_user_id <> v_uid
     and not public.has_business_scope(v_deal.business_id, v_uid, 'catalog')
     and not public.is_admin(v_uid) then
    raise exception 'NOT_ALLOWED';
  end if;

  -- BLK-2: Prevent deleting campaign if active unredeemed passes exist
  if exists (
    select 1 from public.bulk_deal_tokens
    where deal_id = p_deal_id and status = 'ISSUED'
  ) then
    raise exception 'CANNOT_DELETE_ACTIVE_TOKENS';
  end if;

  for v_pledger in
    select user_id from public.bulk_deal_pledges
    where deal_id = p_deal_id and deposit_status = 'PAID'
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_pledger, 'BULK_DEAL_DEPOSIT_REJECTED', 'Campaign cancelled',
        'The business removed "' || left(v_deal.title, 60) || '" — your paid deposit needs to be sorted out with them directly.',
        '/business/' || v_deal.business_id);
    exception when others then null;
    end;
  end loop;

  delete from public.bulk_deals where id = p_deal_id;
end;
$$;

revoke execute on function public.bulk_deal_delete(text) from public, anon;
grant execute on function public.bulk_deal_delete(text) to authenticated;


create or replace function public.bulk_deal_close(p_deal_id text, p_outcome text default null)
returns public.bulk_deals
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  -- BLK-3: Support delegated team member with catalog scope
  if v_deal.owner_user_id <> v_uid
     and not public.has_business_scope(v_deal.business_id, v_uid, 'catalog')
     and not public.is_admin(v_uid) then
    raise exception 'NOT_OWNER';
  end if;

  if v_deal.closed_at is not null then raise exception 'DEAL_ALREADY_CLOSED'; end if;
  if p_outcome is not null and p_outcome not in ('FULFILLED','REFUNDED') then
    raise exception 'INVALID_OUTCOME';
  end if;

  perform public._bulk_deal_close_internal(p_deal_id, 'MANUAL', p_outcome);

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  return v_deal;
end;
$$;

revoke execute on function public.bulk_deal_close(text, text) from public, anon;
grant execute on function public.bulk_deal_close(text, text) to authenticated;


create or replace function public.bulk_deal_extend(p_deal_id text, p_new_closes_at timestamptz)
returns public.bulk_deals
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledger record;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  -- BLK-3: Support delegated team member with catalog scope
  if v_deal.owner_user_id <> v_uid
     and not public.has_business_scope(v_deal.business_id, v_uid, 'catalog')
     and not public.is_admin(v_uid) then
    raise exception 'NOT_OWNER';
  end if;

  if v_deal.close_outcome is not null then raise exception 'DEAL_ALREADY_RESOLVED'; end if;
  if p_new_closes_at <= now() then raise exception 'DEADLINE_MUST_BE_FUTURE'; end if;

  update public.bulk_deals set closes_at = p_new_closes_at, closed_at = null where id = p_deal_id
  returning * into v_deal;

  for v_pledger in select user_id from public.bulk_deal_pledges where deal_id = p_deal_id loop
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_pledger.user_id, 'BULK_DEAL_EXTENDED', '"' || v_deal.title || '" got more time',
            'The business extended this campaign — it''s still collecting pledges.', '/business/' || v_deal.business_id);
  end loop;

  return v_deal;
end;
$$;

revoke execute on function public.bulk_deal_extend(text, timestamptz) from public, anon;
grant execute on function public.bulk_deal_extend(text, timestamptz) to authenticated;


create or replace function public.bulk_deal_token_redeem(
  p_token_code text, p_business_id text default null
)
returns public.bulk_deal_tokens
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_token public.bulk_deal_tokens%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_token from public.bulk_deal_tokens
   where token_code = upper(trim(p_token_code)) for update;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;

  -- BLK-5: Guard against cross-store redemption for multi-location businesses
  if p_business_id is not null and v_token.business_id is not null and v_token.business_id <> p_business_id then
    raise exception 'WRONG_BUSINESS_LOCATION';
  end if;

  if not (
    v_token.issuer_user_id = v_uid
    or (v_token.business_id is not null and public.has_business_scope(v_token.business_id, v_uid, 'appointments'))
    or (v_token.business_id is not null and public.has_business_scope(v_token.business_id, v_uid, 'catalog'))
    or public.is_admin(v_uid)
  ) then
    raise exception 'NOT_AUTHORIZED_TO_REDEEM';
  end if;

  if v_token.status = 'REDEEMED' then raise exception 'ALREADY_REDEEMED'; end if;
  if v_token.status = 'EXPIRED' or (v_token.valid_until is not null and v_token.valid_until < now()) then
    raise exception 'TOKEN_EXPIRED';
  end if;

  update public.bulk_deal_tokens
     set status = 'REDEEMED', redeemed_at = now(), redeemed_by = v_uid
   where id = v_token.id and status = 'ISSUED'
  returning * into v_token;

  if not found then raise exception 'ALREADY_REDEEMED'; end if;
  return v_token;
end;
$$;

revoke execute on function public.bulk_deal_token_redeem(text, text) from public, anon;
grant execute on function public.bulk_deal_token_redeem(text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- START OF: 20260945_sprint6_trust_safety_reputation.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT 6: TRUST, SAFETY, REPUTATION & GOOGLE PLAY HARDENING
-- Migration: 20260945_sprint6_trust_safety_reputation.sql
-- Covers:
--  1. Rating aggregate recomputation trigger (CRAT-1)
--  2. Ratings RLS UPDATE policy (CRAT-2)
--  3. Rating notifications for businesses and solo providers (CRAT-5)
--  4. Reply to rating RPC expansion & removal (RMGR-3, RMGR-4, RMGR-7)
--  5. Location share grant re-request after expiry (LOC-4)
--  6. Live share auto-expiry & zero-recipient guard (LOC-1, ECON-2, LOC-3)
--  7. Self-vouch & self-endorsement DB guard (VOUCH-4)
--  8. Provider UPI QR code URL column (MONEY-2)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) RATINGS AGGREGATE RECOMPUTATION TRIGGER (CRAT-1) ────────────────────
-- Automatically recomputes rating_avg and rating_count on businesses, providers,
-- and users whenever a review is inserted, updated, or deleted.

create or replace function public.recompute_rating_aggregates() returns trigger as $$
declare
  v_type text := coalesce(new.ratee_type, old.ratee_type);
  v_id text := coalesce(new.ratee_id, old.ratee_id);
  v_avg numeric(3,2);
  v_count int;
begin
  select coalesce(round(avg(rating), 2), 0), count(*)
  into v_avg, v_count
  from public.ratings
  where ratee_type = v_type and ratee_id = v_id;

  if v_type = 'BUSINESS' then
    update public.businesses
    set rating_avg = v_avg, rating_count = v_count
    where id = v_id;
  elsif v_type = 'PROVIDER' then
    update public.providers
    set rating_avg = v_avg, rating_count = v_count
    where id = v_id;
  elsif v_type = 'USER' then
    update public.users
    set rating_avg = v_avg, rating_count = v_count
    where id = v_id;
  end if;

  return coalesce(new, old);
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_recompute_ratings on public.ratings;
create trigger trg_recompute_ratings
  after insert or update or delete on public.ratings
  for each row execute function public.recompute_rating_aggregates();


-- ── 2) RATINGS RLS UPDATE POLICY (CRAT-2) ──────────────────────────────────
-- Allows authenticated users to update their own existing reviews.

do $$ begin
  create policy upd_ratings on public.ratings
    for update using (rater_user_id = auth.uid()::text)
    with check (rater_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;


-- ── 3) RATING NOTIFICATIONS FOR BUSINESSES & PROVIDERS (CRAT-5) ─────────────
-- Alerts business owners and solo service providers when customers leave a review.

create or replace function public.notify_on_rating() returns trigger as $$
declare
  v_target_user text;
  v_deep_link text;
  v_name text;
begin
  if new.rater_user_id is null then
    return new;
  end if;

  select name into v_name from public.users where id = new.rater_user_id;

  if new.ratee_type = 'BUSINESS' then
    select owner_user_id into v_target_user from public.businesses where id = new.ratee_id;
    v_deep_link := '/business/' || new.ratee_id || '/manage/reviews';
  elsif new.ratee_type = 'PROVIDER' then
    select user_id into v_target_user from public.providers where id = new.ratee_id;
    v_deep_link := '/provider/' || new.ratee_id || '/manage/reviews';
  elsif new.ratee_type = 'USER' then
    v_target_user := new.ratee_id;
    v_deep_link := coalesce('/agreement/' || new.agreement_id, '/u/' || new.ratee_id);
  end if;

  if v_target_user is not null and v_target_user != new.rater_user_id then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (
        v_target_user,
        'RATING',
        'New customer review',
        coalesce(v_name, 'A customer') || ' gave ' ||
          case when new.rating >= 4 then '⭐ ' else '' end || new.rating || '/5' ||
          case when new.comment is not null and length(trim(new.comment)) > 0
               then ' — "' || left(new.comment, 80) || '"' else '' end,
        v_deep_link
      );
    exception when others then null;
    end;
  end if;

  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_on_rating on public.ratings;
create trigger trg_notify_on_rating
  after insert on public.ratings
  for each row execute function public.notify_on_rating();


-- ── 4) OWNER REPLY TO RATINGS RPC (RMGR-3, RMGR-4, RMGR-7) ─────────────────
-- Allows business owners, authorized managers, and solo providers to post or remove replies.

create or replace function public.reply_to_rating(p_rating_id text, p_reply text)
 returns ratings
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_ratee_type text;
  v_ratee_id text;
  v_owner text;
  v_is_authorized boolean := false;
  v_clean_reply text := trim(coalesce(p_reply, ''));
  v_rating public.ratings%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select ratee_type, ratee_id into v_ratee_type, v_ratee_id
  from public.ratings where id = p_rating_id;
  if not found then raise exception 'RATING_NOT_FOUND'; end if;

  if v_ratee_type = 'BUSINESS' then
    select owner_user_id into v_owner from public.businesses where id = v_ratee_id;
    if v_owner = v_uid then
      v_is_authorized := true;
    else
      -- Check team permissions
      select exists (
        select 1 from public.team_members
        where business_id = v_ratee_id::uuid
          and user_id = v_uid::uuid
          and status = 'ACTIVE'
          and (role in ('owner', 'manager') or 'support' = any(scopes) or 'leads' = any(scopes))
      ) into v_is_authorized;
    end if;
  elsif v_ratee_type = 'PROVIDER' then
    select user_id into v_owner from public.providers where id = v_ratee_id;
    if v_owner = v_uid then
      v_is_authorized := true;
    end if;
  else
    raise exception 'NOT_REPLYABLE';
  end if;

  if not v_is_authorized then
    raise exception 'FORBIDDEN';
  end if;

  if length(v_clean_reply) = 0 then
    -- Clear existing reply
    update public.ratings
    set owner_reply = null, owner_reply_at = null
    where id = p_rating_id
    returning * into v_rating;
  else
    if length(v_clean_reply) < 2 then raise exception 'REPLY_TOO_SHORT'; end if;
    update public.ratings
    set owner_reply = left(v_clean_reply, 2000), owner_reply_at = now()
    where id = p_rating_id
    returning * into v_rating;
  end if;

  return v_rating;
end
$function$;

revoke execute on function public.reply_to_rating(text, text) from public, anon;
grant execute on function public.reply_to_rating(text, text) to authenticated;


-- ── 5) LOCATION SHARE GRANT RE-REQUEST AFTER EXPIRY (LOC-4) ────────────────
-- Fixes conflict clause so expired APPROVED grants can be re-requested as PENDING.

create or replace function public.request_location_share(p_owner text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid  text := auth.uid()::text;
  v_name text;
  v_avatar text;
begin
  if v_uid is null or v_uid = p_owner then return; end if;

  insert into public.location_share_grants (owner_user_id, requester_user_id, status)
  values (p_owner, v_uid, 'PENDING')
  on conflict (owner_user_id, requester_user_id) do update
    set status = case
          when location_share_grants.status = 'APPROVED'
               and (location_share_grants.expires_at is null or location_share_grants.expires_at > now())
          then 'APPROVED'
          else 'PENDING'
        end,
        requested_at = now(),
        updated_at = now();

  select name, avatar into v_name, v_avatar from public.users where id = v_uid;
  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    p_owner, 'LOCATION_REQUEST',
    'Location request',
    coalesce(v_name, 'Someone') || ' wants to see your exact location',
    '/settings',
    jsonb_build_object('avatarUrl', v_avatar, 'actorName', v_name, 'statusPill', 'Pending', 'tone', 'warning')
  );
end $$;

revoke execute on function public.request_location_share(text) from public, anon;
grant execute on function public.request_location_share(text) to authenticated;


-- ── 6) LIVE SHARE AUTO-EXPIRY & ZERO-RECIPIENT GUARD (LOC-1, ECON-2, LOC-3) ─

alter table public.live_shares
  add column if not exists expires_at timestamptz not null default (now() + interval '8 hours');

create or replace function public.start_live_share(p_lat double precision, p_lng double precision)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid   text := auth.uid()::text;
  v_share text;
  v_name  text;
  v_pa    text;
  v_pb    text;
  v_conv  text;
  v_msg   text;
  r       record;
begin
  if v_uid is null then return null; end if;

  -- LOC-3: Reject Null Island coordinates
  if (p_lat = 0 and p_lng = 0) or p_lat is null or p_lng is null then
    raise exception 'INVALID_COORDINATES';
  end if;

  -- ECON-2: Guard against broadcasting to zero contacts
  if not exists (select 1 from public.emergency_contacts where owner_user_id = v_uid) then
    raise exception 'NO_EMERGENCY_CONTACTS';
  end if;

  -- LOC-1: Expire old sessions that exceeded their time window
  update public.live_shares
    set status = 'ENDED', ended_at = now()
    where sharer_user_id = v_uid and status = 'ACTIVE' and expires_at <= now();

  -- Resume an active unexpired session if one exists
  select id into v_share from public.live_shares
    where sharer_user_id = v_uid and status = 'ACTIVE' and expires_at > now();

  if v_share is not null then
    update public.live_shares
      set lat = p_lat, lng = p_lng, updated_at = now()
      where id = v_share;
    return v_share;
  end if;

  insert into public.live_shares (sharer_user_id, lat, lng, expires_at)
    values (v_uid, p_lat, p_lng, now() + interval '8 hours')
    returning id into v_share;

  select name into v_name from public.users where id = v_uid;

  for r in
    select contact_user_id from public.emergency_contacts where owner_user_id = v_uid
  loop
    v_pa := least(v_uid, r.contact_user_id);
    v_pb := greatest(v_uid, r.contact_user_id);
    select id into v_conv from public.conversations
      where participant_a = v_pa and participant_b = v_pb and subject_id is null
      limit 1;
    if v_conv is null then
      insert into public.conversations (participant_a, participant_b)
        values (v_pa, v_pb) returning id into v_conv;
    end if;

    insert into public.messages (conversation_id, sender_id, body, kind, meta)
      values (v_conv, v_uid, '📍 Live location', 'LIVE_LOCATION',
              jsonb_build_object('share_id', v_share, 'status', 'ACTIVE'))
      returning id into v_msg;

    update public.conversations set
      last_message_at = now(),
      last_message_preview = '📍 Live location',
      has_unread_a = (v_pa <> v_uid),
      has_unread_b = (v_pb <> v_uid)
      where id = v_conv;

    insert into public.live_share_recipients (share_id, recipient_user_id, conversation_id, message_id)
      values (v_share, r.contact_user_id, v_conv, v_msg);

    insert into public.notifications (user_id, type, title, body, deep_link)
      values (r.contact_user_id, 'LIVE_LOCATION',
              coalesce(v_name, 'Someone') || ' is sharing live location',
              'Tap to follow their location on the map',
              '/chat/' || v_conv);
  end loop;

  return v_share;
end $$;

-- Update get_live_share to reflect expired sessions as ENDED
drop function if exists public.get_live_share(text);
create or replace function public.get_live_share(p_share_id text)
returns table (
  id             text,
  sharer_user_id text,
  sharer_name    text,
  sharer_avatar  text,
  status         text,
  lat            double precision,
  lng            double precision,
  accuracy       double precision,
  heading        double precision,
  updated_at     timestamptz,
  started_at     timestamptz,
  ended_at       timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_is_recipient boolean := false;
  v_is_sharer    boolean := false;
begin
  if v_uid is null then return; end if;

  select exists (
    select 1 from public.live_shares s
    where s.id = p_share_id and s.sharer_user_id = v_uid
  ) into v_is_sharer;

  if not v_is_sharer then
    select exists (
      select 1 from public.live_share_recipients r
      where r.share_id = p_share_id and r.recipient_user_id = v_uid
    ) into v_is_recipient;
  end if;

  if not v_is_sharer and not v_is_recipient then
    return;
  end if;

  return query
  select
    s.id,
    s.sharer_user_id,
    u.name as sharer_name,
    u.avatar as sharer_avatar,
    case
      when s.status = 'ACTIVE' and s.expires_at <= now() then 'ENDED'
      else s.status
    end as status,
    s.lat,
    s.lng,
    s.accuracy,
    s.heading,
    s.updated_at,
    s.started_at,
    case
      when s.status = 'ACTIVE' and s.expires_at <= now() then s.expires_at
      else s.ended_at
    end as ended_at
  from public.live_shares s
  left join public.users u on u.id = s.sharer_user_id
  where s.id = p_share_id;
end $$;


-- ── 7) SELF-VOUCH & SELF-ENDORSEMENT DB GUARD (VOUCH-4) ────────────────────

create or replace function public.check_self_vouch() returns trigger as $$
begin
  if exists (
    select 1 from public.providers
    where id = new.provider_id and user_id = new.from_user_id
  ) then
    raise exception 'CANNOT_VOUCH_FOR_SELF';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_self_vouch on public.vouches;
create trigger trg_prevent_self_vouch
  before insert or update on public.vouches
  for each row execute function public.check_self_vouch();

drop trigger if exists trg_prevent_self_endorsement on public.endorsements;
create trigger trg_prevent_self_endorsement
  before insert or update on public.endorsements
  for each row execute function public.check_self_vouch();


-- ── 8) PROVIDER UPI QR CODE URL (MONEY-2) ──────────────────────────────────
-- Persist custom UPI payment QR code URL in Postgres rather than localStorage.

alter table public.providers
  add column if not exists upi_qr_url text;


-- ── 9) OUT-OF-RANGE APPOINTMENT REQUESTS & NON-BLOCKING CALENDAR (20260946) ─
-- Goal: Support out-of-radius booking requests that do not block the calendar until exclusively accepted.

-- 1) Add is_out_of_range column to appointments table
alter table public.appointments add column if not exists is_out_of_range boolean default false;
create index if not exists idx_appointments_out_of_range on public.appointments(target_id, scheduled_for) where is_out_of_range = true;

-- 2) Update enforce_slot_capacity trigger function
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

-- 3) Update booked_slots RPC
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

-- 4) Update appointment_create RPC
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


COMMIT;
