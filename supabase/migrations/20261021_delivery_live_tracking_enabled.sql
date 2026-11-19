-- ==============================================================================
-- 20261021 — Enable live map tracking for delivery customers
--
-- Enables real-time coordinate streaming for active deliveries (EN_ROUTE, ARRIVED)
-- so customers can track their delivery partner on an interactive map.
-- Coordinates remain NULL before pickup (ASSIGNED) and after delivery (DELIVERED).
-- ==============================================================================

-- ── 1. my_delivery_progress: return live agent, store, and destination coordinates ──
drop function if exists public.my_delivery_progress(text);

create or replace function public.my_delivery_progress(p_appointment_id text)
returns table(
  id text,
  status text,
  live_status text,
  handoff_code text,
  handoff_verified boolean,
  agent_name text,
  agent_phone text,
  agent_avatar text,
  agent_revealed boolean,
  eta_text text,
  stops_before integer,
  cancel_reason text,
  cancel_note text,
  eta_minutes integer,
  business_phone text,
  picked_up boolean,
  agent_lat double precision,
  agent_lng double precision,
  agent_heading double precision,
  agent_position_at timestamptz,
  store_lat double precision,
  store_lng double precision,
  store_name text,
  store_address text,
  dest_lat double precision,
  dest_lng double precision,
  dest_address text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  return query
  select d.id,
    d.status,
    d.live_status,
    d.handoff_code,
    d.handoff_verified,
    case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then public.person_first_name(d.agent_user_id) else null end,
    case when d.status in ('EN_ROUTE','ARRIVED') then u.phone else null end,
    case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.avatar else null end,
    (d.status in ('EN_ROUTE','ARRIVED','DELIVERED')),
    a.delivery_eta_text,
    (select count(*)::int from public.appointment_deliveries d2
       where d2.batch_id = d.batch_id and d.batch_id is not null
         and d2.stop_order is not null and d.stop_order is not null
         and d2.stop_order < d.stop_order
         and d2.status not in ('DELIVERED','CANCELLED')),
    d.cancel_reason,
    d.cancel_note,
    -- Dynamic ETA in minutes from live rider position
    case
      when d.status = 'EN_ROUTE'
       and coalesce(batch.position_at, d.position_at) > now() - interval '5 minutes'
       and coalesce(batch.lat, d.lat) is not null and coalesce(batch.lng, d.lng) is not null
       and a.delivery_lat is not null and a.delivery_lng is not null
      then greatest(
             2,
             ceil(
               ST_Distance(
                 ST_SetSRID(ST_MakePoint(coalesce(batch.lng, d.lng), coalesce(batch.lat, d.lat)), 4326)::geography,
                 ST_SetSRID(ST_MakePoint(a.delivery_lng, a.delivery_lat), 4326)::geography
               ) / 1000.0 / 18.0 * 60.0
             )
             + 6 * coalesce((select count(*) from public.appointment_deliveries d3
                              where d3.batch_id = d.batch_id and d.batch_id is not null
                                and d3.stop_order is not null and d.stop_order is not null
                                and d3.stop_order < d.stop_order
                                and d3.status not in ('DELIVERED','CANCELLED')), 0)
           )::int
      else null
    end,
    b.phone,
    (d.picked_up_at is not null),
    -- Live agent coordinates revealed ONLY when EN_ROUTE or ARRIVED
    case when d.status in ('EN_ROUTE','ARRIVED') then coalesce(batch.lat, d.lat) else null end,
    case when d.status in ('EN_ROUTE','ARRIVED') then coalesce(batch.lng, d.lng) else null end,
    case when d.status in ('EN_ROUTE','ARRIVED') then coalesce(batch.heading, d.heading) else null end,
    case when d.status in ('EN_ROUTE','ARRIVED') then coalesce(batch.position_at, d.position_at) else null end,
    -- Store / Pickup info
    b.lat,
    b.lng,
    b.name,
    b.address,
    -- Customer destination info
    a.delivery_lat,
    a.delivery_lng,
    a.delivery_address_line
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.users u on u.id = d.agent_user_id
  left join public.businesses b on b.id = a.target_id
  left join public.delivery_batches batch on batch.id = d.batch_id
  where d.appointment_id = p_appointment_id
    and a.customer_user_id = v_uid
  order by d.created_at desc
  limit 1;
end $function$;

revoke all on function public.my_delivery_progress(text) from public, anon;
grant execute on function public.my_delivery_progress(text) to authenticated;

-- ── 2. get_tracking: return live delivery coordinates for public tracking page ──
drop function if exists public.get_tracking(text);

create or replace function public.get_tracking(p_token text)
returns table(
  agreement_id text,
  provider_lat double precision,
  provider_lng double precision,
  live_status text,
  provider_name text,
  provider_avatar text,
  stops_before integer,
  dest_lat double precision,
  dest_lng double precision,
  store_lat double precision,
  store_lng double precision,
  store_name text,
  agent_heading double precision,
  eta_minutes integer,
  is_delivery boolean
)
language sql
security definer
set search_path to 'public'
as $function$
  -- Agreements: provider live-share (unchanged)
  select a.id,
         a.provider_lat,
         a.provider_lng,
         a.live_status,
         u.name,
         u.avatar,
         null::int,
         null::double precision as dest_lat,
         null::double precision as dest_lng,
         null::double precision as store_lat,
         null::double precision as store_lng,
         null::text as store_name,
         null::double precision as agent_heading,
         null::integer as eta_minutes,
         false as is_delivery
  from public.tracking_tokens t
  join public.agreements a on a.id = t.agreement_id
  left join public.users u on u.id = a.responder_user_id
  where t.id::text = p_token and t.expires_at > now() and t.agreement_id is not null
  union all
  -- Deliveries: live tracking coordinates when EN_ROUTE or ARRIVED
  select d.appointment_id,
         case when d.status in ('EN_ROUTE','ARRIVED') then coalesce(batch.lat, d.lat) else null end,
         case when d.status in ('EN_ROUTE','ARRIVED') then coalesce(batch.lng, d.lng) else null end,
         case when d.status = 'DELIVERED' then 'DONE' when d.status = 'CANCELLED' then 'CANCELLED' else d.live_status end,
         case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then public.person_first_name(d.agent_user_id) else null end,
         case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.avatar else null end,
         (select count(*)::int from public.appointment_deliveries d2
            where d2.batch_id = d.batch_id and d.batch_id is not null
              and d2.stop_order is not null and d.stop_order is not null
              and d2.stop_order < d.stop_order
              and d2.status not in ('DELIVERED','CANCELLED')),
         a.delivery_lat,
         a.delivery_lng,
         b.lat,
         b.lng,
         b.name,
         case when d.status in ('EN_ROUTE','ARRIVED') then coalesce(batch.heading, d.heading) else null end,
         case
           when d.status = 'EN_ROUTE'
            and coalesce(batch.position_at, d.position_at) > now() - interval '5 minutes'
            and coalesce(batch.lat, d.lat) is not null and coalesce(batch.lng, d.lng) is not null
            and a.delivery_lat is not null and a.delivery_lng is not null
           then greatest(
                  2,
                  ceil(
                    ST_Distance(
                      ST_SetSRID(ST_MakePoint(coalesce(batch.lng, d.lng), coalesce(batch.lat, d.lat)), 4326)::geography,
                      ST_SetSRID(ST_MakePoint(a.delivery_lng, a.delivery_lat), 4326)::geography
                    ) / 1000.0 / 18.0 * 60.0
                  )
                  + 6 * coalesce((select count(*) from public.appointment_deliveries d3
                                   where d3.batch_id = d.batch_id and d.batch_id is not null
                                     and d3.stop_order is not null and d.stop_order is not null
                                     and d3.stop_order < d.stop_order
                                     and d3.status not in ('DELIVERED','CANCELLED')), 0)
                )::int
           else null
         end,
         true as is_delivery
  from public.tracking_tokens t
  join lateral (
    select d0.* from public.appointment_deliveries d0
     where d0.appointment_id = t.appointment_id
     order by d0.created_at desc limit 1
  ) d on true
  join public.appointments a on a.id = d.appointment_id
  left join public.businesses b on b.id = a.target_id
  left join public.users u on u.id = d.agent_user_id
  left join public.delivery_batches batch on batch.id = d.batch_id
  where t.id::text = p_token and t.expires_at > now() and t.appointment_id is not null;
$function$;

revoke all on function public.get_tracking(text) from public, anon;
grant execute on function public.get_tracking(text) to anon, authenticated;
