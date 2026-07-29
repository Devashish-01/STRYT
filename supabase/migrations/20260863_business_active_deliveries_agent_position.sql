-- business_active_deliveries only ever selected batch.lat/batch.lng (joined via
-- batch_id) — never d.lat/d.lng, the column a SOLO (non-batched) delivery
-- actually writes its live position to. So an owner watching an individually
-- assigned delivery saw no agent marker at all on the live-deliveries map,
-- even though the agent's phone was dutifully pushing GPS the whole time.
--
-- Fix: coalesce batch position with the stop's own position, and rename the
-- output columns batch_lat/batch_lng/batch_heading -> agent_lat/agent_lng/
-- agent_heading, since "batch_lat" is a misleading name the moment it can
-- also carry a solo agent's position. Column-name/shape change requires
-- DROP FUNCTION before CREATE (CREATE OR REPLACE rejects a changed return
-- type).
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as
-- `business_active_deliveries_agent_position`.
drop function if exists public.business_active_deliveries(text);

create function public.business_active_deliveries(p_business_id text)
returns table(
  id text, appointment_id text,
  status text, live_status text,
  agent_user_id text, agent_name text, agent_avatar text, agent_phone text,
  customer_name text, delivery_address_line text,
  delivery_lat double precision, delivery_lng double precision,
  delivery_eta_text text,
  scheduled_for timestamptz, date_label text, time_label text,
  batch_id text, stop_order int, batch_status text,
  agent_lat double precision, agent_lng double precision, agent_heading double precision,
  handoff_verified boolean,
  created_at timestamptz, delivered_at timestamptz
)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, v_uid, 'appointments') then
    raise exception 'NOT_ALLOWED';
  end if;

  return query
  select d.id, d.appointment_id,
    d.status, d.live_status,
    d.agent_user_id, coalesce(au.name, 'Delivery agent'), au.avatar, au.phone,
    coalesce(a.customer_name, 'Customer'), a.delivery_address_line,
    a.delivery_lat, a.delivery_lng,
    a.delivery_eta_text,
    a.scheduled_for, a.date_label, a.time_label,
    d.batch_id, d.stop_order, batch.status,
    coalesce(batch.lat, d.lat), coalesce(batch.lng, d.lng), batch.heading,
    d.handoff_verified,
    d.created_at, d.delivered_at
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.users au on au.id = d.agent_user_id
  left join public.delivery_batches batch on batch.id = d.batch_id
  where d.business_id = p_business_id
  order by
    case d.status when 'EN_ROUTE' then 0 when 'ARRIVED' then 1 when 'ASSIGNED' then 2 else 3 end,
    coalesce(d.stop_order, 999),
    d.created_at desc;
end $function$;

REVOKE ALL ON FUNCTION public.business_active_deliveries(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.business_active_deliveries(text) TO authenticated;
