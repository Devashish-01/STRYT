-- Migration 20261005: delivery order lifecycle, the way the delivery platforms run it.
--
-- Why: archive/docs/engineering/DELIVERY_SYSTEM_AS_BUILT.md (defects D1–D13, GAPS_LOG #34). A delivery order was being closed by a
-- clock (sweep_my_appointments) minutes after it was placed, long before any rider had touched it.
--
-- The model implemented here (DoorDash / Uber Eats / Swiggy pattern):
--   * An order moves on EVENTS — the shop accepts, the shop marks it ready, a courier picks up, arrives, hands over — never on a
--     timer. The only timers are on the *waiting* states (shop must accept; someone must be sent), and they escalate then expire.
--   * A courier can pick an order up only once the shop has marked it ready (a shop owner delivering their own order is exempt).
--   * Reassigning starts the delivery over for the new rider; the old rider is told.
--   * A customer cannot cancel once the order has left the shop; a delivery is never a "no-show".
--   * Hand-over codes come from a cryptographic source; positions are erased when a delivery ends.
--   * Everything that happens to an order is written to an audit log (order_events).
--   * Stock reserved for an order is returned when the order is cancelled or declined.
--
-- Applying: run this whole file once in the Supabase SQL editor. Rollback: supabase/rollbacks/20261005_delivery_order_lifecycle.rollback.sql.
-- Safe for the app that is already deployed: no signature the deployed app calls changes; my_deliveries() only gains trailing columns.

-- ── 0. Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────
-- A 6-digit hand-over code from gen_random_uuid() (a cryptographically secure source), not random() (a predictable PRNG).
create or replace function public.new_handoff_code()
returns text
language sql
volatile
set search_path to 'public'
as $function$
  select lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 7))::bit(28))::bigint % 1000000)::text, 6, '0')
$function$;

revoke all on function public.new_handoff_code() from public, anon, authenticated;

alter table public.appointments add column if not exists overdue_nudged_at timestamptz;

-- ── 1. Audit log ────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  appointment_id text not null references public.appointments(id) on delete cascade,
  delivery_id text,
  event text not null,
  actor text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_events_appointment_idx on public.order_events (appointment_id, created_at);

alter table public.order_events enable row level security;
drop policy if exists order_events_select on public.order_events;
create policy order_events_select on public.order_events for select to authenticated
  using (exists (
    select 1 from public.appointments a
     where a.id = order_events.appointment_id
       and (a.customer_user_id = (select auth.uid())::text
            or a.target_owner_user_id = (select auth.uid())::text
            or (a.target_type = 'BUSINESS' and public.has_business_scope(a.target_id, (select auth.uid())::text, 'appointments')))
  ));
revoke all on public.order_events from anon, authenticated;
grant select on public.order_events to authenticated;

create or replace function public.tg_log_order_events()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor text := coalesce(auth.uid()::text, 'SYSTEM');
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (appointment_id, event, actor, detail)
    values (new.id, 'ORDER_PLACED', v_actor, jsonb_build_object('fulfillment', new.fulfillment_type, 'asap', new.is_asap));
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.order_events (appointment_id, event, actor, detail)
    values (new.id, 'ORDER_' || new.status, v_actor,
            jsonb_build_object('from', old.status, 'cancelled_by', new.cancelled_by, 'note', new.response_note));
  end if;
  if old.ready_at is null and new.ready_at is not null then
    insert into public.order_events (appointment_id, event, actor) values (new.id, 'ORDER_PACKED', v_actor);
  end if;
  if old.cash_collected_at is null and new.cash_collected_at is not null then
    insert into public.order_events (appointment_id, event, actor, detail)
    values (new.id, 'CASH_COLLECTED', v_actor, jsonb_build_object('amount', new.cash_collected_amount));
  end if;
  if old.cash_settled_at is null and new.cash_settled_at is not null then
    insert into public.order_events (appointment_id, event, actor) values (new.id, 'CASH_SETTLED', v_actor);
  end if;
  return new;
end $function$;

revoke all on function public.tg_log_order_events() from public, anon, authenticated;

drop trigger if exists trg_log_order_events_ins on public.appointments;
create trigger trg_log_order_events_ins after insert on public.appointments
  for each row execute function public.tg_log_order_events();
drop trigger if exists trg_log_order_events_upd on public.appointments;
create trigger trg_log_order_events_upd after update of status, ready_at, cash_collected_at, cash_settled_at on public.appointments
  for each row execute function public.tg_log_order_events();

