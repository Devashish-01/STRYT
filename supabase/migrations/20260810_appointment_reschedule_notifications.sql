-- ============================================================
-- Reschedule flow (MyAppointments.tsx: cancel old + create new) currently
-- produces no signal that this is a reschedule: the owner sees a plain
-- "New booking request" as if unrelated, and the customer never gets a
-- confirmation their reschedule went through. Tag the new row with the
-- appointment it replaced and branch on it in the create-notification trigger.
-- Run manually in Supabase SQL editor.
-- ============================================================

alter table public.appointments
  add column if not exists rescheduled_from text references public.appointments(id);

create or replace function public.notify_on_appointment_created()
returns trigger as $$
declare v_link text;
begin
  v_link := case when new.target_type = 'PROVIDER'
                 then '/provider/' || new.target_id || '/manage/leads'
                 else '/business/' || new.target_id || '/manage/appointments' end;

  if new.rescheduled_from is not null then
    if new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (
        new.target_owner_user_id, 'APPOINTMENT', 'Booking rescheduled',
        coalesce(new.customer_name, 'A customer') || ' moved their booking to ' || coalesce(new.time_label, 'a new slot')
          || coalesce(' — ' || new.package_name, ''),
        v_link
      );
    end if;
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      new.customer_user_id, 'APPOINTMENT', 'Reschedule submitted',
      'Your new request for ' || coalesce(new.time_label, 'a slot') || ' with ' || coalesce(new.target_name, 'the shop')
        || ' is pending confirmation.',
      '/appointments'
    );
  elsif new.target_owner_user_id is not null then
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
