-- ============================================================
-- Migration 20260947: Appointment Notifications V2
--
-- Upgrades appointment notifications across all 3 hats:
--  1) Fixes scoping bug: stamps entity_type ('BUSINESS' | 'PROVIDER')
--     and entity_id (target_id) on all merchant-directed rows so
--     scoped feeds (?scope=BUSINESS&id=...) no longer drop them.
--  2) Enriches structured metadata: appointmentId, scheduledFor,
--     dateLabel, timeLabel, originalTimeLabel, serviceName, partySize,
--     fulfillmentType, actions (['ACCEPT', 'DECLINE'] or ['CALENDAR', 'RESCHEDULE']).
--  3) Captures reschedule diffs and cancellation attribution notes.
-- ============================================================

-- ── 1) notify_on_appointment_created ─────────────────────────
create or replace function public.notify_on_appointment_created()
returns trigger
language plpgsql security definer
set search_path = public
as $$
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
$$;

-- ── 2) notify_on_appointment_status ──────────────────────────
create or replace function public.notify_on_appointment_status()
returns trigger
language plpgsql security definer set search_path to 'public'
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
        coalesce(new.target_name, 'The shop') || ' didn''t respond in time, so your ' || coalesce(new.time_label, 'appointment') || ' was auto-cancelled.',
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
