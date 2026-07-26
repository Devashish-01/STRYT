-- Delivery Agent — Phase 1 groundwork (additive, feature-flagged, no live UI).
-- See docs/plans/app-plans/09_delivery_boy_flow.md.
--   1) Allow the 'delivery' team scope in the grant/update whitelists.
--   2) Generalize tracking_tokens to also back an appointment (delivery) token.
--   3) appointment_deliveries table + RLS (SELECT for agent/managers/customer;
--      writes only via the SECURITY DEFINER RPCs).
--   4) RPC clones: assign_delivery, appointment_update_delivery_status,
--      confirm_handoff, appointment_create_tracking_token; union get_tracking.
-- Idempotent/guarded so a local `supabase db push` is safe.

-- 1) Scope whitelist: add 'delivery' -----------------------------------------
CREATE OR REPLACE FUNCTION public.grant_team_member_access(p_business_id text, p_identifier text, p_scopes text[])
 RETURNS TABLE(session_id uuid, grantee_name text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_target text; v_name text;
  v_ident text := trim(p_identifier);
  v_digits text := regexp_replace(v_ident, '\D', '', 'g');
  v_biz_name text; v_session_id uuid;
  v_scopes text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                 where s in ('appointments','queue','catalog','leads','delivery')), '{}');
begin
  if v_uid is null then raise exception 'Sign in to your STRYT account first.'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;
  select b.name into v_biz_name from public.businesses b where b.id = p_business_id and b.owner_user_id = v_uid;
  if v_biz_name is null then raise exception 'Only the business owner can add team members.'; end if;
  if v_ident ~ '@.*\.' then
    select id, name into v_target, v_name from public.users where lower(email) = lower(v_ident) limit 1;
  elsif regexp_replace(v_ident, '[\s\-+]', '', 'g') ~ '^\d{6,}$' then
    select id, name into v_target, v_name from public.users
     where regexp_replace(coalesce(phone, ''), '\D', '', 'g') like '%' || right(v_digits, 10) limit 1;
  else
    select id, name into v_target, v_name from public.users where lower(alias) = lower(ltrim(v_ident, '@')) limit 1;
  end if;
  if v_target is null then raise exception 'No STRYT account found for that mobile number, email, or username.'; end if;
  if v_target = v_uid then raise exception 'You already own this business.'; end if;
  update public.business_access_sessions
     set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
   where business_id = p_business_id and grantee_user_id = v_target
     and status in ('PENDING', 'ACTIVE') and expires_at is not null and expires_at <= now();
  select id into v_session_id from public.business_access_sessions
   where business_id = p_business_id and grantee_user_id = v_target and status in ('PENDING', 'ACTIVE')
   order by requested_at desc, id desc limit 1 for update;
  if v_session_id is not null then
    update public.business_access_sessions
       set status = 'ACTIVE', decided_at = now(), expires_at = null, access_level = 'SCOPED', scopes = v_scopes
     where id = v_session_id;
  else
    insert into public.business_access_sessions
      (business_id, grantee_user_id, status, decided_at, expires_at, access_level, scopes)
    values (p_business_id, v_target, 'ACTIVE', now(), null, 'SCOPED', v_scopes) returning id into v_session_id;
  end if;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_target, 'QUEUE_UPDATE', 'Team access granted',
            'You can now help manage ' || coalesce(v_biz_name, 'a business') || ' from Switch account.',
            '/account/business-access');
  exception when others then null; end;
  session_id := v_session_id; grantee_name := coalesce(v_name, 'User'); return next;
end $function$;

CREATE OR REPLACE FUNCTION public.update_team_member_scopes(p_session_id uuid, p_scopes text[])
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_scopes text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                 where s in ('appointments','queue','catalog','leads','delivery')), '{}');
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;
  update public.business_access_sessions s
     set access_level = 'SCOPED', scopes = v_scopes
    from public.businesses b
   where s.id = p_session_id and b.id = s.business_id and b.owner_user_id = v_uid and s.status = 'ACTIVE';
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $function$;

-- 2) Generalize tracking_tokens ---------------------------------------------
ALTER TABLE public.tracking_tokens ADD COLUMN IF NOT EXISTS appointment_id text
  REFERENCES public.appointments(id) ON DELETE CASCADE;
