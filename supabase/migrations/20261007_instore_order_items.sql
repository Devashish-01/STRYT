-- ============================================================
-- 20261007 — Buy-in-place orders arrive as what was bought
--
-- A customer who taps "Buy in place" (cart or a single item) used to reach the
-- shop as a generic "New booking request — requested Walk-in — 3 items" with
-- Accept / Decline actions on an order that was already accepted, and the
-- shop's list only showed "3 items". Now:
--   1. appointment_create_walk_in_payment builds the order's name from the
--      items it stores ("Atta 5 kg x2, Milk x1"), not from a caller-supplied
--      string, so every screen and message that shows the name shows the items.
--   2. notify_on_appointment_created sends the shop a "Purchase to confirm"
--      notification for these orders (what, how much, how it was paid) with no
--      Accept / Decline.
--   3. appointment_items can be read by staff with the appointments scope, not
--      only the owner and the customer, so a team member sees the same lines.
-- Rollback: supabase/rollbacks/20261007_instore_order_items.rollback.sql
-- ============================================================

-- ── 1. Item lines readable by staff with the appointments scope ─────────────
drop policy if exists appointment_items_select on public.appointment_items;
create policy appointment_items_select on public.appointment_items
  for select
  using (exists (
    select 1 from public.appointments a
     where a.id = appointment_items.appointment_id
       and (
         (select auth.uid())::text = a.customer_user_id
         or (select auth.uid())::text = a.target_owner_user_id
         or (a.target_type = 'BUSINESS'
             and public.has_business_scope(a.target_id, (select auth.uid())::text, 'appointments'))
       )
  ));

-- ── 2. The order is named after its items ───────────────────────────────────
create or replace function public.appointment_create_walk_in_payment(
  p_target_id text,
  p_package_name text,
  p_package_price numeric,
  p_method text,
  p_reference text default null::text,
  p_items jsonb default null::jsonb
)
returns appointments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_target_avatar text;
  v_customer_name text;
  v_customer_avatar text;
  v_appointment public.appointments%rowtype;
  v_items jsonb := p_items;
  v_name text := left(trim(coalesce(p_package_name, '')), 200);
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;
  if p_package_price is null or p_package_price <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if nullif(v_name, '') is null then raise exception 'PACKAGE_NAME_REQUIRED'; end if;

  select b.owner_user_id, b.name, b.cover_image
  into v_owner, v_target_name, v_target_avatar
  from public.businesses b where b.id = p_target_id;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;
  if v_owner = v_uid then raise exception 'OWNER_CANNOT_SELF_PAY'; end if;

  select coalesce(nullif(trim(u.name), ''), 'Customer'), u.avatar
  into v_customer_name, v_customer_avatar
  from public.users u where u.id = v_uid;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  -- Name the order after what is being bought (the lines that will be stored below).
  if v_items is not null and jsonb_array_length(v_items) > 0 then
    select left(string_agg(coalesce(nullif(trim(e.elem->>'item_name'), ''), 'Item') || ' x' || (e.elem->>'quantity'), ', ' order by e.ord), 200)
      into v_name
      from jsonb_array_elements(v_items) with ordinality as e(elem, ord)
     where coalesce((e.elem->>'quantity')::int, 0) > 0;
    v_name := coalesce(v_name, left(trim(p_package_name), 200));
  end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label,
    package_id, package_name, package_price, status, is_walk_in,
    payment_method, payment_status, payment_amount, payment_reference
  ) values (
    'BUSINESS', p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, v_customer_name, v_customer_avatar,
    now(), 'Today', 'Walk-in',
    'walkin_cart', v_name, p_package_price, 'ACCEPTED', false,
    p_method, 'PENDING_CONFIRM', p_package_price,
    nullif(left(trim(coalesce(p_reference, '')), 200), '')
  ) returning * into v_appointment;

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

revoke all on function public.appointment_create_walk_in_payment(text, text, numeric, text, text, jsonb) from public, anon;
grant execute on function public.appointment_create_walk_in_payment(text, text, numeric, text, text, jsonb) to authenticated;

-- ── 3. The shop is told it is a purchase to confirm, not a booking request ──
create or replace function public.notify_on_appointment_created()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_link text;
  v_orig_time text;
