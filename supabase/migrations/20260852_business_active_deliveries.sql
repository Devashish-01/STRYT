-- ============================================================
-- 20260852 — Owner-side live delivery tracking
--
-- APPLIED TO PRODUCTION as migration `business_active_deliveries_rpc`.
--
-- my_deliveries() is agent-scoped (where agent_user_id = auth.uid()), so it
-- can't back the owner's tracking page. This is the business-scoped mirror:
-- every delivery for the business, plus the assigned agent's identity and the
-- run's live position, so the owner can follow progress per order AND per
-- agent (screens/business/manage/BusinessDeliveries.tsx).
--
-- The agent is the business's own team member, so the owner legitimately sees
-- their real name/phone/avatar here — unlike the customer, who only ever gets
-- progress (see 20260853).
-- ============================================================

CREATE OR REPLACE FUNCTION public.business_active_deliveries(p_business_id text)
RETURNS TABLE(
  id text, appointment_id text,
  status text, live_status text,
  agent_user_id text, agent_name text, agent_avatar text, agent_phone text,
  customer_name text, delivery_address_line text,
  delivery_lat double precision, delivery_lng double precision,
  delivery_eta_text text,
  scheduled_for timestamptz, date_label text, time_label text,
  batch_id text, stop_order int, batch_status text,
  batch_lat double precision, batch_lng double precision, batch_heading double precision,
  handoff_verified boolean,
  created_at timestamptz, delivered_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  -- Same boundary the rest of the console uses: owner, FULL delegate, or a
  -- team member scoped to appointments.
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
    batch.lat, batch.lng, batch.heading,
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