ALTER TABLE public.tracking_tokens ALTER COLUMN agreement_id DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tracking_tokens_one_target') THEN
    ALTER TABLE public.tracking_tokens
      ADD CONSTRAINT tracking_tokens_one_target
      CHECK ((agreement_id IS NOT NULL) <> (appointment_id IS NOT NULL));
  END IF;
END $$;

-- 3) appointment_deliveries --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_deliveries (
  id text PRIMARY KEY DEFAULT ('del_' || replace(gen_random_uuid()::text, '-', '')),
  appointment_id text NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ASSIGNED'
    CHECK (status IN ('ASSIGNED','EN_ROUTE','ARRIVED','DELIVERED','CANCELLED')),
  handoff_code text,
  handoff_verified boolean NOT NULL DEFAULT false,
  lat double precision,
  lng double precision,
  live_status text CHECK (live_status IS NULL OR live_status IN ('LEAVING','ON_THE_WAY','ARRIVED','DONE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS appointment_deliveries_one_active
  ON public.appointment_deliveries (appointment_id)
  WHERE status IN ('ASSIGNED','EN_ROUTE','ARRIVED');
CREATE INDEX IF NOT EXISTS appointment_deliveries_agent_idx
  ON public.appointment_deliveries (agent_user_id);

ALTER TABLE public.appointment_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_deliveries_select ON public.appointment_deliveries;
CREATE POLICY appointment_deliveries_select ON public.appointment_deliveries
  FOR SELECT USING (
    public.has_business_scope(business_id, (auth.uid())::text, 'delivery')
    OR agent_user_id = (auth.uid())::text
    OR EXISTS (SELECT 1 FROM public.appointments a
               WHERE a.id = appointment_id AND a.customer_user_id = (auth.uid())::text)
  );
GRANT SELECT ON public.appointment_deliveries TO authenticated;

-- 4a) assign_delivery --------------------------------------------------------
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
  if not public.has_business_scope(v_biz, p_agent_user_id, 'delivery') then raise exception 'AGENT_NOT_DELIVERY_MEMBER'; end if;
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

-- 4b) appointment_update_delivery_status ------------------------------------
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

-- 4c) confirm_handoff --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_handoff(p_delivery_id text, p_code text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text; v_row public.appointment_deliveries%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_row.handoff_code is distinct from p_code then return false; end if;
  update public.appointment_deliveries
     set handoff_verified = true, status = case when status = 'EN_ROUTE' then 'ARRIVED' else status end
   where id = p_delivery_id;
  return true;
end $function$;

-- 4d) appointment_create_tracking_token -------------------------------------
CREATE OR REPLACE FUNCTION public.appointment_create_tracking_token(p_appointment_id text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text; v_biz text; v_existing uuid; v_token uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select a.target_id into v_biz from public.appointments a
    where a.id = p_appointment_id and a.target_type = 'BUSINESS';
  if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not (public.has_business_scope(v_biz, v_uid, 'appointments')
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

-- 4e) get_tracking — serves BOTH agreement and appointment/delivery tokens ---
CREATE OR REPLACE FUNCTION public.get_tracking(p_token text)
 RETURNS TABLE(agreement_id text, provider_lat double precision, provider_lng double precision,
               live_status text, provider_name text, provider_avatar text)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select a.id, a.provider_lat, a.provider_lng, a.live_status, u.name, u.avatar
  from public.tracking_tokens t
  join public.agreements a on a.id = t.agreement_id
  left join public.users u on u.id = a.responder_user_id
  where t.id::text = p_token and t.expires_at > now() and t.agreement_id is not null
  union all
  select d.appointment_id, d.lat, d.lng, d.live_status, u.name, u.avatar
  from public.tracking_tokens t
  join public.appointment_deliveries d
    on d.appointment_id = t.appointment_id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
  left join public.users u on u.id = d.agent_user_id
  where t.id::text = p_token and t.expires_at > now() and t.appointment_id is not null;
$function$;

GRANT EXECUTE ON FUNCTION public.assign_delivery(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appointment_update_delivery_status(text, text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_handoff(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appointment_create_tracking_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tracking(text) TO anon, authenticated;
