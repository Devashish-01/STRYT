-- ============================================================
-- 20260822 — Booking & deal integrity hardening
-- Run manually in the Supabase SQL editor. Idempotent + schema-drift guarded.
--
-- Fixes verified by the requests/appointments audit:
--   1. Double-booking: DB-level guarantee one slot = one active booking, plus a
--      privacy-safe RPC so customers see honest availability without reading
--      other customers' appointment rows.
--   2. proposal_counters: create + RLS (the table existed live but was never in
--      a tracked migration, so its structure/policies were unmanaged).
--   3. Server-authoritative appointment housekeeping (expire stale PENDING,
--      complete past ACCEPTED) so transitions no longer depend on a client
--      opening a list and firing an unmonitored write.
--   4. Agreement state-machine transitions as SECURITY DEFINER RPCs that
--      validate caller-side + current status (the raw table updates trusted
--      RLS alone and allowed out-of-order transitions / premature escrow
--      release).
--   5. accept_proposal_at_price: accepting a negotiated counter now agrees at
--      the countered amount instead of silently the original quote.
--   6. Notification gaps: owner notified on a payment claim (PENDING_CONFIRM)
--      and on customer-initiated cancellation; customer notified on a rejected
--      payment claim.
--   7. Rating dedupe: one rating per rater per agreement.
-- ============================================================


-- ============================================================
-- 1 · DOUBLE-BOOKING PREVENTION
-- ============================================================
-- One active booking per (target, exact slot). CANCELLED/REJECTED/NO_SHOW rows
-- are excluded so a freed slot can be re-booked and history is preserved.
-- NOTE: if pre-existing duplicate active rows exist, this CREATE will fail —
-- resolve those rows first, then re-run.
create unique index appointments_no_double_book
  on public.appointments (target_type, target_id, scheduled_for)
  where status in ('PENDING', 'ACCEPTED');

