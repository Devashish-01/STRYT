-- Team console maturity (T3): widen delivery assignment to any active team
-- member; expose active-delivery counts for UI gates.

-- Count non-terminal deliveries assigned to the signed-in user (optionally scoped
-- to one business — used by BusinessAccessGuard + account switcher).
CREATE OR REPLACE FUNCTION public.count_my_active_deliveries(p_business_id text DEFAULT NULL)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.appointment_deliveries d
  WHERE d.agent_user_id = auth.uid()::text
    AND d.status IN ('ASSIGNED', 'EN_ROUTE', 'ARRIVED')
    AND (p_business_id IS NULL OR d.business_id = p_business_id);
$$;

GRANT EXECUTE ON FUNCTION public.count_my_active_deliveries(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.count_my_active_deliveries(text) FROM public, anon;

-- assign_delivery: any ACTIVE team member may be assigned (not only delivery scope).
CREATE OR REPLACE FUNCTION public.assign_delivery(p_appointment_id text, p_agent_user_id text)
 RETURNS public.appointment_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text; v_biz text; v_row public.appointment_deliveries%rowtype; v_code text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select a.target_id into v_biz from public.appointments a
    where a.id = p_appointment_id and a.target_type = 'BUSINESS';
  if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if not public.has_business_access(v_biz, p_agent_user_id) then raise exception 'AGENT_NOT_TEAM_MEMBER'; end if;
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  select * into v_row from public.appointment_deliveries
    where appointment_id = p_appointment_id and status in ('ASSIGNED','EN_ROUTE','ARRIVED') for update;
  if found then
    update public.appointment_deliveries
       set agent_user_id = p_agent_user_id, status = 'ASSIGNED', handoff_verified = false, handoff_code = v_code
     where id = v_row.id returning * into v_row;
  else
    insert into public.appointment_deliveries (appointment_id, business_id, agent_user_id, status, handoff_code)
    values (p_appointment_id, v_biz, p_agent_user_id, 'ASSIGNED', v_code) returning * into v_row;
  end if;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (p_agent_user_id, 'QUEUE_UPDATE', 'New delivery assigned', 'You have a new delivery to complete.', '/delivery');
  exception when others then null; end;
  return v_row;
end $function$;

-- assign_delivery_batch: same assignee rule as single assign.
CREATE OR REPLACE FUNCTION public.assign_delivery_batch(p_appointment_ids text[], p_agent_user_id text)
 RETURNS public.delivery_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_biz text;
  v_count int;
  v_batch public.delivery_batches%rowtype;
  v_apt_id text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_appointment_ids is null or array_length(p_appointment_ids, 1) is null then
    raise exception 'NO_APPOINTMENTS_SELECTED';
  end if;

  select a.target_id into v_biz from public.appointments a
    where a.id = p_appointment_ids[1] and a.target_type = 'BUSINESS';
  if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if not public.has_business_access(v_biz, p_agent_user_id) then raise exception 'AGENT_NOT_TEAM_MEMBER'; end if;

  select count(*) into v_count
    from public.appointments a
    where a.id = any(p_appointment_ids)
      and a.target_type = 'BUSINESS' and a.target_id = v_biz
      and a.fulfillment_type = 'DELIVERY' and a.status = 'ACCEPTED'
      and not exists (
        select 1 from public.appointment_deliveries d
        where d.appointment_id = a.id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
      );
  if v_count <> array_length(p_appointment_ids, 1) then
    raise exception 'SOME_APPOINTMENTS_NOT_ELIGIBLE';
  end if;

  insert into public.delivery_batches (business_id, agent_user_id)
    values (v_biz, p_agent_user_id) returning * into v_batch;

  foreach v_apt_id in array p_appointment_ids loop
    insert into public.appointment_deliveries (appointment_id, business_id, agent_user_id, status, handoff_code, batch_id)
    values (v_apt_id, v_biz, p_agent_user_id, 'ASSIGNED',
            lpad((floor(random() * 1000000))::int::text, 6, '0'), v_batch.id);
  end loop;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (p_agent_user_id, 'QUEUE_UPDATE', 'New delivery run',
            'You have ' || array_length(p_appointment_ids, 1) || ' deliveries to accept.', '/delivery');
  exception when others then null; end;

  return v_batch;
end $function$;

GRANT EXECUTE ON FUNCTION public.assign_delivery(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_delivery_batch(text[], text) TO authenticated;
