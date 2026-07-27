-- ============================================================
-- 20260857 — Notification dedup, reschedule/walk-in party size
--
-- APPLIED TO PRODUCTION 2026-07-27 across three migrations:
--   fix_dup_notification_and_party_size_propagation
--   reschedule_restore_guards_with_party_size   (corrects the one above)
--   walk_in_party_size
-- Consolidated here into the FINAL correct state — the middle migration
-- rewrote reschedule_appointment from scratch and unintentionally dropped
-- guards present in the 20260835 original (the is_walk_in rejection, an
-- optimistic-concurrency check, the "Rescheduled" note, 2000-char notes
-- truncation). The follow-up migration restored them. This file reflects only
-- the corrected, final version — not the intermediate regression.
--
-- Three fixes, found auditing commit ba77eae:
--
-- 1) DUPLICATE NOTIFICATION. trg_notify_appointment_status (ROW AFTER) already
--    inserted "Booking confirmed ✓" on status→ACCEPTED, and
--    appointment_accept_with_eta inserted its OWN "Booking accepted ✓" — every
--    delivery acceptance sent the customer two notifications and two pushes.
--    The trigger now owns the message and appends the ETA; the RPC no longer
--    notifies.
-- 2) reschedule_appointment dropped party_size, silently shrinking a party of
--    3 to 1 on reschedule. It now carries party_size, fulfillment_type,
--    delivery_address_line/lat/lng, and requested_delivery_window forward
--    (the original predated home delivery, so it never carried those either —
--    rescheduling a DELIVERY booking used to silently revert it to IN_STORE).
-- 3) appointment_create_walk_in gains p_party_size so an owner can record a
--    party booking manually. Validation lives in the existing
--    trg_enforce_slot_capacity trigger — no new logic needed here.
-- ============================================================

-- ── 1a) Trigger owns the acceptance message, ETA included ────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_appointment_status()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status then
    if new.status = 'ACCEPTED' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking confirmed ✓',
              coalesce(new.target_name, 'The shop') || ' confirmed your ' || coalesce(new.time_label, 'appointment')
                -- Delivery bookings carry the ETA the owner promised at accept
                -- time, so the customer gets one message with everything in it.
                || case when new.fulfillment_type = 'DELIVERY' and nullif(trim(coalesce(new.delivery_eta_text, '')), '') is not null
                        then ' — arriving in ' || new.delivery_eta_text
                        else '' end
                || '.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Confirmed', 'tone', 'success'));
    elsif new.status = 'REJECTED' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking declined',
              coalesce(new.target_name, 'The shop') || ' couldn''t take your ' || coalesce(new.time_label, 'booking') || '. Try another slot.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Declined', 'tone', 'danger'));
    elsif new.status = 'NO_SHOW' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Marked as no-show',
              coalesce(new.target_name, 'The shop') || ' marked you as a no-show for your ' || coalesce(new.time_label, 'appointment') || '.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'No-show', 'tone', 'warning'));
    elsif new.status = 'CANCELLED' and new.cancelled_by = 'SYSTEM' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking auto-cancelled',
              coalesce(new.target_name, 'The shop') || ' didn''t respond in time, so your ' || coalesce(new.time_label, 'appointment') || ' was auto-cancelled.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Cancelled', 'tone', 'danger'));
    elsif new.status = 'CANCELLED' and coalesce(new.cancelled_by, '') <> 'CUSTOMER' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking cancelled',
              coalesce(new.target_name, 'The shop') || ' cancelled your ' || coalesce(new.time_label, 'appointment') || '.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Cancelled', 'tone', 'danger'));
    elsif new.status = 'CANCELLED' and new.cancelled_by = 'CUSTOMER' and new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.target_owner_user_id, 'APPOINTMENT', 'Booking cancelled by customer',
              coalesce(new.customer_name, 'A customer') || ' cancelled their ' || coalesce(new.time_label, 'appointment') || '.',
              case when new.target_type = 'PROVIDER'
                   then '/provider/' || new.target_id || '/manage/jobs'
                   else '/business/' || new.target_id || '/manage/appointments' end,
              jsonb_build_object('avatarUrl', new.customer_avatar, 'actorName', new.customer_name, 'statusPill', 'Cancelled', 'tone', 'neutral'));
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status then
    if new.payment_status = 'PAID' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Payment confirmed ✓',
              coalesce(new.target_name, 'The shop') || ' confirmed your payment.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'amount', new.payment_amount, 'amountLabel', 'Paid', 'statusPill', 'Paid', 'tone', 'success'));
    elsif new.payment_status = 'PENDING_CONFIRM' and new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.target_owner_user_id, 'APPOINTMENT', 'Payment claim to verify',
              coalesce(new.customer_name, 'A customer') || ' says they paid'
                || coalesce(' ₹' || new.payment_amount::text, '') || ' — confirm or reject in your console.',
              case when new.target_type = 'PROVIDER'
                   then '/provider/' || new.target_id || '/manage/jobs'
                   else '/business/' || new.target_id || '/manage/appointments' end,
              jsonb_build_object('avatarUrl', new.customer_avatar, 'actorName', new.customer_name, 'amount', new.payment_amount, 'amountLabel', 'Claimed', 'statusPill', 'Verify', 'tone', 'warning'));
    elsif new.payment_status = 'REJECTED' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Payment not verified',
              coalesce(new.target_name, 'The shop') || ' couldn''t verify your payment. Please retry.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Rejected', 'tone', 'danger'));
    end if;
  end if;

  return new;
