-- ============================================================
-- 20261015 — A visit is completed by the shop, not by the clock (GAPS #44)
--
-- Before: no action meant "the service happened". appointment_transition had
-- no ACCEPTED -> COMPLETED edge; the only writer was sweep_my_appointments,
-- which flipped ACCEPTED -> COMPLETED the moment scheduled_for (the START of
-- the slot) passed, and only when the customer's or the owner's app happened
-- to call it (no cron). A no-show customer became "completed", and NO_SHOW
-- was reachable only after that (COMPLETED -> NO_SHOW).
--
-- Now (slot bookings only; delivery orders keep their own machine):
--   1. appointment_transition — the shop (owner or appointments scope) can
--        ACCEPTED -> COMPLETED  "Done", from 60 min before the slot onwards
--        ACCEPTED -> NO_SHOW    once the slot has started
--      COMPLETED -> NO_SHOW stays, to correct an automatic completion.
--   2. Auto-complete is a fallback only: ACCEPTED bookings complete 6 hours
--      after their start if the shop did neither. sweep_my_appointments keeps
--      its signature and its PENDING -> CANCELLED rule; its completion rule
--      gets the grace period.
--   3. sweep_stale_appointments() runs the same two rules for every row, from
--      pg_cron every 15 minutes ('sweep-stale-appointments'), so nothing waits
--      for someone to open a list. Not callable by clients.
-- Rollback: supabase/rollbacks/20261015_visit_outcome.rollback.sql
-- Test:     supabase/tests/visit_outcome.test.sql
-- ============================================================

-- ── 1. The shop records how the visit went ──────────────────────────────────
create or replace function public.appointment_transition(p_id text, p_status text, p_response_note text default null::text)
returns appointments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_is_customer boolean;
  v_is_manager boolean;
  v_is_slot boolean;
  v_cancelled_by text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_is_customer := v_appointment.customer_user_id = v_uid and not v_appointment.is_walk_in;
  v_is_manager := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
  v_is_slot := v_appointment.fulfillment_type is distinct from 'DELIVERY';

  if v_is_customer and p_status = 'CANCELLED'
     and v_appointment.status in ('PENDING', 'ACCEPTED') then
    if exists (select 1 from public.appointment_deliveries d
                where d.appointment_id = p_id
                  and (d.status in ('EN_ROUTE', 'ARRIVED') or (d.status = 'ASSIGNED' and d.picked_up_at is not null))) then
      raise exception 'DELIVERY_IN_PROGRESS';
    end if;
    v_cancelled_by := 'CUSTOMER';
  elsif v_is_manager and v_appointment.status = 'PENDING'
        and p_status in ('ACCEPTED', 'REJECTED') then
    v_cancelled_by := null;
  elsif v_is_manager and v_appointment.status = 'ACCEPTED'
        and p_status = 'CANCELLED' then
    v_cancelled_by := 'OWNER';
  elsif v_is_manager and v_is_slot and v_appointment.status = 'ACCEPTED' and p_status = 'COMPLETED' then
    if v_appointment.scheduled_for > now() + interval '60 minutes' then raise exception 'VISIT_NOT_STARTED'; end if;
    v_cancelled_by := null;
  elsif v_is_manager and v_is_slot and v_appointment.status = 'ACCEPTED' and p_status = 'NO_SHOW' then
    if v_appointment.scheduled_for > now() then raise exception 'VISIT_NOT_STARTED'; end if;
    v_cancelled_by := null;
  elsif v_is_manager and v_is_slot and v_appointment.status = 'COMPLETED' and p_status = 'NO_SHOW' then
    v_cancelled_by := null;
  else
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.appointments
  set status = p_status,
      response_note = case when p_response_note is null then response_note
        else nullif(left(trim(p_response_note), 1000), '') end,
      cancelled_by = case when p_status = 'CANCELLED' then v_cancelled_by else cancelled_by end
  where id = p_id and status = v_appointment.status
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$function$;

revoke all on function public.appointment_transition(text, text, text) from public, anon;
grant execute on function public.appointment_transition(text, text, text) to authenticated;

-- ── 2. The caller's own sweep: completion waits 6 hours for the shop ────────
create or replace function public.sweep_my_appointments()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  update public.appointments
  set status = 'CANCELLED', cancelled_by = 'SYSTEM',
      response_note = coalesce(response_note, 'business not responded')
  where status = 'PENDING' and scheduled_for <= now() and not is_asap
    and (customer_user_id = v_uid or target_owner_user_id = v_uid
      or (target_type = 'BUSINESS' and public.has_business_access(target_id, v_uid)));

  update public.appointments set status = 'COMPLETED'
  where status = 'ACCEPTED' and scheduled_for <= now() - interval '6 hours' and fulfillment_type is distinct from 'DELIVERY'
    and (customer_user_id = v_uid or target_owner_user_id = v_uid
      or (target_type = 'BUSINESS' and public.has_business_access(target_id, v_uid)));
end
$function$;

revoke all on function public.sweep_my_appointments() from public, anon;
grant execute on function public.sweep_my_appointments() to authenticated;

-- ── 3. The same rules for everyone, on a timer ──────────────────────────────
create or replace function public.sweep_stale_appointments()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.appointments
  set status = 'CANCELLED', cancelled_by = 'SYSTEM',
      response_note = coalesce(response_note, 'business not responded')
  where status = 'PENDING' and scheduled_for <= now() and not is_asap;

  update public.appointments set status = 'COMPLETED'
  where status = 'ACCEPTED' and scheduled_for <= now() - interval '6 hours' and fulfillment_type is distinct from 'DELIVERY';
end
$function$;

revoke all on function public.sweep_stale_appointments() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'sweep-stale-appointments';
    perform cron.schedule('sweep-stale-appointments', '*/15 * * * *', 'select public.sweep_stale_appointments();');
  end if;
end
$cron$;

notify pgrst, 'reload schema';