create or replace function public.tg_log_delivery_events()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor text := coalesce(auth.uid()::text, 'SYSTEM');
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (appointment_id, delivery_id, event, actor, detail)
    values (new.appointment_id, new.id, 'DELIVERY_ASSIGNED', v_actor,
            jsonb_build_object('agent', new.agent_user_id, 'batch', new.batch_id));
    return new;
  end if;
  if tg_op = 'DELETE' then
    -- Skipped when the order itself is being deleted (the cascade has already removed it).
    if exists (select 1 from public.appointments a where a.id = old.appointment_id) then
      insert into public.order_events (appointment_id, delivery_id, event, actor, detail)
      values (old.appointment_id, old.id, 'DELIVERY_REMOVED', v_actor, jsonb_build_object('agent', old.agent_user_id));
    end if;
    return old;
  end if;
  if new.agent_user_id is distinct from old.agent_user_id then
    insert into public.order_events (appointment_id, delivery_id, event, actor, detail)
    values (new.appointment_id, new.id, 'DELIVERY_REASSIGNED', v_actor,
            jsonb_build_object('from', old.agent_user_id, 'to', new.agent_user_id));
  end if;
  if new.status is distinct from old.status then
    insert into public.order_events (appointment_id, delivery_id, event, actor, detail)
    values (new.appointment_id, new.id, 'DELIVERY_' || new.status, v_actor,
            jsonb_build_object('from', old.status, 'reason', new.cancel_reason));
  end if;
  if old.picked_up_at is null and new.picked_up_at is not null then
    insert into public.order_events (appointment_id, delivery_id, event, actor) values (new.appointment_id, new.id, 'DELIVERY_PICKED_UP', v_actor);
  end if;
  if not old.handoff_verified and new.handoff_verified then
    insert into public.order_events (appointment_id, delivery_id, event, actor) values (new.appointment_id, new.id, 'DELIVERY_HANDOFF_VERIFIED', v_actor);
  end if;
  if old.proof_at is null and new.proof_at is not null then
    insert into public.order_events (appointment_id, delivery_id, event, actor) values (new.appointment_id, new.id, 'DELIVERY_PROOF_RECORDED', v_actor);
  end if;
  return new;
end $function$;

revoke all on function public.tg_log_delivery_events() from public, anon, authenticated;

-- Two triggers: the update one is limited to the columns that mean something, so the rider's position stream (a write every ~2 s) never fires it.
drop trigger if exists trg_log_delivery_events on public.appointment_deliveries;
drop trigger if exists trg_log_delivery_events_insdel on public.appointment_deliveries;
create trigger trg_log_delivery_events_insdel after insert or delete on public.appointment_deliveries
  for each row execute function public.tg_log_delivery_events();
drop trigger if exists trg_log_delivery_events_upd on public.appointment_deliveries;
create trigger trg_log_delivery_events_upd after update of agent_user_id, status, picked_up_at, handoff_verified, proof_at on public.appointment_deliveries
  for each row execute function public.tg_log_delivery_events();

-- ── 2. Positions are erased when a delivery or run ends ─────────────────────────────────────────────────────────────────
create or replace function public.tg_erase_delivery_position()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.lat := null; new.lng := null; new.heading := null; new.position_at := null;
  return new;
end $function$;

revoke all on function public.tg_erase_delivery_position() from public, anon, authenticated;

drop trigger if exists trg_erase_delivery_position on public.appointment_deliveries;
create trigger trg_erase_delivery_position before update of status on public.appointment_deliveries
  for each row when (new.status in ('DELIVERED', 'CANCELLED') and old.status is distinct from new.status)
  execute function public.tg_erase_delivery_position();

create or replace function public.tg_erase_batch_position()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.lat := null; new.lng := null; new.accuracy := null; new.heading := null; new.position_at := null;
  return new;
end $function$;

revoke all on function public.tg_erase_batch_position() from public, anon, authenticated;

drop trigger if exists trg_erase_batch_position on public.delivery_batches;
create trigger trg_erase_batch_position before update of status on public.delivery_batches
  for each row when (new.status in ('COMPLETED', 'CANCELLED', 'DECLINED') and old.status is distinct from new.status)
  execute function public.tg_erase_batch_position();

-- ── 3. Stock reserved for an order comes back when the order is cancelled or declined ──────────────────────────────────
-- reserve_catalog_items() takes FINITE stock when an order is placed. Nothing ever returned it, so every cancelled or declined order
-- permanently reduced what the shop could sell. An item the owner switched to OUT_OF_STOCK by hand (quantity still > 0) stays that way.
create or replace function public.tg_restock_on_order_end()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record;
begin
  for r in select ai.catalog_item_id, ai.quantity from public.appointment_items ai where ai.appointment_id = new.id loop
    update public.catalog_items ci
       set quantity = coalesce(ci.quantity, 0) + r.quantity,
           stock_status = case when coalesce(ci.quantity, 0) <= 0 and ci.stock_status = 'OUT_OF_STOCK' then 'IN_STOCK' else ci.stock_status end
     where ci.id::text = r.catalog_item_id and ci.inventory_type = 'FINITE';
  end loop;
  return new;
end $function$;

revoke all on function public.tg_restock_on_order_end() from public, anon, authenticated;

drop trigger if exists trg_restock_on_order_end on public.appointments;
create trigger trg_restock_on_order_end after update of status on public.appointments
  for each row when (new.status in ('CANCELLED', 'REJECTED') and old.status in ('PENDING', 'ACCEPTED'))
  execute function public.tg_restock_on_order_end();

