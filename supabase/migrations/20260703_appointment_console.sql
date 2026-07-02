-- ============================================================
-- Appointment Console 2.0
-- Run manually in Supabase SQL editor.
--
-- 1. Cancel attribution (who cancelled: customer / owner / system auto-cancel)
-- 2. Walk-in bookings (owner enters a booking manually, no customer account)
-- 3. NO_SHOW status (owner marks a past confirmed booking as a no-show)
-- 4. blocked_slots table (owner blocks specific times or whole days, with
--    optional weekly recurrence e.g. "block 1-2 PM every day")
-- ============================================================

-- 1 + 2 + 3: appointments table additions
alter table public.appointments
  add column if not exists cancelled_by text check (cancelled_by in ('CUSTOMER','OWNER','SYSTEM')),
  add column if not exists is_walk_in   boolean not null default false;

alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('PENDING','ACCEPTED','REJECTED','COMPLETED','CANCELLED','NO_SHOW'));

-- 4: blocked_slots
create table if not exists public.blocked_slots (
  id                    uuid primary key default gen_random_uuid(),
  target_type           text not null check (target_type in ('BUSINESS','PROVIDER')),
  target_id             text not null,
  target_owner_user_id  text not null references public.users(id),
  date                  date,                                   -- specific day; null when recurring
  weekday               int  check (weekday between 0 and 6),   -- 0=Sun..6=Sat; null when not recurring
  time_label            text,                                   -- null = whole day blocked
  reason                text,
  recurring             boolean not null default false,
  created_at            timestamptz default now(),
  constraint blocked_slots_date_or_weekday check (
    (recurring = false and date is not null and weekday is null) or
    (recurring = true  and weekday is not null and date is null)
  )
);

create index if not exists blocked_slots_target_idx on public.blocked_slots (target_id, date);
create unique index if not exists blocked_slots_unique_specific
  on public.blocked_slots (target_id, date, coalesce(time_label, ''))
  where recurring = false;
create unique index if not exists blocked_slots_unique_recurring
  on public.blocked_slots (target_id, weekday, coalesce(time_label, ''))
  where recurring = true;

alter table public.blocked_slots enable row level security;

do $$ begin
  create policy blocked_slots_select on public.blocked_slots for select using (true);
  create policy blocked_slots_write on public.blocked_slots for all
    using     (auth.uid()::text = target_owner_user_id)
    with check (auth.uid()::text = target_owner_user_id);
exception when duplicate_object then null; end $$;