end $function$;

-- ── 1b) accept_with_eta stops notifying (the trigger does it now) ────────────
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

  -- Set the ETA and the status in one UPDATE so the AFTER trigger sees both and
  -- can put the ETA in its message. No notification inserted here — doing so
  -- duplicated the trigger's.
  update public.appointments
     set status = 'ACCEPTED',
         delivery_eta_text = nullif(trim(coalesce(p_eta_text, '')), '')
   where id = p_id returning * into v_apt;

  return v_apt;
end $$;

REVOKE ALL ON FUNCTION public.appointment_accept_with_eta(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.appointment_accept_with_eta(text, text) TO authenticated;

-- ── 2) reschedule — FINAL corrected version (restores 20260835's guards,
--      carries party_size + delivery fields forward) ────────────────────────
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_original_id text, p_scheduled_for timestamptz,
  p_date_label text, p_time_label text, p_notes text default null,
  p_photo_url text default null, p_package_id text default null,
  p_package_name text default null, p_package_price numeric default null
) RETURNS public.appointments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Walk-ins are stamped with the OWNER's uid as customer_user_id — without
  -- this a walk-in could be "rescheduled" through the customer path.
  if v_original.customer_user_id is distinct from v_uid or v_original.is_walk_in then
    raise exception 'NOT_YOUR_BOOKING';
  end if;
  if v_original.status not in ('PENDING', 'ACCEPTED') then
    raise exception 'INVALID_TRANSITION';
  end if;

  -- Cancel the original first so its spots are freed before the capacity
  -- trigger evaluates the replacement (otherwise moving within an
  -- almost-full slot would contend with itself). Optimistic-concurrency
  -- check via GET DIAGNOSTICS alongside the row lock.
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
    requested_delivery_window, party_size, rescheduled_from
  ) values (
    v_original.target_type, v_original.target_id, v_original.target_owner_user_id,
    v_original.target_name, v_original.target_avatar,
    v_uid, v_original.customer_name, v_original.customer_avatar,
    p_scheduled_for, p_date_label, p_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    p_package_id, p_package_name, p_package_price,
    v_original.fulfillment_type, v_original.delivery_address_line,
    v_original.delivery_lat, v_original.delivery_lng,
    v_original.requested_delivery_window,
    -- The actual fix: a party of 3 stayed a party of 3 — this used to
    -- silently default to 1, dropping spots the customer had booked.
    coalesce(v_original.party_size, 1),
    p_original_id
  ) returning * into v_new;

  -- Same purchase moved to a new slot — copy the line items rather than
  -- re-running reserve_catalog_items, which would double-decrement stock.
  insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
  select v_new.id, catalog_item_id, item_name, unit_price, quantity
  from public.appointment_items
  where appointment_id = p_original_id;

  return v_new;
end
$$;

REVOKE ALL ON FUNCTION public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) TO authenticated;

-- ── 3) walk-in party size ────────────────────────────────────────────────────
-- Adding a parameter changes the signature, so the 11-arg version is dropped
-- first (this project's established convention).
DROP FUNCTION IF EXISTS public.appointment_create_walk_in(text, text, text, text, timestamptz, text, text, text, text, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.appointment_create_walk_in(
  p_target_type text, p_target_id text, p_customer_name text, p_customer_phone text,
  p_scheduled_for timestamptz, p_date_label text, p_time_label text,
  p_package_id text DEFAULT NULL, p_package_name text DEFAULT NULL,
  p_package_price numeric DEFAULT NULL, p_items jsonb DEFAULT NULL,
  p_party_size int DEFAULT 1
) RETURNS public.appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    notes, package_id, package_name, package_price, status, is_walk_in, party_size
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, left(trim(p_customer_name), 200), p_scheduled_for,
    p_date_label, p_time_label,
    case when nullif(trim(coalesce(p_customer_phone, '')), '') is null
      then 'Walk-in'
      else 'Walk-in • ' || left(trim(p_customer_phone), 30) end,
    p_package_id, p_package_name, p_package_price, 'ACCEPTED', true, coalesce(p_party_size, 1)
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
$function$;

REVOKE ALL ON FUNCTION public.appointment_create_walk_in(text, text, text, text, timestamptz, text, text, text, text, numeric, jsonb, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.appointment_create_walk_in(text, text, text, text, timestamptz, text, text, text, text, numeric, jsonb, int) TO authenticated;