-- ── 4. The clock no longer decides what happens to a delivery order (D1, D2) ───────────────────────────────────────────
-- Slot bookings keep their rules: a PENDING one whose time has passed was never answered; an ACCEPTED one whose time has passed happened.
-- A delivery order is different: it is finished by a rider handing it over (tg_complete_appointment_on_delivery), not by the time.
-- ASAP orders have their own, longer expiry (expire_stale_asap_orders: 30 minutes), and an overdue accepted order escalates below.
create or replace function public.sweep_my_appointments()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  update public.appointments
  set status = 'CANCELLED', cancelled_by = 'SYSTEM',
      response_note = coalesce(response_note, 'business not responded')
  where status = 'PENDING' and scheduled_for <= now() and not is_asap
    and (customer_user_id = v_uid or target_owner_user_id = v_uid
      or (target_type = 'BUSINESS' and public.has_business_access(target_id, v_uid)));

  update public.appointments set status = 'COMPLETED'
  where status = 'ACCEPTED' and scheduled_for <= now() and fulfillment_type is distinct from 'DELIVERY'
    and (customer_user_id = v_uid or target_owner_user_id = v_uid
      or (target_type = 'BUSINESS' and public.has_business_access(target_id, v_uid)));
end
$function$;

revoke all on function public.sweep_my_appointments() from public, anon;
grant execute on function public.sweep_my_appointments() to authenticated;

-- An accepted delivery order that nobody is carrying: tell the shop once when it is 15 minutes past its promised time; after 3 hours
-- with no rider on the road, close it so it cannot sit open forever (the customer is told, stock is returned, a waiting rider is stood down).
create or replace function public.escalate_overdue_delivery_orders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_mgr text;
  v_n integer := 0;
  v_closed integer := 0;
