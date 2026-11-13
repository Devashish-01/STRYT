-- Rollback for 20261015_visit_outcome.sql — restores the definitions live before it (read 2026-11-13).

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'sweep-stale-appointments';
  end if;
end
$cron$;
drop function if exists public.sweep_stale_appointments();

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
  v_cancelled_by text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_is_customer := v_appointment.customer_user_id = v_uid and not v_appointment.is_walk_in;
  v_is_manager := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));

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
  elsif v_is_manager and v_appointment.status = 'COMPLETED'
        and p_status = 'NO_SHOW' and v_appointment.fulfillment_type is distinct from 'DELIVERY' then
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
  where status = 'ACCEPTED' and scheduled_for <= now() and fulfillment_type is distinct from 'DELIVERY'
    and (customer_user_id = v_uid or target_owner_user_id = v_uid
      or (target_type = 'BUSINESS' and public.has_business_access(target_id, v_uid)));
end
$function$;

revoke all on function public.sweep_my_appointments() from public, anon;
grant execute on function public.sweep_my_appointments() to authenticated;

notify pgrst, 'reload schema';
