-- ============================================================
-- Rollback for 20260947_appointment_notifications_v2.sql
-- Restores all replaced objects to their exact production catalog definitions
-- from supabase/snapshots/2026-09-13_after_20260958.sql.
-- ============================================================

-- ── Restore notify_on_appointment_created ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_appointment_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_link text;
begin
  v_link := case when new.target_type = 'PROVIDER'
                 then '/provider/' || new.target_id || '/manage/jobs'
                 else '/business/' || new.target_id || '/manage/appointments' end;

  if new.rescheduled_from is not null then
    if new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        new.target_owner_user_id, 'APPOINTMENT', 'Booking rescheduled',
        coalesce(new.customer_name, 'A customer') || ' moved their booking to ' || coalesce(new.time_label, 'a new slot')
          || coalesce(' — ' || new.package_name, ''),
        v_link,
        jsonb_build_object('avatarUrl', new.customer_avatar, 'actorName', new.customer_name, 'amount', new.package_price, 'amountLabel', 'Package', 'statusPill', 'Rescheduled', 'tone', 'brand')
      );
    end if;
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.customer_user_id, 'APPOINTMENT', 'Reschedule submitted',
      'Your new request for ' || coalesce(new.time_label, 'a slot') || ' with ' || coalesce(new.target_name, 'the shop')
        || ' is pending confirmation.',
      '/appointments',
      jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Pending', 'tone', 'warning')
    );
  elsif new.target_owner_user_id is not null then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.target_owner_user_id, 'APPOINTMENT', 'New booking request',
      coalesce(new.customer_name, 'A customer') || ' requested ' || coalesce(new.time_label, 'a slot')
        || coalesce(' — ' || new.package_name, ''),
      v_link,
      jsonb_build_object('avatarUrl', new.customer_avatar, 'actorName', new.customer_name, 'amount', new.package_price, 'amountLabel', 'Package', 'statusPill', 'New', 'tone', 'brand')
    );
  end if;
  return new;
end $function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_appointment_created() TO postgres, service_role;

-- ── Restore notify_on_appointment_status ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_appointment_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
end $function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_appointment_status() TO postgres, service_role;

notify pgrst, 'reload schema';
