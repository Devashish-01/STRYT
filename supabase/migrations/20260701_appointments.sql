-- Migration: Appointments as a first-class, cross-device booking record
-- Date: 2026-07-01
--
-- Until now appointments lived only in the customer's localStorage, so the
-- business/provider owner never saw the booking and an Accept/Decline could
-- never travel back. This makes `appointments` the single source of truth,
-- with RLS scoping rows to the two parties involved (customer + target owner).
--
-- Also adds a presence layer to businesses (is_available_now / available_until)
-- so "open right now" is decoupled from bookable working-hour slots — the same
-- split providers already have.

-- ============================================================
-- 1 · appointments table
-- ============================================================
create table if not exists public.appointments (
  id                    text primary key default ('apt_' || replace(gen_random_uuid()::text, '-', '')),
  target_type           text not null check (target_type in ('BUSINESS','PROVIDER')),
  target_id             text not null,
  target_owner_user_id  text not null references public.users(id),
  target_name           text,
  target_avatar         text,
  customer_user_id      text not null references public.users(id),
  customer_name         text,
  customer_avatar       text,
  scheduled_for         timestamptz not null,
  date_label            text,
  time_label            text,
  notes                 text,
  photo_url             text,
  package_id            text,
  package_name          text,
  package_price         numeric,
  status                text not null default 'PENDING'
                          check (status in ('PENDING','ACCEPTED','REJECTED','COMPLETED','CANCELLED')),
  response_note         text,
  created_at            timestamptz default now()
);

create index if not exists appointments_customer_idx on public.appointments (customer_user_id);
create index if not exists appointments_target_idx   on public.appointments (target_id);
create index if not exists appointments_owner_idx    on public.appointments (target_owner_user_id);

alter table public.appointments enable row level security;

-- Either party (the customer who booked, or the owner of the target being
-- booked) may read the row. Only the customer may create it (stamped as
-- themselves). Both parties may update — the owner to accept/decline, the
-- customer to cancel.
do $$ begin
  create policy appt_select on public.appointments for select
    using (auth.uid()::text in (customer_user_id, target_owner_user_id));
  create policy appt_insert on public.appointments for insert
    with check (customer_user_id = auth.uid()::text);
  create policy appt_update on public.appointments for update
    using     (auth.uid()::text in (customer_user_id, target_owner_user_id))
    with check (auth.uid()::text in (customer_user_id, target_owner_user_id));
exception when duplicate_object then null; end $$;

-- ============================================================
-- 2 · Business presence layer (mirrors providers)
-- ============================================================
alter table public.businesses add column if not exists is_available_now boolean default false;
alter table public.businesses add column if not exists available_until  timestamptz;
