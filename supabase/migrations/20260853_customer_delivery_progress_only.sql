-- ============================================================
-- 20260853 — Customer sees delivery PROGRESS only
--
-- APPLIED TO PRODUCTION as migration `customer_delivery_progress_only`.
--
-- Product decision: customers no longer get live tracking of a delivery agent.
-- They see progress (assigned → on the way → arrived → delivered) and their
-- own handoff code; the agent's name/phone/photo appear only once THEIR
-- delivery has actually started.
--
-- This is enforced server-side on purpose. Hiding the map in the UI is not
-- sufficient: get_tracking is granted to `anon` and its token is shareable, and
-- the customer previously had a direct RLS SELECT on appointment_deliveries
-- (which carries lat/lng and agent_user_id). Both paths are closed here.
--
-- The AGREEMENT branch of get_tracking is deliberately untouched — that's the
-- separate provider live-share feature where live tracking is the point.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_tracking(text);
CREATE OR REPLACE FUNCTION public.get_tracking(p_token text)
 RETURNS TABLE(agreement_id text, provider_lat double precision, provider_lng double precision,
               live_status text, provider_name text, provider_avatar text, stops_before int,
               dest_lat double precision, dest_lng double precision)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- Agreements: unchanged, live tracking intended.
  select a.id, a.provider_lat, a.provider_lng, a.live_status, u.name, u.avatar, null::int,
         null::double precision, null::double precision
  from public.tracking_tokens t
  join public.agreements a on a.id = t.agreement_id
  left join public.users u on u.id = a.responder_user_id
  where t.id::text = p_token and t.expires_at > now() and t.agreement_id is not null
  union all
  -- Deliveries: progress only.
  --  * lat/lng always NULL — no live position for the customer, ever.
  --  * agent name/avatar revealed only once THIS stop is EN_ROUTE or later.
  --  * stops_before still returned: it's a queue position, not a location.
  select d.appointment_id,
         null::double precision, null::double precision,
         d.live_status,
         case when d.status in ('EN_ROUTE','ARRIVED') then u.name else null end,
         case when d.status in ('EN_ROUTE','ARRIVED') then u.avatar else null end,
         (select count(*)::int from public.appointment_deliveries d2
            where d2.batch_id = d.batch_id and d.batch_id is not null
              and d2.stop_order is not null and d.stop_order is not null
              and d2.stop_order < d.stop_order
              and d2.status not in ('DELIVERED','CANCELLED')),
         null::double precision, null::double precision
  from public.tracking_tokens t
  join public.appointment_deliveries d
    on d.appointment_id = t.appointment_id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
  left join public.users u on u.id = d.agent_user_id
  where t.id::text = p_token and t.expires_at > now() and t.appointment_id is not null;
$function$;

GRANT EXECUTE ON FUNCTION public.get_tracking(text) TO anon, authenticated;

-- Customer-facing delivery progress for their own appointment. Replaces the
-- direct appointment_deliveries SELECT the client used to do.
CREATE OR REPLACE FUNCTION public.my_delivery_progress(p_appointment_id text)
RETURNS TABLE(
  id text, status text, live_status text,
  handoff_code text, handoff_verified boolean,
  agent_name text, agent_phone text, agent_avatar text,
  agent_revealed boolean,
  eta_text text, stops_before int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  return query
  select d.id, d.status, d.live_status,
    -- The handoff code is the customer's to show the agent, so they see it.
    d.handoff_code, d.handoff_verified,
    case when d.status in ('EN_ROUTE','ARRIVED') then u.name else null end,
    case when d.status in ('EN_ROUTE','ARRIVED') then u.phone else null end,
    case when d.status in ('EN_ROUTE','ARRIVED') then u.avatar else null end,
    (d.status in ('EN_ROUTE','ARRIVED')),
    a.delivery_eta_text,
    (select count(*)::int from public.appointment_deliveries d2
       where d2.batch_id = d.batch_id and d.batch_id is not null
         and d2.stop_order is not null and d.stop_order is not null
         and d2.stop_order < d.stop_order
         and d2.status not in ('DELIVERED','CANCELLED'))
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.users u on u.id = d.agent_user_id
  where d.appointment_id = p_appointment_id
    and a.customer_user_id = v_uid          -- own booking only
  order by d.created_at desc
  limit 1;
end $function$;

REVOKE ALL ON FUNCTION public.my_delivery_progress(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_delivery_progress(text) TO authenticated;

-- The customer's direct read of appointment_deliveries is what leaked lat/lng
-- and the pre-start agent identity. Drop that arm of the SELECT policy; the
-- customer now goes through my_delivery_progress(). Agent and business
-- managers keep direct access (the owner tracking page needs it).
DROP POLICY IF EXISTS appointment_deliveries_select ON public.appointment_deliveries;
CREATE POLICY appointment_deliveries_select ON public.appointment_deliveries
  FOR SELECT USING (
    public.has_business_scope(business_id, (auth.uid())::text, 'delivery')
    OR public.has_business_scope(business_id, (auth.uid())::text, 'appointments')
    OR agent_user_id = (auth.uid())::text
  );
