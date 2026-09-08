-- Migration 20260935: Ensure reschedule_appointment preserves payment details & package info
--
-- When a customer reschedules an appointment:
-- 1. Preserve payment_status, payment_method, payment_amount, payment_reference from original row
-- 2. Preserve package_id, package_name, package_price via coalesce if not explicitly overridden

create or replace function public.reschedule_appointment(
  p_original_id text, p_scheduled_for timestamptz,
  p_date_label text, p_time_label text, p_notes text default null,
  p_photo_url text default null, p_package_id text default null,
  p_package_name text default null, p_package_price numeric default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
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

  -- Cancel the original first so its spots are freed before capacity check
  update public.appointments
  set status = 'CANCELLED', cancelled_by = 'CUSTOMER',
      response_note = coalesce(response_note, 'Rescheduled')
  where id = p_original_id and status = v_original.status;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'INVALID_TRANSITION'; end if;

  -- Insert replacement row, carrying forward payment status & package snapshot
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

  -- Copy line items to new appointment
  insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
  select v_new.id, catalog_item_id, item_name, unit_price, quantity
  from public.appointment_items
  where appointment_id = p_original_id;

  return v_new;
end
$$;

revoke all on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) from public, anon;
grant execute on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) to authenticated;