begin
  for r in
    select a.id, a.target_id, a.customer_name from public.appointments a
     where a.status = 'ACCEPTED' and a.fulfillment_type = 'DELIVERY' and a.target_type = 'BUSINESS'
       and a.overdue_nudged_at is null and a.scheduled_for <= now() - interval '15 minutes'
       and not exists (select 1 from public.appointment_deliveries d
                        where d.appointment_id = a.id and d.status in ('ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'DELIVERED'))
     for update skip locked
  loop
    for v_mgr in select public.business_manager_ids(r.target_id) loop
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        v_mgr, 'DELIVERY', 'Order is overdue — no rider assigned',
        coalesce(r.customer_name, 'A customer') || '''s delivery was promised a while ago and nobody is carrying it. Assign a rider now.',
        '/business/' || r.target_id || '/manage/appointments?tab=deliveries',
        jsonb_build_object('appointmentId', r.id, 'statusPill', 'Overdue', 'tone', 'danger', 'actions', jsonb_build_array('REASSIGN_DELIVERY')),
        'BUSINESS', r.target_id
      );
    end loop;
    update public.appointments set overdue_nudged_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;

  update public.appointments a
     set status = 'CANCELLED', cancelled_by = 'SYSTEM',
         response_note = 'We couldn''t get this order delivered in time'
   where a.status = 'ACCEPTED' and a.fulfillment_type = 'DELIVERY' and a.scheduled_for <= now() - interval '3 hours'
     and not exists (select 1 from public.appointment_deliveries d
                      where d.appointment_id = a.id and d.status in ('EN_ROUTE', 'ARRIVED', 'DELIVERED'));
  get diagnostics v_closed = row_count;

  return v_n + v_closed;
end $function$;

revoke all on function public.escalate_overdue_delivery_orders() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('escalate-overdue-delivery-orders', '*/5 * * * *', 'select public.escalate_overdue_delivery_orders();');
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $cron$;

-- The customer message for a system cancellation said "the shop didn't respond" whatever the reason. Say what happened.
create or replace function public.notify_on_appointment_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status is distinct from old.status then
    if new.status = 'ACCEPTED' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        new.customer_user_id,
        'APPOINTMENT',
        'Booking confirmed ✓',
        coalesce(new.target_name, 'The shop') || ' confirmed your ' || coalesce(new.time_label, 'appointment')
          || case when new.fulfillment_type = 'DELIVERY' and nullif(trim(coalesce(new.delivery_eta_text, '')), '') is not null
                  then ' — arriving in ' || new.delivery_eta_text
                  else '' end
          || '.',
        '/appointments',
        jsonb_build_object(
          'appointmentId', new.id,
          'avatarUrl', new.target_avatar,
          'actorName', new.target_name,
          'scheduledFor', new.scheduled_for,
          'dateLabel', new.date_label,
          'timeLabel', new.time_label,
          'serviceName', coalesce(new.package_name, 'Appointment'),
          'amount', new.package_price,
          'amountLabel', 'Fee',
          'partySize', new.party_size,
          'fulfillmentType', new.fulfillment_type,
          'statusPill', 'Confirmed',
          'tone', 'success',
          'actions', jsonb_build_array('CALENDAR', 'RESCHEDULE'),
          'targetType', new.target_type,
          'targetId', new.target_id
        ),
        'CUSTOMER',
        new.customer_user_id
      );
    elsif new.status = 'REJECTED' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        new.customer_user_id,
        'APPOINTMENT',
        'Booking declined',
        coalesce(new.target_name, 'The shop') || ' couldn''t take your ' || coalesce(new.time_label, 'booking')
          || case when nullif(trim(coalesce(new.response_note, '')), '') is not null then ': ' || new.response_note else '. Try another slot.' end,
        '/appointments',
        jsonb_build_object(
          'appointmentId', new.id,
          'avatarUrl', new.target_avatar,
          'actorName', new.target_name,
          'scheduledFor', new.scheduled_for,
          'dateLabel', new.date_label,
          'timeLabel', new.time_label,
          'serviceName', coalesce(new.package_name, 'Appointment'),
          'statusPill', 'Declined',
          'tone', 'danger',
          'reason', new.response_note,
          'targetType', new.target_type,
          'targetId', new.target_id
        ),
        'CUSTOMER',
        new.customer_user_id
      );
    elsif new.status = 'NO_SHOW' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        new.customer_user_id,
        'APPOINTMENT',
        'Marked as no-show',
        coalesce(new.target_name, 'The shop') || ' marked you as a no-show for your ' || coalesce(new.time_label, 'appointment') || '.',
        '/appointments',
        jsonb_build_object(
          'appointmentId', new.id,
          'avatarUrl', new.target_avatar,
          'actorName', new.target_name,
          'scheduledFor', new.scheduled_for,
          'dateLabel', new.date_label,
          'timeLabel', new.time_label,
          'serviceName', coalesce(new.package_name, 'Appointment'),
          'statusPill', 'No-show',
          'tone', 'warning',
          'targetType', new.target_type,
          'targetId', new.target_id
        ),
        'CUSTOMER',
        new.customer_user_id
      );
    elsif new.status = 'CANCELLED' and new.cancelled_by = 'SYSTEM' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        new.customer_user_id,
        'APPOINTMENT',
        'Booking auto-cancelled',
        coalesce(new.target_name, 'The shop')
          || case when nullif(trim(coalesce(new.response_note, '')), '') is not null and new.response_note !~* 'respond'
                  then ' couldn''t complete your ' || coalesce(new.time_label, 'appointment') || ': ' || new.response_note
                  else ' didn''t respond in time, so your ' || coalesce(new.time_label, 'appointment') || ' was auto-cancelled.' end,
        '/appointments',
        jsonb_build_object(
          'appointmentId', new.id,
          'avatarUrl', new.target_avatar,
          'actorName', new.target_name,
          'scheduledFor', new.scheduled_for,
          'dateLabel', new.date_label,
          'timeLabel', new.time_label,
          'serviceName', coalesce(new.package_name, 'Appointment'),
          'statusPill', 'Cancelled',
          'tone', 'danger',
          'targetType', new.target_type,
          'targetId', new.target_id
        ),
        'CUSTOMER',
        new.customer_user_id
      );
    elsif new.status = 'CANCELLED' and coalesce(new.cancelled_by, '') <> 'CUSTOMER' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        new.customer_user_id,
        'APPOINTMENT',
        'Booking cancelled',
        coalesce(new.target_name, 'The shop') || ' cancelled your ' || coalesce(new.time_label, 'appointment')
          || case when nullif(trim(coalesce(new.response_note, '')), '') is not null then ': ' || new.response_note else '.' end,
        '/appointments',
        jsonb_build_object(
          'appointmentId', new.id,
          'avatarUrl', new.target_avatar,
          'actorName', new.target_name,
          'scheduledFor', new.scheduled_for,
          'dateLabel', new.date_label,
          'timeLabel', new.time_label,
          'serviceName', coalesce(new.package_name, 'Appointment'),
          'statusPill', 'Cancelled',
          'tone', 'danger',
          'reason', new.response_note,
          'targetType', new.target_type,
          'targetId', new.target_id
        ),
        'CUSTOMER',
        new.customer_user_id
      );
    elsif new.status = 'CANCELLED' and new.cancelled_by = 'CUSTOMER' and new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        new.target_owner_user_id,
        'APPOINTMENT',
        'Booking cancelled by customer',
        coalesce(new.customer_name, 'A customer') || ' cancelled their ' || coalesce(new.time_label, 'appointment') || '.',
        case when new.target_type = 'PROVIDER'
             then '/provider/' || new.target_id || '/manage/jobs'
             else '/business/' || new.target_id || '/manage/appointments' end,
        jsonb_build_object(
          'appointmentId', new.id,
          'avatarUrl', new.customer_avatar,
          'actorName', new.customer_name,
          'scheduledFor', new.scheduled_for,
          'dateLabel', new.date_label,
          'timeLabel', new.time_label,
          'serviceName', coalesce(new.package_name, 'Appointment'),
          'statusPill', 'Cancelled',
          'tone', 'neutral',
          'targetType', new.target_type,
          'targetId', new.target_id
        ),
        new.target_type,
        new.target_id
      );
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status then
    if new.payment_status = 'PAID' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        new.customer_user_id,
        'APPOINTMENT',
        'Payment confirmed ✓',
        coalesce(new.target_name, 'The shop') || ' confirmed your payment.',
        '/appointments',
        jsonb_build_object(
          'appointmentId', new.id,
          'avatarUrl', new.target_avatar,
          'actorName', new.target_name,
          'amount', new.payment_amount,
          'amountLabel', 'Paid',
          'statusPill', 'Paid',
          'tone', 'success',
          'targetType', new.target_type,
          'targetId', new.target_id
        ),
        'CUSTOMER',
        new.customer_user_id
      );
    elsif new.payment_status = 'PENDING_CONFIRM' and new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        new.target_owner_user_id,
        'APPOINTMENT',
        'Payment claim to verify',
        coalesce(new.customer_name, 'A customer') || ' says they paid'
          || coalesce(' ₹' || new.payment_amount::text, '') || ' — confirm or reject in your console.',
        case when new.target_type = 'PROVIDER'
             then '/provider/' || new.target_id || '/manage/jobs'
             else '/business/' || new.target_id || '/manage/appointments' end,
        jsonb_build_object(
          'appointmentId', new.id,
          'avatarUrl', new.customer_avatar,
          'actorName', new.customer_name,
          'amount', new.payment_amount,
          'amountLabel', 'Claimed',
          'statusPill', 'Verify',
          'tone', 'warning',
          'targetType', new.target_type,
          'targetId', new.target_id
        ),
        new.target_type,
        new.target_id
      );
    elsif new.payment_status = 'REJECTED' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        new.customer_user_id,
        'APPOINTMENT',
        'Payment not verified',
        coalesce(new.target_name, 'The shop') || ' couldn''t verify your payment. Please retry.',
        '/appointments',
        jsonb_build_object(
          'appointmentId', new.id,
          'avatarUrl', new.target_avatar,
          'actorName', new.target_name,
          'statusPill', 'Rejected',
          'tone', 'danger',
          'targetType', new.target_type,
          'targetId', new.target_id
        ),
        'CUSTOMER',
        new.customer_user_id
      );
    end if;
  end if;

  return new;
end $function$;

revoke all on function public.notify_on_appointment_status() from public, anon, authenticated;

-- ── 5. Placing an order: no flooding a shop (or the platform) with open delivery orders ────────────────────────────────
-- The daily limit exempts delivery (groceries are bought often). Without any cap a customer could open unlimited orders at one shop.
-- Signature unchanged. Only the open-order cap is new; everything else is the 20261004 body.
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
  v_open_all integer;
  v_open_here integer;
  v_package_price numeric := p_package_price;
  v_priced jsonb;
  v_missing boolean;
  v_unavailable boolean;
  v_bad_qty boolean;
  v_priced_total numeric;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if p_fulfillment_type not in ('IN_STORE', 'DELIVERY') then raise exception 'INVALID_FULFILLMENT_TYPE'; end if;
  if v_asap and p_fulfillment_type <> 'DELIVERY' then raise exception 'ASAP_REQUIRES_DELIVERY'; end if;
  if not v_asap and (p_scheduled_for is null or p_scheduled_for <= now()) then raise exception 'INVALID_APPOINTMENT_TIME'; end if;
  if p_fulfillment_type = 'DELIVERY' and (p_delivery_lat is null or p_delivery_lng is null) then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;
  if p_fulfillment_type = 'DELIVERY' and (p_delivery_lat not between -90 and 90 or p_delivery_lng not between -180 and 180) then
    raise exception 'INVALID_LOCATION';
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

  -- Open delivery orders per customer: 3 at one shop, 5 in all. A finished, cancelled or declined order frees its place.
  if p_fulfillment_type = 'DELIVERY' then
    select count(*) filter (where a.target_id = p_target_id), count(*)
      into v_open_here, v_open_all
      from public.appointments a
     where a.customer_user_id = v_uid and a.fulfillment_type = 'DELIVERY' and a.status in ('PENDING', 'ACCEPTED');
    if v_open_here >= 3 or v_open_all >= 5 then raise exception 'TOO_MANY_OPEN_ORDERS'; end if;
  end if;

  -- "As soon as possible" only while the shop is open — otherwise the order would sit unanswered. Same rule the order sheet applies
  -- (a manual "open until" wins, then the owner's open/closed switch, then the posted hours). Hours the server can't read count as open.
  if v_asap and p_target_type = 'BUSINESS' then
    select bz.hours, bz.is_available_now, bz.available_until into v_hours, v_manual, v_until
      from public.businesses bz where bz.id = p_target_id;
    if not (v_until is not null and v_until > now()) and v_manual is distinct from true then
      if v_manual = false or public.hours_open_at(v_hours, now()) = false then
        raise exception 'SHOP_CLOSED';
      end if;
    end if;
  end if;

  -- A delivery order is priced by the SHOP'S CATALOG, never by the app: names and unit prices are read from catalog_items, every line
  -- must be one of this shop's items and in stock, and quantities must be sensible. (Before this, the price came straight from the
  -- caller, so a modified app could order a ₹640 item for ₹1.)
  if p_fulfillment_type = 'DELIVERY' and p_target_type = 'BUSINESS' then
    if (v_items is null or jsonb_array_length(v_items) = 0) and p_package_id is not null then
      v_items := jsonb_build_array(jsonb_build_object('catalog_item_id', p_package_id, 'quantity', greatest(coalesce(p_party_size, 1), 1)));
    end if;
    if v_items is not null and jsonb_array_length(v_items) > 0 then
      select bool_or(coalesce(x.quantity, 0) < 1 or x.quantity > 99) into v_bad_qty
        from jsonb_to_recordset(v_items) as x(quantity int);
      if coalesce(v_bad_qty, false) then raise exception 'INVALID_QUANTITY'; end if;

      select jsonb_agg(jsonb_build_object('catalog_item_id', x.catalog_item_id, 'item_name', ci.name,
                                          'unit_price', coalesce(ci.sale_price, ci.price), 'quantity', x.quantity)),
             bool_or(ci.id is null),
             bool_or(ci.stock_status::text = 'OUT_OF_STOCK'),
             coalesce(sum(coalesce(ci.sale_price, ci.price) * x.quantity), 0)
        into v_priced, v_missing, v_unavailable, v_priced_total
        from jsonb_to_recordset(v_items) as x(catalog_item_id text, quantity int)
        left join public.catalog_items ci on ci.id = x.catalog_item_id and ci.business_id = p_target_id;
      if coalesce(v_missing, false) then raise exception 'ITEM_NOT_FOUND'; end if;
      if coalesce(v_unavailable, false) then raise exception 'ITEM_UNAVAILABLE'; end if;
      -- The total the customer was shown must be the real one: a stale cart (the owner changed a price) or a tampered app is refused
      -- with a clear message rather than charged at a different price.
      if p_package_price is not null and abs(p_package_price - v_priced_total) > 0.5 then raise exception 'PRICE_CHANGED'; end if;
      v_items := v_priced;
      v_package_price := v_priced_total;
    end if;
  end if;

  if v_items is not null and jsonb_array_length(v_items) > 0 then
    select coalesce(sum(coalesce(x.unit_price, 0) * coalesce(x.quantity, 0)), 0) into v_subtotal
      from jsonb_to_recordset(v_items) as x(unit_price numeric, quantity int);
  else
    v_subtotal := coalesce(v_package_price, 0);
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

  if v_asap then
    v_scheduled := date_trunc('minute', now() + make_interval(mins => coalesce(v_prep, 20) + 1));
    v_date_label := 'Today';
    v_time_label := 'ASAP';
  end if;

  if p_fulfillment_type = 'DELIVERY' then
    v_cust_lat := p_delivery_lat;
    v_cust_lng := p_delivery_lng;
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
    p_package_id, p_package_name, v_package_price, 'PENDING',
    p_fulfillment_type, nullif(left(trim(coalesce(p_delivery_address_line, '')), 300), ''), p_delivery_lat, p_delivery_lng,
    nullif(left(trim(coalesce(p_requested_delivery_window, '')), 100), ''), coalesce(p_party_size, 1),
    nullif(p_target_package_key, ''), v_is_out_of_range,
    v_fee, v_asap
  ) returning * into v_appointment;

  if (v_items is null or jsonb_array_length(v_items) = 0) and p_package_id is not null then
    v_items := jsonb_build_array(jsonb_build_object(
      'catalog_item_id', p_package_id,
      'item_name', coalesce(p_package_name, 'Item'),
      'unit_price', round(coalesce(v_package_price, 0) / greatest(coalesce(p_party_size, 1), 1), 2),
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

-- ── 6. Cancel / no-show / reschedule rules ──────────────────────────────────────────────────────────────────────────────
-- A customer can no longer cancel or reschedule once the rider has the order in hand (picked up), not only once it is moving.
-- A delivery is never a "no-show": the rider's "can't deliver" reasons cover the customer not being there.
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
    if exists (select 1 from public.appointment_deliveries d
                where d.appointment_id = p_id
                  and (d.status in ('EN_ROUTE', 'ARRIVED') or (d.status = 'ASSIGNED' and d.picked_up_at is not null))) then
      raise exception 'DELIVERY_IN_PROGRESS';
    end if;
    v_cancelled_by := 'CUSTOMER';
  elsif v_is_manager and v_appointment.status = 'PENDING'
        and p_status in ('ACCEPTED', 'REJECTED') then
    v_cancelled_by := null;
  elsif v_is_manager and v_appointment.status = 'ACCEPTED'
        and p_status = 'CANCELLED' then
    v_cancelled_by := 'OWNER';
  elsif v_is_manager and v_appointment.status = 'COMPLETED'
        and p_status = 'NO_SHOW' and v_appointment.fulfillment_type is distinct from 'DELIVERY' then
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

-- Reschedule: not once the rider has it; never for an ASAP order (there is no later slot to move it to — cancel and re-order);
-- stock is re-reserved for the replacement because cancelling the original returns it (section 3).
create or replace function public.reschedule_appointment(
  p_original_id text, p_scheduled_for timestamp with time zone, p_date_label text, p_time_label text,
  p_notes text default null::text, p_photo_url text default null::text, p_package_id text default null::text,
  p_package_name text default null::text, p_package_price numeric default null::numeric
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
  if v_original.is_asap then raise exception 'ASAP_CANNOT_RESCHEDULE'; end if;
  if exists (select 1 from public.appointment_deliveries d
              where d.appointment_id = p_original_id
                and (d.status in ('EN_ROUTE', 'ARRIVED') or (d.status = 'ASSIGNED' and d.picked_up_at is not null))) then
    raise exception 'DELIVERY_IN_PROGRESS';
  end if;

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
    payment_status, payment_method, payment_amount, payment_reference,
    delivery_fee, is_out_of_range
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
    v_original.payment_reference,
    v_original.delivery_fee,
    coalesce(v_original.is_out_of_range, false)
  ) returning * into v_new;

  insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
  select v_new.id, catalog_item_id, item_name, unit_price, quantity
  from public.appointment_items
  where appointment_id = p_original_id;

  perform public.reserve_catalog_items(
    (select jsonb_agg(jsonb_build_object('catalog_item_id', i.catalog_item_id, 'quantity', i.quantity))
       from public.appointment_items i where i.appointment_id = v_new.id)
  );

  return v_new;
end
$function$;

revoke all on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) from public, anon;
grant execute on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) to authenticated;

-- ── 7. Dispatch ──────────────────────────────────────────────────────────────────────────────────────────────────────────
-- assign_delivery: a secure code; reassigning starts the delivery over for the new rider (D5) and tells the old one; the customer is
-- told once when a delivery partner is first assigned; choosing the rider who already has it changes nothing.
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
  v_old_batch text;
  v_old_agent text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select a.id, a.target_id, a.customer_name, a.delivery_address_line, a.package_name, a.package_price, a.customer_user_id,
         a.status, a.fulfillment_type
    into v_apt from public.appointments a
   where a.id = p_appointment_id and a.target_type = 'BUSINESS';
  if v_apt.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  v_biz := v_apt.target_id;
  if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if v_apt.fulfillment_type is distinct from 'DELIVERY' then raise exception 'NOT_A_DELIVERY_ORDER'; end if;
  if v_apt.status is distinct from 'ACCEPTED' then raise exception 'ORDER_NOT_ACCEPTED'; end if;
  if not public.has_business_access(v_biz, p_agent_user_id) then raise exception 'AGENT_NOT_TEAM_MEMBER'; end if;

  select b.name, b.address_line1 into v_biz_name, v_biz_address from public.businesses b where b.id = v_biz;

  select * into v_row from public.appointment_deliveries
    where appointment_id = p_appointment_id and status in ('ASSIGNED','EN_ROUTE','ARRIVED') for update;
  if found then
    if v_row.agent_user_id is not distinct from p_agent_user_id then
      v_row.handoff_code := null;
      return v_row;
    end if;

    v_old_batch := v_row.batch_id;
    v_old_agent := v_row.agent_user_id;
    v_code := public.new_handoff_code();
    delete from public.handoff_attempts where delivery_id = v_row.id;
    update public.appointment_deliveries
       set agent_user_id = p_agent_user_id,
           status = 'ASSIGNED',
           handoff_verified = false,
           handoff_code = v_code,
           batch_id = null,
           stop_order = null,
           live_status = null,
           picked_up_at = null,
           started_at = null,
           arrived_at = null,
           lat = null, lng = null, heading = null, position_at = null,
           proof_photo_url = null, proof_note = null, proof_at = null
     where id = v_row.id returning * into v_row;

    -- The old run must not stay open (and keep its rider on duty) once it has no stops left.
    if v_old_batch is not null and not exists (
      select 1 from public.appointment_deliveries d
       where d.batch_id = v_old_batch and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
    ) then
      update public.delivery_batches set status = 'COMPLETED', completed_at = now()
       where id = v_old_batch and status in ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS');
    end if;

    -- Stand the previous rider down: they must not carry on to a customer whose delivery is now someone else's.
    if v_old_agent is not null then
      begin
        insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
        values (
          v_old_agent, 'DELIVERY', 'Delivery reassigned — don''t deliver',
          coalesce(v_biz_name, 'The shop') || ' gave this delivery to someone else. You don''t need to deliver it.',
          '/delivery',
          jsonb_build_object('appointmentId', p_appointment_id, 'statusPill', 'Reassigned', 'tone', 'warning'),
          'PROVIDER', v_old_agent
        );
      exception when others then null; end;
    end if;
  else
    v_code := public.new_handoff_code();
    insert into public.appointment_deliveries (appointment_id, business_id, agent_user_id, status, handoff_code)
    values (p_appointment_id, v_biz, p_agent_user_id, 'ASSIGNED', v_code) returning * into v_row;

    -- First assignment: the customer hears that a delivery partner has been arranged (no identity until it is on its way).
    begin
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        v_apt.customer_user_id, 'DELIVERY', 'Delivery partner assigned',
        coalesce(v_biz_name, 'The shop') || ' has arranged a delivery partner for your order.',
        '/appointments',
        jsonb_build_object('appointmentId', p_appointment_id, 'statusPill', 'Assigned', 'tone', 'brand')
      );
    exception when others then null; end;
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

create or replace function public.assign_delivery_batch(p_appointment_ids text[], p_agent_user_id text)
returns delivery_batches
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_biz text;
  v_count int;
  v_batch public.delivery_batches%rowtype;
  v_apt_id text;
  v_biz_name text;
  v_biz_address text;
  v_customer text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_appointment_ids is null or array_length(p_appointment_ids, 1) is null then
    raise exception 'NO_APPOINTMENTS_SELECTED';
  end if;

  select a.target_id into v_biz from public.appointments a
    where a.id = p_appointment_ids[1] and a.target_type = 'BUSINESS';
  if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if not public.has_business_access(v_biz, p_agent_user_id) then raise exception 'AGENT_NOT_TEAM_MEMBER'; end if;

  select count(*) into v_count
    from public.appointments a
    where a.id = any(p_appointment_ids)
      and a.target_type = 'BUSINESS' and a.target_id = v_biz
      and a.fulfillment_type = 'DELIVERY' and a.status = 'ACCEPTED'
      and not exists (
        select 1 from public.appointment_deliveries d
        where d.appointment_id = a.id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
      );
  if v_count <> array_length(p_appointment_ids, 1) then
    raise exception 'SOME_APPOINTMENTS_NOT_ELIGIBLE';
  end if;

  select b.name, b.address_line1 into v_biz_name, v_biz_address from public.businesses b where b.id = v_biz;

  insert into public.delivery_batches (business_id, agent_user_id)
    values (v_biz, p_agent_user_id) returning * into v_batch;

  foreach v_apt_id in array p_appointment_ids loop
    insert into public.appointment_deliveries (appointment_id, business_id, agent_user_id, status, handoff_code, batch_id)
    values (v_apt_id, v_biz, p_agent_user_id, 'ASSIGNED', public.new_handoff_code(), v_batch.id);

    begin
      select a.customer_user_id into v_customer from public.appointments a where a.id = v_apt_id;
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        v_customer, 'DELIVERY', 'Delivery partner assigned',
        coalesce(v_biz_name, 'The shop') || ' has arranged a delivery partner for your order.',
        '/appointments',
        jsonb_build_object('appointmentId', v_apt_id, 'statusPill', 'Assigned', 'tone', 'brand')
      );
    exception when others then null; end;
  end loop;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
    values (
      p_agent_user_id,
      'DELIVERY',
      'New delivery run',
      'You have ' || array_length(p_appointment_ids, 1) || ' deliveries to accept from ' || coalesce(v_biz_name, 'the store') || '.',
      '/delivery',
      jsonb_build_object(
        'batchId', v_batch.id,
        'stopCount', array_length(p_appointment_ids, 1),
        'pickupAddress', coalesce(v_biz_address, v_biz_name),
        'statusPill', 'Run Assigned',
        'tone', 'brand',
        'actions', jsonb_build_array('ACCEPT_DELIVERY', 'DECLINE_DELIVERY')
      ),
      'PROVIDER',
      p_agent_user_id
    );
  exception when others then null; end;

  return v_batch;
end $function$;

revoke all on function public.assign_delivery_batch(text[], text) from public, anon;
grant execute on function public.assign_delivery_batch(text[], text) to authenticated;

-- Accepting a run without a route order (the notification button sends none) now numbers the stops in the order they were assigned,
-- instead of leaving every stop unordered (D12).
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
  else
    update public.appointment_deliveries d set stop_order = x.rn
      from (select id, row_number() over (order by created_at, id) as rn
              from public.appointment_deliveries where batch_id = p_batch_id) x
     where d.id = x.id and d.stop_order is null;
  end if;

  update public.delivery_batches set status = 'ACCEPTED', accepted_at = now()
    where id = p_batch_id returning * into v_batch;
  return v_batch;
end $function$;

revoke all on function public.accept_delivery_batch(text, text[]) from public, anon;
grant execute on function public.accept_delivery_batch(text, text[]) to authenticated;

-- ── 8. Pick-up needs a packed order (the shop signals "ready", the courier collects) ────────────────────────────────────
-- An owner delivering their own order is exempt (they packed it). In a run, only the packed stops are marked picked up.
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
  v_ready timestamptz;
  v_is_owner boolean;
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

  select a.ready_at, (b.owner_user_id = v_uid) into v_ready, v_is_owner
    from public.appointments a join public.businesses b on b.id = a.target_id
   where a.id = v_row.appointment_id;
  if v_ready is null and not coalesce(v_is_owner, false) then raise exception 'ORDER_NOT_READY'; end if;

  select b.name into v_biz_name from public.businesses b where b.id = v_row.business_id;

  -- A run is picked up once: every not-yet-started, packed stop of this rider's run is marked together.
  for r in
    with u as (
      update public.appointment_deliveries d
         set picked_up_at = now()
       where d.agent_user_id = v_uid and d.status = 'ASSIGNED' and d.picked_up_at is null
         and (d.id = v_row.id
              or (v_row.batch_id is not null and d.batch_id = v_row.batch_id
                  and exists (select 1 from public.appointments a2 join public.businesses b2 on b2.id = a2.target_id
                               where a2.id = d.appointment_id and (a2.ready_at is not null or b2.owner_user_id = v_uid))))
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

-- ── 9. The rider's list also says whether the shop has packed the order ────────────────────────────────────────────────
-- RETURNS TABLE is widened, so the function is dropped first. New columns are trailing, so the deployed app (which reads by name) is unaffected.
drop function if exists public.my_deliveries();

create or replace function public.my_deliveries()
returns table(
  id text, appointment_id text, business_id text, business_name text, customer_name text, customer_area text,
  delivery_address_line text, delivery_lat double precision, delivery_lng double precision,
  scheduled_for timestamp with time zone, date_label text, time_label text, status text, live_status text,
  handoff_code text, handoff_verified boolean, lat double precision, lng double precision, batch_id text,
  stop_order integer, batch_status text, batch_lat double precision, batch_lng double precision,
  created_at timestamp with time zone, delivered_at timestamp with time zone,
  amount_due numeric, delivery_fee integer, payment_method text, payment_status text, cash_collected_at timestamp with time zone,
  customer_phone text, business_phone text, order_notes text, requested_window text, package_name text, items jsonb,
  picked_up_at timestamp with time zone, business_lat double precision, business_lng double precision, business_address text,
  order_ready_at timestamp with time zone, is_owner_delivery boolean
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
    d.picked_up_at, b.lat, b.lng, b.address_line1,
    a.ready_at, (b.owner_user_id = d.agent_user_id)
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

-- ── 10. Trigger functions are not endpoints ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.tg_cancel_delivery_on_order_cancel() from public, anon, authenticated;
revoke all on function public.tg_complete_appointment_on_delivery() from public, anon, authenticated;

notify pgrst, 'reload schema';
