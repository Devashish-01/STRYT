-- Rollback for 20260935_reschedule_preserve_payment_and_package.sql
-- Restores live reschedule_appointment definition from snapshot 2026-09-13_after_20260958.sql

CREATE OR REPLACE FUNCTION public.reschedule_appointment(p_original_id text, p_scheduled_for timestamp with time zone, p_date_label text, p_time_label text, p_notes text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text, p_package_id text DEFAULT NULL::text, p_package_name text DEFAULT NULL::text, p_package_price numeric DEFAULT NULL::numeric)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    requested_delivery_window, party_size, rescheduled_from, target_package_key
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
    p_original_id,
    v_original.target_package_key
  ) returning * into v_new;

  -- Same purchase moved to a new slot — copy the line items rather than
  -- re-running reserve_catalog_items, which would double-decrement stock.
  insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
  select v_new.id, catalog_item_id, item_name, unit_price, quantity
  from public.appointment_items
  where appointment_id = p_original_id;

  return v_new;
end
$function$
;

revoke all on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.reschedule_appointment(p_original_id text, p_scheduled_for timestamp with time zone, p_date_label text, p_time_label text, p_notes text, p_photo_url text, p_package_id text, p_package_name text, p_package_price numeric) to authenticated, postgres, service_role;
