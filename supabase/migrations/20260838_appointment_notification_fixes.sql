-- ============================================================
-- APPOINTMENT NOTIFICATION FIXES (rewrite of notify_on_appointment_status)
-- ============================================================
-- Fixes three real bugs found while maturing the appointment flow:
--   1. Both owner-facing deep links pointed at '/provider/{id}/manage/leads',
--      a route that doesn't exist (the provider appointment console lives at
--      '/provider/{id}/manage/jobs') — every provider push notification for
--      an appointment 404'd on tap.
--   2. A SYSTEM auto-cancellation (owner didn't respond before the hold
--      expired) sent the customer the same "the shop cancelled" copy as a
--      real OWNER cancellation — misleading, and inconsistent with the
--      correct in-app copy CancelAttributionNote already shows ("didn't
--      respond in time").
--   3. NO_SHOW had no customer notification branch at all.
create or replace function public.notify_on_appointment_status()
returns trigger as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'ACCEPTED' then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking confirmed ✓',
              coalesce(new.target_name, 'The shop') || ' confirmed your ' || coalesce(new.time_label, 'appointment') || '.', '/appointments');
    elsif new.status = 'REJECTED' then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking declined',
              coalesce(new.target_name, 'The shop') || ' couldn''t take your ' || coalesce(new.time_label, 'booking') || '. Try another slot.', '/appointments');
    elsif new.status = 'NO_SHOW' then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.customer_user_id, 'APPOINTMENT', 'Marked as no-show',
              coalesce(new.target_name, 'The shop') || ' marked you as a no-show for your ' || coalesce(new.time_label, 'appointment') || '.', '/appointments');
    elsif new.status = 'CANCELLED' and new.cancelled_by = 'SYSTEM' then
      -- Owner didn't respond before the hold expired — matches the
      -- "didn't respond in time" copy CancelAttributionNote shows in-app,
      -- rather than implying the shop actively cancelled.
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking auto-cancelled',
              coalesce(new.target_name, 'The shop') || ' didn''t respond in time, so your ' || coalesce(new.time_label, 'appointment') || ' was auto-cancelled.', '/appointments');
    elsif new.status = 'CANCELLED' and coalesce(new.cancelled_by, '') <> 'CUSTOMER' then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking cancelled',
              coalesce(new.target_name, 'The shop') || ' cancelled your ' || coalesce(new.time_label, 'appointment') || '.', '/appointments');
    elsif new.status = 'CANCELLED' and new.cancelled_by = 'CUSTOMER' and new.target_owner_user_id is not null then
      -- Owner learns the customer cancelled (previously silent).
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.target_owner_user_id, 'APPOINTMENT', 'Booking cancelled by customer',
              coalesce(new.customer_name, 'A customer') || ' cancelled their ' || coalesce(new.time_label, 'appointment') || '.',
              case when new.target_type = 'PROVIDER'
                   then '/provider/' || new.target_id || '/manage/jobs'
                   else '/business/' || new.target_id || '/manage/appointments' end);
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status then
    if new.payment_status = 'PAID' then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.customer_user_id, 'APPOINTMENT', 'Payment confirmed ✓',
              coalesce(new.target_name, 'The shop') || ' confirmed your payment.', '/appointments');
    elsif new.payment_status = 'PENDING_CONFIRM' and new.target_owner_user_id is not null then
      -- Owner learns a payment claim is waiting for their verification.
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.target_owner_user_id, 'APPOINTMENT', 'Payment claim to verify',
              coalesce(new.customer_name, 'A customer') || ' says they paid'
                || coalesce(' ₹' || new.payment_amount::text, '') || ' — confirm or reject in your console.',
              case when new.target_type = 'PROVIDER'
                   then '/provider/' || new.target_id || '/manage/jobs'
                   else '/business/' || new.target_id || '/manage/appointments' end);
    elsif new.payment_status = 'REJECTED' then
      -- Customer learns their claim was rejected and can retry.
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.customer_user_id, 'APPOINTMENT', 'Payment not verified',
              coalesce(new.target_name, 'The shop') || ' couldn''t verify your payment. Please retry.', '/appointments');
    end if;
  end if;

  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_appointment_status on public.appointments;
create trigger trg_notify_appointment_status
  after update on public.appointments
  for each row execute function public.notify_on_appointment_status();
