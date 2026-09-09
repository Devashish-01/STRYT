-- ============================================================
-- 20260943_sprint4_delivery_chat_hardening.sql
--
-- Sprint 4: Realtime Engine — Local Delivery & 1:1 Chat Hardening
--
-- 1. get_tracking: include 'DELIVERED' status with live_status = 'DONE' so
--    completed delivery tracking links don't falsely claim to be expired (T3).
-- 2. my_delivery_progress: return cancel_reason and cancel_note so customers
--    understand why an in-flight delivery was cancelled (T5).
-- 3. assign_delivery: reset batch_id and stop_order upon reassignment,
--    decoupling the stop from prior courier batches (D1).
-- 4. messages RLS: enforce block checks at insert time (C2).
-- 5. messages trigger: insert a notification row on new chat messages so
--    push notifications dispatch when the recipient is offline/backgrounded (C1).
-- ============================================================

-- ── 1. get_tracking: include DELIVERED for delivery tokens ────────────────
DROP FUNCTION IF EXISTS public.get_tracking(text);
CREATE OR REPLACE FUNCTION public.get_tracking(p_token text)
 RETURNS TABLE(agreement_id text, provider_lat double precision, provider_lng double precision,
               live_status text, provider_name text, provider_avatar text, stops_before int,
               dest_lat double precision, dest_lng double precision)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- Agreements: live tracking unchanged.
  select a.id, a.provider_lat, a.provider_lng, a.live_status, u.name, u.avatar, null::int,
         null::double precision, null::double precision
  from public.tracking_tokens t
  join public.agreements a on a.id = t.agreement_id
  left join public.users u on u.id = a.responder_user_id
  where t.id::text = p_token and t.expires_at > now() and t.agreement_id is not null
  union all
  -- Deliveries: progress only (coordinates always NULL).
  select d.appointment_id,
         null::double precision, null::double precision,
         case when d.status = 'DELIVERED' then 'DONE' else d.live_status end,
         case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.name else null end,
         case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.avatar else null end,
         (select count(*)::int from public.appointment_deliveries d2
            where d2.batch_id = d.batch_id and d.batch_id is not null
              and d2.stop_order is not null and d.stop_order is not null
              and d2.stop_order < d.stop_order
              and d2.status not in ('DELIVERED','CANCELLED')),
         null::double precision, null::double precision
  from public.tracking_tokens t
  join public.appointment_deliveries d
    on d.appointment_id = t.appointment_id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED','DELIVERED')
  left join public.users u on u.id = d.agent_user_id
  where t.id::text = p_token and t.expires_at > now() and t.appointment_id is not null;
$function$;

GRANT EXECUTE ON FUNCTION public.get_tracking(text) TO anon, authenticated;

-- ── 2. my_delivery_progress: include cancellation context ──────────────────
DROP FUNCTION IF EXISTS public.my_delivery_progress(text);
CREATE OR REPLACE FUNCTION public.my_delivery_progress(p_appointment_id text)
RETURNS TABLE(
  id text, status text, live_status text,
  handoff_code text, handoff_verified boolean,
  agent_name text, agent_phone text, agent_avatar text,
  agent_revealed boolean,
  eta_text text, stops_before int,
  cancel_reason text, cancel_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  return query
  select d.id, d.status, d.live_status,
    d.handoff_code, d.handoff_verified,
    case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.name else null end,
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
    d.cancel_note
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.users u on u.id = d.agent_user_id
  where d.appointment_id = p_appointment_id
    and a.customer_user_id = v_uid
  order by d.created_at desc
  limit 1;
end $function$;

REVOKE ALL ON FUNCTION public.my_delivery_progress(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_delivery_progress(text) TO authenticated;

-- ── 3. assign_delivery: decouple stop from prior batch on reassignment ─────
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
       set agent_user_id = p_agent_user_id,
           status = 'ASSIGNED',
           handoff_verified = false,
           handoff_code = v_code,
           batch_id = null,
           stop_order = null
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

-- ── 4. messages RLS: check blocks on insert ────────────────────────────────
drop policy if exists insert_own_messages on public.messages;
create policy insert_own_messages on public.messages
  for insert with check (
    auth.role() = 'authenticated'
    and sender_id = auth.uid()::text
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_a = auth.uid()::text or c.participant_b = auth.uid()::text)
        and not public._user_blocks_exists(c.participant_a, c.participant_b)
    )
  );

-- ── 5. messages trigger: insert notification for recipient ──────────────────
CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_conv public.conversations%rowtype;
  v_recipient text;
  v_sender_name text;
begin
  select * into v_conv from public.conversations where id = NEW.conversation_id;
  if not found then return NEW; end if;

  v_recipient := case when v_conv.participant_a = NEW.sender_id then v_conv.participant_b else v_conv.participant_a end;
  if v_recipient is null then return NEW; end if;

  -- Do not notify if blocked between either party
  if public._user_blocks_exists(NEW.sender_id, v_recipient) then return NEW; end if;

  select coalesce(name, alias, 'Someone') into v_sender_name from public.users where id = NEW.sender_id;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      v_recipient,
      'CHAT',
      coalesce(v_sender_name, 'New message'),
      case when NEW.image_url is not null and (NEW.body is null or NEW.body = '') then '📷 Sent a photo' else substring(NEW.body from 1 for 100) end,
      '/chat/' || NEW.conversation_id
    );
  exception when others then null; end;

  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS tr_notify_on_chat_message ON public.messages;
CREATE TRIGGER tr_notify_on_chat_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_chat_message();
