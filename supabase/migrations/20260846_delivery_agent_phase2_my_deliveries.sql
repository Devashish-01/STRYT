-- Delivery Agent — Phase 2 support: the agent's own delivery list.
-- The delivery agent is not a participant on the appointment (appointments RLS
-- won't expose it), so this SECURITY DEFINER function returns the enriched list
-- for the calling agent only, applying the alias-reveal rule: the customer's
-- real name shows only while the delivery is active (ASSIGNED/EN_ROUTE/ARRIVED),
-- and their alias once it's terminal. See app-plans/09_delivery_boy_flow.md.
CREATE OR REPLACE FUNCTION public.my_deliveries()
RETURNS TABLE(
  id text, appointment_id text, business_id text, business_name text,
  customer_name text, customer_area text, scheduled_for timestamptz,
  date_label text, time_label text, status text, live_status text,
  handoff_code text, handoff_verified boolean, lat double precision, lng double precision,
  created_at timestamptz, delivered_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select d.id, d.appointment_id, d.business_id, b.name,
    case when d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
         then coalesce(a.customer_name, cu.name, 'Customer')
         else coalesce(cu.alias, 'Customer') end,
    cu.area,
    a.scheduled_for, a.date_label, a.time_label,
    d.status, d.live_status, d.handoff_code, d.handoff_verified, d.lat, d.lng,
    d.created_at, d.delivered_at
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.businesses b on b.id = d.business_id
  left join public.users cu on cu.id = a.customer_user_id
  where d.agent_user_id = (auth.uid())::text
  order by
    case d.status when 'EN_ROUTE' then 0 when 'ARRIVED' then 1 when 'ASSIGNED' then 2 else 3 end,
    coalesce(a.scheduled_for, d.created_at) desc;
$function$;

GRANT EXECUTE ON FUNCTION public.my_deliveries() TO authenticated;
