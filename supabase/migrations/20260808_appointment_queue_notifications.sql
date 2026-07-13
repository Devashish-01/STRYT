-- ============================================================
-- Notifications for the appointment & live-queue flows — the two core journeys
-- that had NO notifications at all (only proposals/agreements/community/etc.
-- had triggers). Every insert into public.notifications also fires the OS push
-- via 20260731_push_on_every_notification, so these cover in-app AND native.
-- Run manually in Supabase SQL editor.
-- ============================================================

-- ── New booking request → notify the shop/provider owner ──────
create or replace function public.notify_on_appointment_created()
returns trigger as $$
declare v_link text;
begin
  v_link := case when new.target_type = 'PROVIDER'
                 then '/provider/' || new.target_id || '/manage/leads'
                 else '/business/' || new.target_id || '/manage/appointments' end;
  if new.target_owner_user_id is not null then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      new.target_owner_user_id, 'APPOINTMENT', 'New booking request',
      coalesce(new.customer_name, 'A customer') || ' requested ' || coalesce(new.time_label, 'a slot')
        || coalesce(' — ' || new.package_name, ''),
      v_link
    );
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_appointment_created on public.appointments;
create trigger trg_notify_appointment_created
  after insert on public.appointments
  for each row execute function public.notify_on_appointment_created();

-- ── Booking status / payment change → notify the customer ─────
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
    elsif new.status = 'CANCELLED' and coalesce(new.cancelled_by, '') <> 'CUSTOMER' then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking cancelled',
              coalesce(new.target_name, 'The shop') || ' cancelled your ' || coalesce(new.time_label, 'appointment') || '.', '/appointments');
    end if;
  end if;

  -- Payment verified by the owner.
  if new.payment_status = 'PAID' and old.payment_status is distinct from 'PAID' then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (new.customer_user_id, 'APPOINTMENT', 'Payment confirmed ✓',
            coalesce(new.target_name, 'The shop') || ' confirmed your payment.', '/appointments');
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_appointment_status on public.appointments;
create trigger trg_notify_appointment_status
  after update on public.appointments
  for each row execute function public.notify_on_appointment_status();

-- ── Queue: it's your turn → notify the customer ───────────────
create or replace function public.notify_on_queue_called()
returns trigger as $$
declare v_shop text;
begin
  if new.status = 'CALLED' and old.status is distinct from 'CALLED' then
    select name into v_shop from public.businesses where id = new.business_id;
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (new.customer_user_id, 'QUEUE_UPDATE', 'It''s your turn! 🔔',
            'Head in now — ' || coalesce(v_shop, 'the shop') || ' is ready for you.', '/queues');
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_queue_called on public.queue_tokens;
create trigger trg_notify_queue_called
  after update on public.queue_tokens
  for each row execute function public.notify_on_queue_called();
