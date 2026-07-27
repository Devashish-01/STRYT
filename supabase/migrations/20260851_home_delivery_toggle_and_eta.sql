-- ============================================================
-- 20260851 — Home delivery: per-business opt-in + two-way ETA
--
-- APPLIED TO PRODUCTION as migration `home_delivery_toggle_and_eta`.
--
-- Until now the delivery option at booking was gated only by the client-side
-- DELIVERY_AGENT_ENABLED flag — all-or-nothing across every business.
-- `businesses.delivery_enabled` makes it a real per-business setting the owner
-- controls from Business → Settings.
--
-- ETA is two-way (product decision): the customer states a preferred window at
-- booking, the business confirms or overrides it with a real ETA when they
-- accept. Two separate columns so the customer's ask is never silently
-- overwritten by the business's answer — the owner sees both side by side.
-- ============================================================

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS requested_delivery_window text;
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS delivery_eta_text text;

-- Widen appointment_create to carry the customer's requested window. Adding a
-- parameter changes the signature, so the 15-arg version from
-- 20260848_delivery_batches_phase4.sql must be dropped, not replaced. The new
-- param has a DEFAULT, so a client still sending 15 named args resolves fine.
DROP FUNCTION IF EXISTS public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb, text, text, double precision, double precision);
CREATE OR REPLACE FUNCTION public.appointment_create(
  p_target_type text, p_target_id text, p_scheduled_for timestamptz,
  p_date_label text, p_time_label text, p_notes text DEFAULT NULL,
  p_photo_url text DEFAULT NULL, p_package_id text DEFAULT NULL,
  p_package_name text DEFAULT NULL, p_package_price numeric DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_fulfillment_type text DEFAULT 'IN_STORE',
  p_delivery_address_line text DEFAULT NULL,
  p_delivery_lat double precision DEFAULT NULL,
  p_delivery_lng double precision DEFAULT NULL,
  p_requested_delivery_window text DEFAULT NULL
) RETURNS public.appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_target_avatar text;
  v_customer_name text;
  v_customer_avatar text;
  v_appointment public.appointments%rowtype;
  v_items jsonb := p_items;
  v_delivery_ok boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;
  if p_fulfillment_type not in ('IN_STORE', 'DELIVERY') then raise exception 'INVALID_FULFILLMENT_TYPE'; end if;
  if p_fulfillment_type = 'DELIVERY' and (p_delivery_lat is null or p_delivery_lng is null) then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name, b.cover_image, b.delivery_enabled
    into v_owner, v_target_name, v_target_avatar, v_delivery_ok
    from public.businesses b where b.id = p_target_id;
  else
    select p.user_id, p.display_name, p.avatar, false
    into v_owner, v_target_name, v_target_avatar, v_delivery_ok
    from public.providers p where p.id = p_target_id;
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;

  -- The per-business toggle is enforced here, not just hidden in the UI —
  -- otherwise a crafted request could book delivery from a shop that never
  -- opted in (and has no way to fulfil it).
  if p_fulfillment_type = 'DELIVERY' and coalesce(v_delivery_ok, false) = false then
    raise exception 'DELIVERY_NOT_OFFERED';
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
    requested_delivery_window
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, v_customer_name, v_customer_avatar,
    p_scheduled_for, p_date_label, p_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    p_package_id, p_package_name, p_package_price, 'PENDING',
    p_fulfillment_type, nullif(trim(coalesce(p_delivery_address_line, '')), ''), p_delivery_lat, p_delivery_lng,
    nullif(trim(coalesce(p_requested_delivery_window, '')), '')
  ) returning * into v_appointment;

  if (v_items is null or jsonb_array_length(v_items) = 0) and p_package_id is not null then
    v_items := jsonb_build_array(jsonb_build_object(
      'catalog_item_id', p_package_id,
      'item_name', coalesce(p_package_name, 'Item'),
      'unit_price', coalesce(p_package_price, 0),
      'quantity', 1
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
$$;

REVOKE ALL ON FUNCTION public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb, text, text, double precision, double precision, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb, text, text, double precision, double precision, text) TO authenticated;

-- Accept a booking and stamp the confirmed delivery ETA in one atomic step, so
-- a delivery booking can never end up ACCEPTED with no ETA the customer was
-- promised. Scope-gated the same way appointment_transition is.
CREATE OR REPLACE FUNCTION public.appointment_accept_with_eta(p_id text, p_eta_text text)
RETURNS public.appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_uid text := auth.uid()::text;
  v_apt public.appointments%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_apt from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if v_apt.target_type <> 'BUSINESS'
     or not public.has_business_scope(v_apt.target_id, v_uid, 'appointments') then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_apt.status <> 'PENDING' then raise exception 'INVALID_TRANSITION'; end if;

  update public.appointments
     set status = 'ACCEPTED',
         delivery_eta_text = nullif(trim(coalesce(p_eta_text, '')), '')
   where id = p_id returning * into v_apt;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      v_apt.customer_user_id, 'APPOINTMENT', 'Booking accepted ✓',
      case when v_apt.fulfillment_type = 'DELIVERY' and v_apt.delivery_eta_text is not null
           then coalesce(v_apt.target_name, 'The shop') || ' accepted your delivery — arriving in ' || v_apt.delivery_eta_text || '.'
           else coalesce(v_apt.target_name, 'The shop') || ' accepted your booking.' end,
      '/appointments'
    );
  exception when others then null; end;

  return v_apt;
end $$;

REVOKE ALL ON FUNCTION public.appointment_accept_with_eta(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.appointment_accept_with_eta(text, text) TO authenticated;
