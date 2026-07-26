-- Delivery Agent — Phase 3 refinements. See docs/plans/app-plans/09_delivery_boy_flow.md.
--   1) my_deliveries: do NOT expose handoff_code to the agent (verify-by-ask).
--   2) update_delivery_status: block DONE until handoff verified (when a code
--      exists), so "delivered" always follows a real handoff.
--   3) create_tracking_token: also allow the appointment's CUSTOMER to mint the
--      public tracking link for their own delivery.

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
    d.status, d.live_status,
    null::text,               -- handoff_code hidden from the agent (verify-by-ask)
    d.handoff_verified, d.lat, d.lng,
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

CREATE OR REPLACE FUNCTION public.appointment_update_delivery_status(
  p_delivery_id text, p_status text,
  p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
 RETURNS public.appointment_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text; v_row public.appointment_deliveries%rowtype; v_new text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_status not in ('LEAVING','ON_THE_WAY','ARRIVED','DONE') then raise exception 'INVALID_LIVE_STATUS'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_row.status in ('DELIVERED','CANCELLED') then raise exception 'INVALID_TRANSITION'; end if;
  if p_status = 'DONE' and v_row.handoff_code is not null and not v_row.handoff_verified then
    raise exception 'HANDOFF_NOT_VERIFIED';
  end if;
  v_new := case when p_status in ('LEAVING','ON_THE_WAY') then 'EN_ROUTE'
                when p_status = 'ARRIVED' then 'ARRIVED'
                when p_status = 'DONE' then 'DELIVERED' end;
  update public.appointment_deliveries
     set live_status = p_status, status = v_new,
         lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
         delivered_at = case when p_status = 'DONE' then now() else delivered_at end
   where id = p_delivery_id returning * into v_row;
  return v_row;
end $function$;

CREATE OR REPLACE FUNCTION public.appointment_create_tracking_token(p_appointment_id text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text; v_biz text; v_customer text; v_existing uuid; v_token uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select a.target_id, a.customer_user_id into v_biz, v_customer from public.appointments a
    where a.id = p_appointment_id and a.target_type = 'BUSINESS';
  if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not (public.has_business_scope(v_biz, v_uid, 'appointments')
          or v_uid = v_customer
          or exists (select 1 from public.appointment_deliveries d
                     where d.appointment_id = p_appointment_id and d.agent_user_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  select id into v_existing from public.tracking_tokens
    where appointment_id = p_appointment_id and expires_at > now()
    order by expires_at desc limit 1;
  if v_existing is not null then return v_existing; end if;
  insert into public.tracking_tokens (appointment_id, expires_at)
    values (p_appointment_id, now() + interval '4 hours') returning id into v_token;
  return v_token;
end $function$;