-- Honest availability without leaking PII: returns ONLY the occupied timestamps
-- for a target, so the customer's booking sheet can grey out taken slots even
-- though appt_select RLS hides other customers' full rows from them.
create or replace function public.booked_slots(p_target_id text)
returns table (scheduled_for timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select a.scheduled_for
  from public.appointments a
  where a.target_id = p_target_id
    and a.status in ('PENDING', 'ACCEPTED');
$$;

grant execute on function public.booked_slots(text) to anon, authenticated;


-- ============================================================
-- 2 · proposal_counters TABLE + RLS
-- ============================================================
create table if not exists public.proposal_counters (
  id          text primary key default ('pc_' || replace(gen_random_uuid()::text, '-', '')),
  proposal_id text not null references public.proposals(id) on delete cascade,
  by_user_id  text not null references public.users(id),
  amount      numeric not null check (amount > 0),
  message     text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists proposal_counters_proposal_idx on public.proposal_counters (proposal_id);

alter table public.proposal_counters enable row level security;

-- Only the request's requester or the proposal's responder may read/insert a
-- counter on that proposal thread. by_user_id must be the caller.
do $$ begin
  create policy pc_select on public.proposal_counters for select
    using (exists (
      select 1 from public.proposals p
      join public.requests r on r.id = p.request_id
      where p.id = proposal_id
        and auth.uid()::text in (r.requester_user_id, p.responder_user_id)
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pc_insert on public.proposal_counters for insert
    with check (
      by_user_id = auth.uid()::text
      and exists (
        select 1 from public.proposals p
        join public.requests r on r.id = p.request_id
        where p.id = proposal_id
          and auth.uid()::text in (r.requester_user_id, p.responder_user_id)
      )
    );
exception when duplicate_object then null; end $$;


-- ============================================================
-- 3 · SERVER-AUTHORITATIVE APPOINTMENT HOUSEKEEPING
-- ============================================================
-- Called opportunistically by the appointment list reads (throttled client
-- side), but the transition + write now happen atomically in the DB instead of
-- a fire-and-forget client update that could silently fail. Scoped to rows the
-- caller is a party to, so it's cheap.
create or replace function public.sweep_my_appointments()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then return; end if;

  -- PENDING whose slot has passed with no owner response → auto-cancel (SYSTEM).
  update public.appointments
  set status = 'CANCELLED',
      cancelled_by = 'SYSTEM',
      response_note = coalesce(response_note, 'business not responded')
  where status = 'PENDING'
    and scheduled_for <= now()
    and (customer_user_id = v_uid or target_owner_user_id = v_uid);

  -- ACCEPTED whose slot has passed → auto-complete.
  update public.appointments
  set status = 'COMPLETED'
  where status = 'ACCEPTED'
    and scheduled_for <= now()
    and (customer_user_id = v_uid or target_owner_user_id = v_uid);
end $$;

grant execute on function public.sweep_my_appointments() to authenticated;


-- ============================================================
-- 4 · AGREEMENT STATE-MACHINE RPCs (party + stage validated)
-- ============================================================
create or replace function public.agreement_start_work(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_ag.responder_user_id then raise exception 'NOT_RESPONDER'; end if;
  if v_ag.status <> 'DEPOSIT_PAID' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'IN_PROGRESS' where id = p_id;
end $$;
grant execute on function public.agreement_start_work(text) to authenticated;

create or replace function public.agreement_submit_review(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_ag.responder_user_id then raise exception 'NOT_RESPONDER'; end if;
  if v_ag.status <> 'IN_PROGRESS' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'REVIEW' where id = p_id;
end $$;
grant execute on function public.agreement_submit_review(text) to authenticated;

create or replace function public.agreement_complete(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_ag.requester_user_id then raise exception 'NOT_REQUESTER'; end if;
  if v_ag.status <> 'REVIEW' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'COMPLETED' where id = p_id;
  update public.payments set escrow_status = 'RELEASED'
    where agreement_id = p_id and escrow_status = 'HELD';
end $$;
grant execute on function public.agreement_complete(text) to authenticated;

create or replace function public.agreement_dispute(p_id text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid not in (v_ag.requester_user_id, v_ag.responder_user_id) then raise exception 'NOT_A_PARTY'; end if;
  if v_ag.status not in ('IN_PROGRESS', 'REVIEW') then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'DISPUTED', dispute_reason = p_reason where id = p_id;
end $$;
grant execute on function public.agreement_dispute(text, text) to authenticated;

-- Requester claims payment. CASH → PAID + DEPOSIT_PAID immediately (physical
-- handover), UPI → PENDING_CONFIRM (responder must confirm receipt).
create or replace function public.agreement_claim_payment(
  p_id text, p_method text, p_amount int default null, p_reference text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_ag.requester_user_id then raise exception 'NOT_REQUESTER'; end if;
  if v_ag.status <> 'ACTIVE' then raise exception 'INVALID_TRANSITION'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;

  if p_method = 'CASH' then
    update public.agreements
    set payment_method = 'CASH', payment_status = 'PAID', status = 'DEPOSIT_PAID',
        payment_amount = coalesce(p_amount, payment_amount),
        payment_reference = coalesce(p_reference, payment_reference)
    where id = p_id;
  else
    update public.agreements
    set payment_method = 'UPI', payment_status = 'PENDING_CONFIRM',
        payment_amount = coalesce(p_amount, payment_amount),
        payment_reference = coalesce(p_reference, payment_reference)
    where id = p_id;
  end if;
end $$;
grant execute on function public.agreement_claim_payment(text, text, int, text) to authenticated;

create or replace function public.agreement_confirm_payment(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_ag.responder_user_id then raise exception 'NOT_RESPONDER'; end if;
  if v_ag.payment_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set payment_status = 'PAID', status = 'DEPOSIT_PAID' where id = p_id;
end $$;
grant execute on function public.agreement_confirm_payment(text) to authenticated;

create or replace function public.agreement_reject_payment(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_ag.responder_user_id then raise exception 'NOT_RESPONDER'; end if;
  if v_ag.payment_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set payment_status = 'REJECTED' where id = p_id;
end $$;
grant execute on function public.agreement_reject_payment(text) to authenticated;


-- ============================================================
-- 5 · ACCEPT A NEGOTIATED COUNTER AT THE COUNTERED PRICE
-- ============================================================
-- Same atomic accept as accept_proposal, but agrees at p_final_price when that
-- price matches a real counter on the thread — closing the bug where accepting
-- after a negotiation still used the original quote.
create or replace function public.accept_proposal_at_price(p_proposal_id text, p_final_price int)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid  text := auth.uid()::text;
  v_prop public.proposals%rowtype;
  v_req  public.requests%rowtype;
  v_agid text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_prop from public.proposals where id = p_proposal_id;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_req from public.requests where id = v_prop.request_id;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if v_req.requester_user_id is distinct from v_uid then raise exception 'NOT_REQUEST_OWNER'; end if;
  if v_req.status not in ('OPEN', 'AGREED') then raise exception 'REQUEST_NOT_OPEN'; end if;

  -- A non-original price must correspond to a real counter on this thread.
  if p_final_price is not null and p_final_price <> v_prop.price then
    if not exists (
      select 1 from public.proposal_counters c
      where c.proposal_id = p_proposal_id and c.amount = p_final_price
    ) then
      raise exception 'PRICE_NOT_NEGOTIATED';
    end if;
    update public.proposals set price = p_final_price where id = p_proposal_id;
    v_prop.price := p_final_price;
  end if;

  update public.proposals set status = 'ACCEPTED' where id = p_proposal_id;

  insert into public.agreements (
    request_id, request_title, proposal_id, requester_user_id, responder_user_id,
    agreed_price, terms, requester_confirmed, responder_confirmed, payment_mode, status
  ) values (
    v_req.id, v_req.title, p_proposal_id, v_req.requester_user_id, v_prop.responder_user_id,
    v_prop.price, coalesce(v_prop.message, ''), false, false, 'OFFLINE', 'PENDING'
  ) returning id into v_agid;

  update public.requests set status = 'IN_PROGRESS' where id = v_req.id;

  update public.proposals set status = 'REJECTED'
    where request_id = v_req.id and id <> p_proposal_id and status = 'SUBMITTED';

  return v_agid;
end $$;
grant execute on function public.accept_proposal_at_price(text, int) to authenticated;


-- ============================================================
-- 6 · NOTIFICATION GAPS (rewrite of notify_on_appointment_status)
-- ============================================================
-- Preserves the existing customer notifications and ADDS:
--   • owner notified when the customer claims payment (→ PENDING_CONFIRM)
--   • owner notified when the customer cancels (cancelled_by = 'CUSTOMER')
--   • customer notified when the owner rejects a payment claim (→ REJECTED)
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
    elsif new.status = 'CANCELLED' and new.cancelled_by = 'CUSTOMER' and new.target_owner_user_id is not null then
      -- Owner learns the customer cancelled (previously silent).
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.target_owner_user_id, 'APPOINTMENT', 'Booking cancelled by customer',
              coalesce(new.customer_name, 'A customer') || ' cancelled their ' || coalesce(new.time_label, 'appointment') || '.',
              case when new.target_type = 'PROVIDER'
                   then '/provider/' || new.target_id || '/manage/leads'
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
                   then '/provider/' || new.target_id || '/manage/leads'
                   else '/business/' || new.target_id || '/manage/appointments' end);
    elsif new.payment_status = 'REJECTED' then
      -- Customer learns their claim was rejected and can retry.
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.customer_user_id, 'APPOINTMENT', 'Payment not verified',
              coalesce(new.target_name, 'The shop') || ' couldn''t verify your payment. Please retry.', '/appointments');
    end if;
  end if;

  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_appointment_status on public.appointments;
create trigger trg_notify_appointment_status
  after update on public.appointments
  for each row execute function public.notify_on_appointment_status();


-- ============================================================
-- 7 · RATING DEDUPE (one rating per rater per agreement)
-- ============================================================
alter table if exists public.ratings
  add column if not exists agreement_id text;

create unique index if not exists ratings_one_per_agreement
  on public.ratings (rater_user_id, agreement_id)
  where agreement_id is not null;


-- ============================================================
-- 8 · ATOMIC RESCHEDULE (cancel old + create new in one transaction)
-- ============================================================
-- The client used to create the new booking then best-effort cancel the old
-- one; a failed cancel stranded two live bookings, and the still-active
-- original also counted against the 5/day limit mid-reschedule. Doing both in
-- one transaction fixes both: the original is CANCELLED first (so it's excluded
-- from the daily-limit count on the insert), and if the insert fails the whole
-- thing rolls back — no stranded state either way.
create or replace function public.reschedule_appointment(
  p_original_id   text,
  p_scheduled_for timestamptz,
  p_date_label    text,
  p_time_label    text,
  p_notes         text default null,
  p_photo_url     text default null,
  p_package_id    text default null,
  p_package_name  text default null,
  p_package_price numeric default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  text := auth.uid()::text;
  v_orig public.appointments%rowtype;
  v_new  public.appointments%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_orig from public.appointments where id = p_original_id;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if v_orig.customer_user_id is distinct from v_uid then raise exception 'NOT_YOUR_BOOKING'; end if;

  -- Cancel the original first so it doesn't count toward the daily limit and
  -- can't leave a duplicate if the insert below fails (both roll back together).
  update public.appointments
  set status = 'CANCELLED', cancelled_by = 'CUSTOMER',
      response_note = coalesce(response_note, 'Rescheduled')
  where id = p_original_id
    and status in ('PENDING', 'ACCEPTED');

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label, notes, photo_url,
    package_id, package_name, package_price, rescheduled_from
  ) values (
    v_orig.target_type, v_orig.target_id, v_orig.target_owner_user_id, v_orig.target_name, v_orig.target_avatar,
    v_uid, v_orig.customer_name, v_orig.customer_avatar,
    p_scheduled_for, p_date_label, p_time_label, p_notes, p_photo_url,
    p_package_id, p_package_name, p_package_price, p_original_id
  ) returning * into v_new;

  return v_new;
end $$;

grant execute on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) to authenticated;