begin
  v_link := case when new.target_type = 'PROVIDER'
                 then '/provider/' || new.target_id || '/manage/jobs'
                 else '/business/' || new.target_id || '/manage/appointments' end;

  if new.rescheduled_from is not null then
    select time_label into v_orig_time from public.appointments where id = new.rescheduled_from;

    if new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        new.target_owner_user_id,
        'APPOINTMENT',
        'Booking rescheduled',
        coalesce(new.customer_name, 'A customer') || ' moved their booking to ' || coalesce(new.time_label, 'a new slot')
          || coalesce(' — ' || new.package_name, ''),
        v_link,
        jsonb_build_object(
          'appointmentId', new.id,
          'avatarUrl', new.customer_avatar,
          'actorName', new.customer_name,
          'scheduledFor', new.scheduled_for,
          'dateLabel', new.date_label,
          'timeLabel', new.time_label,
          'originalTimeLabel', v_orig_time,
          'serviceName', coalesce(new.package_name, 'Appointment'),
          'amount', new.package_price,
          'amountLabel', 'Package',
          'partySize', new.party_size,
          'fulfillmentType', new.fulfillment_type,
          'statusPill', 'Rescheduled',
          'tone', 'brand',
          'actions', jsonb_build_array('ACCEPT', 'DECLINE'),
          'targetType', new.target_type,
          'targetId', new.target_id
        ),
        new.target_type,
        new.target_id
      );
    end if;

    insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
    values (
      new.customer_user_id,
      'APPOINTMENT',
      'Reschedule submitted',
      'Your new request for ' || coalesce(new.time_label, 'a slot') || ' with ' || coalesce(new.target_name, 'the shop')
        || ' is pending confirmation.',
      '/appointments',
      jsonb_build_object(
        'appointmentId', new.id,
        'avatarUrl', new.target_avatar,
        'actorName', new.target_name,
        'scheduledFor', new.scheduled_for,
        'dateLabel', new.date_label,
        'timeLabel', new.time_label,
        'originalTimeLabel', v_orig_time,
        'serviceName', coalesce(new.package_name, 'Appointment'),
        'statusPill', 'Pending',
        'tone', 'warning',
        'targetType', new.target_type,
        'targetId', new.target_id
      ),
      'CUSTOMER',
      new.customer_user_id
    );
  elsif new.package_id = 'walkin_cart' and new.target_owner_user_id is not null then
    -- "Buy in place": already accepted, so there is nothing to accept — the shop confirms the payment.
    insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
    values (
      new.target_owner_user_id,
      'APPOINTMENT',
      'Purchase to confirm',
      coalesce(new.customer_name, 'A customer') || ' bought ' || coalesce(new.package_name, 'items')
        || coalesce(' — ₹' || new.package_price::text, '')
        || case when new.payment_method = 'CASH' then ', paying cash' else ' by UPI' end
        || '. Confirm once you have received it.',
      v_link,
      jsonb_build_object(
        'appointmentId', new.id,
        'avatarUrl', new.customer_avatar,
        'actorName', new.customer_name,
        'serviceName', coalesce(new.package_name, 'Purchase'),
        'amount', new.package_price,
        'amountLabel', 'To confirm',
        'statusPill', 'Verify',
        'tone', 'warning',
        'targetType', new.target_type,
        'targetId', new.target_id
      ),
      new.target_type,
      new.target_id
    );
  elsif new.target_owner_user_id is not null then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
    values (
      new.target_owner_user_id,
      'APPOINTMENT',
      'New booking request',
      coalesce(new.customer_name, 'A customer') || ' requested ' || coalesce(new.time_label, 'a slot')
        || coalesce(' — ' || new.package_name, ''),
      v_link,
      jsonb_build_object(
        'appointmentId', new.id,
        'avatarUrl', new.customer_avatar,
        'actorName', new.customer_name,
        'scheduledFor', new.scheduled_for,
        'dateLabel', new.date_label,
        'timeLabel', new.time_label,
        'serviceName', coalesce(new.package_name, 'Appointment'),
        'amount', new.package_price,
        'amountLabel', 'Package',
        'partySize', new.party_size,
        'fulfillmentType', new.fulfillment_type,
        'statusPill', 'New',
        'tone', 'brand',
        'actions', jsonb_build_array('ACCEPT', 'DECLINE'),
        'targetType', new.target_type,
        'targetId', new.target_id
      ),
      new.target_type,
      new.target_id
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.notify_on_appointment_created() from public, anon, authenticated;

notify pgrst, 'reload schema';
