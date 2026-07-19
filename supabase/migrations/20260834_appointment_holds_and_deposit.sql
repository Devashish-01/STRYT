-- ============================================================
-- 20260834 — Appointment slot-hold expiry + partial-deposit support
-- ============================================================
-- TWO concerns:
--
-- 1. SLOT HOLD EXPIRY (fixes "select a time then go back and it stays booked
--    for everyone forever"). A PENDING appointment legitimately reserves its
--    slot (the appointments_no_double_book unique index on
--    (target_type,target_id,scheduled_for) WHERE status IN ('PENDING','ACCEPTED')
--    is the real anti-double-book guard). But an abandoned / never-accepted
--    request used to hold the slot until the slot time itself passed — i.e.
--    effectively "indefinitely" for a far-future slot. We now treat an
--    un-accepted PENDING booking as a TENTATIVE HOLD with a finite TTL:
--      * booked_slots() (drives the booking-grid grey-out) ignores PENDING
--        holds older than the TTL, so stale holds stop blocking others.
--      * sweep_stale_appointment_holds() actually CANCELs those stale holds so
--        the unique index frees too (a booking can then really be placed).
--    HOLD_TTL is 2 hours — long enough not to cancel a booking a seller is
--    actively about to accept, short enough that an abandoned tap doesn't lock
--    a slot for the rest of the day. Tune the interval in both functions if a
--    different seller-response SLA is desired. ACCEPTED bookings are NEVER
--    swept here (only the seller/customer/slot-time paths change those).
--
-- 2. PARTIAL DEPOSIT. businesses/providers with paymentTiming='AT_BOOKING' can
--    now require only a PERCENTAGE up front (deposit_percent), with the balance
--    collected at the appointment. 0 (the default) = the existing behaviour
--    (pay the full package price up front). Range enforced 0..100.
-- ============================================================


-- ── 1a. booked_slots: ignore stale (>2h old) un-accepted PENDING holds ──────
create or replace function public.booked_slots(p_target_id text)
returns table(scheduled_for timestamp with time zone)
language sql
stable
security definer
set search_path = public
as $$
  select a.scheduled_for
  from public.appointments a
  where a.target_id = p_target_id
    and (
      a.status = 'ACCEPTED'
      or (a.status = 'PENDING' and a.created_at > now() - interval '2 hours')
    );
$$;


-- ── 1b. Global stale-hold sweep — releases abandoned tentative holds ────────
-- SECURITY DEFINER + callable by any authenticated user: it only ever cancels
-- PENDING (un-accepted) requests older than the TTL whose slot is still in the
-- future, so triggering it can never harm a confirmed booking or someone
-- else's accepted appointment. The booking sheet calls this before reading the
-- slot grid so the grid reflects freshly-released slots.
create or replace function public.sweep_stale_appointment_holds()
returns void
language sql
security definer
set search_path = public
as $$
  update public.appointments
  set status = 'CANCELLED',
      cancelled_by = 'SYSTEM',
      response_note = coalesce(response_note, 'Hold expired — booking was not accepted in time')
  where status = 'PENDING'
    and created_at <= now() - interval '2 hours'
    and scheduled_for > now();
$$;

revoke execute on function public.sweep_stale_appointment_holds() from public, anon;
grant execute on function public.sweep_stale_appointment_holds() to authenticated;


-- ── 2. Partial deposit percentage on businesses + providers ─────────────────
alter table public.businesses
  add column if not exists deposit_percent integer not null default 0
    check (deposit_percent >= 0 and deposit_percent <= 100);

alter table public.providers
  add column if not exists deposit_percent integer not null default 0
    check (deposit_percent >= 0 and deposit_percent <= 100);

comment on column public.businesses.deposit_percent is
  'When paymentTiming=AT_BOOKING: percent of the package price collected up front (0 = full amount up front; 1..100 = deposit, balance at appointment).';
comment on column public.providers.deposit_percent is
  'When paymentTiming=AT_BOOKING: percent of the package price collected up front (0 = full amount up front; 1..100 = deposit, balance at appointment).';
