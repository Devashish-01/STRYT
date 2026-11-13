-- ============================================================
-- 20261012 — An appointment's state and money only change through functions (GAPS #39, #40)
--
-- #39  appointment_transition is the appointment state machine, but RLS
--      appt_update still let the target owner and any appointments-scoped team
--      member UPDATE the row directly, with status / payment columns granted.
--      From the browser a shop could reopen an order the customer cancelled,
--      mark a delivery COMPLETED with no rider or hand-over code, rewrite the
--      payment record, and (each cancel -> reopen -> cancel) re-run
--      trg_restock_on_order_end so stock drifted upward. The app never does
--      this — every app write is an RPC — so direct writes to these columns are
--      now refused for client roles. SECURITY DEFINER functions, cron jobs and
--      the service role run as their owner and are untouched (checked: every
--      function that updates public.appointments is SECURITY DEFINER).
-- #40  appointment_set_unpaid_amount set amount + payment_status = 'UNPAID' on
--      ANY order, so a PAID, CANCELLED or REJECTED one could be flipped back
--      to unpaid. It now only acts where the app offers it (BusinessAppointments
--      / ProviderJobs "Record payment" -> "Save to tab"): payment UNPAID or
--      REJECTED, order PENDING / ACCEPTED / COMPLETED.
--      The app's direct-table fallback for this RPC is removed in the same change.
-- Rollback: supabase/rollbacks/20261012_appointment_writes_via_functions.rollback.sql
-- Test:     supabase/tests/appointment_writes_via_functions.test.sql
-- ============================================================

-- ── 1. Guard the lifecycle and money columns against direct client writes ───
create or replace function public.guard_appointment_state_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.status            is distinct from old.status
  or new.payment_status    is distinct from old.payment_status
  or new.payment_amount    is distinct from old.payment_amount
  or new.package_price     is distinct from old.package_price
  or new.delivery_fee      is distinct from old.delivery_fee
  or new.cancelled_by      is distinct from old.cancelled_by
  or new.cash_collected_at is distinct from old.cash_collected_at
  or new.cash_settled_at   is distinct from old.cash_settled_at
  then
    raise exception 'APPOINTMENT_CHANGE_NEEDS_FUNCTION' using errcode = '42501',
      hint = 'Status and payment changes go through appointment_transition and the payment functions.';
  end if;
  return new;
end
$function$;

revoke all on function public.guard_appointment_state_columns() from public, anon, authenticated;

drop trigger if exists trg_guard_appointment_state_columns on public.appointments;
create trigger trg_guard_appointment_state_columns
  before update on public.appointments
  for each row execute function public.guard_appointment_state_columns();

-- ── 2. "Save to tab" only on an order that is still owed ────────────────────
create or replace function public.appointment_set_unpaid_amount(p_id text, p_amount numeric)
returns appointments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_APPOINTMENT_MANAGER'; end if;

  -- A confirmed or claimed payment is never overwritten, and a closed order owes nothing.
  if coalesce(v_appointment.payment_status, 'UNPAID') not in ('UNPAID', 'REJECTED')
     or v_appointment.status not in ('PENDING', 'ACCEPTED', 'COMPLETED') then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.appointments
     set package_price = p_amount, payment_amount = p_amount, payment_status = 'UNPAID'
   where id = p_id
  returning * into v_appointment;
  return v_appointment;
end
$function$;

revoke all on function public.appointment_set_unpaid_amount(text, numeric) from public, anon;
grant execute on function public.appointment_set_unpaid_amount(text, numeric) to authenticated;

notify pgrst, 'reload schema';
