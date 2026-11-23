-- ==============================================================================
-- 20261025 — Teleportation and Telemetry Hardening (ROLLBACK)
-- ==============================================================================

drop table if exists public.delivery_location_history cascade;

alter table public.appointment_deliveries
  drop column if exists accuracy,
  drop column if exists arrival_notified_at;

-- Reverts update_delivery_position to 20261003 signature
create or replace function public.update_delivery_position(
  p_delivery_id text, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null::double precision, p_heading double precision default null::double precision
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_lat < -90  or p_lat > 90  then raise exception 'INVALID_LATITUDE';  end if;
  if p_lng < -180 or p_lng > 180 then raise exception 'INVALID_LONGITUDE'; end if;

  update public.appointment_deliveries
     set lat = p_lat, lng = p_lng, heading = coalesce(p_heading, heading), position_at = now()
   where id = p_delivery_id
     and agent_user_id = v_uid
     and status in ('EN_ROUTE','ARRIVED')
     and (position_at is null or position_at < now() - interval '2 seconds');
end $function$;

revoke all on function public.update_delivery_position(text, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.update_delivery_position(text, double precision, double precision, double precision, double precision) to authenticated;

-- Reverts update_delivery_batch_position to 20261003 signature
create or replace function public.update_delivery_batch_position(
  p_batch_id text, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null::double precision, p_heading double precision default null::double precision
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_lat < -90 or p_lat > 90 then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng < -180 or p_lng > 180 then raise exception 'INVALID_LONGITUDE'; end if;
  if not exists (select 1 from public.delivery_batches
                  where id = p_batch_id and agent_user_id = v_uid and status in ('ACCEPTED','IN_PROGRESS')) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.delivery_batches
     set lat = p_lat, lng = p_lng, accuracy = p_accuracy, heading = p_heading, position_at = now()
   where id = p_batch_id and agent_user_id = v_uid and status in ('ACCEPTED','IN_PROGRESS')
     and (position_at is null or position_at < now() - interval '2 seconds');
end $function$;

revoke all on function public.update_delivery_batch_position(text, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.update_delivery_batch_position(text, double precision, double precision, double precision, double precision) to authenticated;
