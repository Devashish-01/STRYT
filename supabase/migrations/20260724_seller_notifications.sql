-- Flow 10 (Onboarding to Seller) — push notification on verification
-- decision, and a flag to send a boost-expiry reminder once per boost period.
-- Run manually in Supabase SQL editor.
--
-- Verification approve/reject currently has no in-app admin action (no code
-- path sets is_verified/verification_status to a decided value) — it's done
-- by direct database edit. A trigger is the only way to react to that, since
-- there's no app-level call to hook into. Assumes 'REJECTED' as the rejection
-- literal, matching the existing 'UNDER_REVIEW' convention already in use.

alter table if exists public.businesses
  add column if not exists boost_reminder_sent boolean not null default false;
alter table if exists public.providers
  add column if not exists boost_reminder_sent boolean not null default false;

-- Reset the reminder flag whenever a fresh boost is purchased so the next
-- expiry gets its own reminder.
create or replace function public.reset_boost_reminder()
returns trigger as $$
begin
  if new.boosted_until is distinct from old.boosted_until and new.boosted_until is not null then
    new.boost_reminder_sent := false;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_reset_boost_reminder_business on public.businesses;
create trigger trg_reset_boost_reminder_business
  before update of boosted_until on public.businesses
  for each row execute function public.reset_boost_reminder();

create or replace function public.notify_verification_decision_business()
returns trigger as $$
begin
  if new.is_verified = true and old.is_verified is distinct from true then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (new.owner_user_id, 'VERIFICATION_DECIDED', 'You are verified!', new.name || ' is now a verified business.', '/business/' || new.id || '/manage/verify');
  elsif new.verification_status = 'REJECTED' and old.verification_status is distinct from 'REJECTED' then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (new.owner_user_id, 'VERIFICATION_DECIDED', 'Verification needs another look', 'Your documents for ' || new.name || ' were not approved — resubmit from Settings.', '/business/' || new.id || '/manage/verify');
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_verification_business on public.businesses;
create trigger trg_notify_verification_business
  after update of is_verified, verification_status on public.businesses
  for each row execute function public.notify_verification_decision_business();

create or replace function public.notify_verification_decision_provider()
returns trigger as $$
begin
  if new.is_verified = true and old.is_verified is distinct from true then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (new.user_id, 'VERIFICATION_DECIDED', 'You are verified!', new.display_name || ' is now a verified provider.', '/provider/' || new.id || '/manage/verify');
  elsif new.verification_status = 'REJECTED' and old.verification_status is distinct from 'REJECTED' then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (new.user_id, 'VERIFICATION_DECIDED', 'Verification needs another look', 'Your documents for ' || new.display_name || ' were not approved — resubmit from Settings.', '/provider/' || new.id || '/manage/verify');
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_verification_provider on public.providers;
create trigger trg_notify_verification_provider
  after update of is_verified, verification_status on public.providers
  for each row execute function public.notify_verification_decision_provider();
