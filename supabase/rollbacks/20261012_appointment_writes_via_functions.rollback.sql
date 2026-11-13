-- Rollback for 20261012_appointment_writes_via_functions.sql — restores what was live before it.

-- 1. no guard on direct appointment writes
drop trigger if exists trg_guard_appointment_state_columns on public.appointments;
drop function if exists public.guard_appointment_state_columns();

-- 2. appointment_set_unpaid_amount without the payment / status check (live definition read 2026-11-13)
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
    or (v_appointment.target_type = 'BUSINESS' and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_APPOINTMENT_MANAGER'; end if;
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
