-- 20260980_notifications_insert_authorized
--
-- E2E-040 (P1, security): the INSERT policy on public.notifications only checked that the caller is signed in, so any
-- user could write a notification — any title, body, deep link and metadata — into any other user's inbox, and
-- trg_push_on_notification turned it into a push on their phone ("STRYT admin: your account is suspended…").
-- Every database function that notifies other users is SECURITY DEFINER (74 of them, checked on production
-- 2026-09-16) and is not affected by the policy. From the app, only two kinds of callers wrote notifications for
-- other people:
--   * admin screens (suspensions, appeals, deletion requests, verification notes) — still allowed, via is_admin();
--   * "request payment" nudges from shops, providers and their team — moved to request_payment_nudge(), which checks
--     that the caller manages the booking / queue visit / agreement, that payment is still owed, and a cooldown, and
--     writes the text itself (MERCHANT_QUEUE M7: nudges had no cooldown; the agreement one was only in localStorage).
--
-- MERCHANT_QUEUE M3: removing a no-show from the queue console set the token to LEFT, which told the owner
-- "<customer> left before paying" (their own action reported back as the customer's) and told the customer nothing.
-- The console now sends closed_reason = 'NO_SHOW'; on_queue_token_update tells the owner only when the customer
-- left themselves, and tells the customer when the shop removed them.
--
-- Rollback: supabase/rollbacks/20260980_notifications_insert_authorized.rollback.sql

drop policy if exists insert_notifications on public.notifications;

create policy insert_notifications on public.notifications
  as permissive
  for insert
  to authenticated
  with check (user_id = (select auth.uid())::text or (select public.is_admin()));

create or replace function public.request_payment_nudge(p_kind text, p_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_recipient text;
  v_title text := 'Payment Requested 🔔';
  v_body text;
  v_link text;
  v_type text := 'SYSTEM';
  v_metadata jsonb;
  v_cooldown interval := interval '10 minutes';
  v_key text := p_kind || ':' || p_id;
  v_apt public.appointments%rowtype;
  v_token public.queue_tokens%rowtype;
  v_ag public.agreements%rowtype;
  v_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  if p_kind = 'APPOINTMENT' then
    select * into v_apt from public.appointments where id = p_id;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not (v_apt.target_owner_user_id = v_uid
            or (v_apt.target_type = 'BUSINESS' and public.has_business_scope(v_apt.target_id, v_uid, 'appointments'))) then
      raise exception 'NOT_ALLOWED';
    end if;
    -- Walk-ins are stored under the owner's own id; there is nobody to notify.
    if v_apt.customer_user_id is null or v_apt.customer_user_id = v_apt.target_owner_user_id then raise exception 'NO_CUSTOMER'; end if;
    if v_apt.payment_status = 'PAID' then raise exception 'ALREADY_PAID'; end if;
    v_recipient := v_apt.customer_user_id;
    v_body := coalesce(nullif(v_apt.target_name, ''), 'The shop') || ' requested payment'
      || case when v_apt.package_price is not null and v_apt.package_price > 0 then ' ₹' || v_apt.package_price else '' end
      || ' for your booking on ' || coalesce(v_apt.date_label, '') || ' at ' || coalesce(v_apt.time_label, '') || '.';
    v_link := '/appointments';

  elsif p_kind = 'QUEUE' then
    select * into v_token from public.queue_tokens where id::text = p_id;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not public.has_business_scope(v_token.business_id, v_uid, 'queue') then raise exception 'NOT_ALLOWED'; end if;
    if v_token.customer_user_id is null then raise exception 'NO_CUSTOMER'; end if;
    if coalesce(v_token.payment_status, 'UNPAID') = 'PAID' then raise exception 'ALREADY_PAID'; end if;
    select name into v_name from public.businesses where id = v_token.business_id;
    v_recipient := v_token.customer_user_id;
    v_body := coalesce(nullif(v_name, ''), 'The shop') || ' requested payment'
      || case when v_token.payment_amount is not null and v_token.payment_amount > 0 then ' ₹' || v_token.payment_amount else '' end
      || ' for your visit.';
    v_link := '/queues';

  elsif p_kind = 'AGREEMENT' then
    select * into v_ag from public.agreements where id = p_id;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_uid is distinct from v_ag.responder_user_id
       and not (v_ag.responder_entity_id is not null and public.has_business_scope(v_ag.responder_entity_id, v_uid, 'leads')) then
      raise exception 'NOT_ALLOWED';
    end if;
    if v_ag.payment_status = 'PAID' then raise exception 'ALREADY_PAID'; end if;
    -- Same identity as the agreement screen: the name the offer was made under (E2E-026).
    select coalesce(nullif(p.responder_name, ''), u.name, 'The provider') into v_name
      from public.users u left join public.proposals p on p.id = v_ag.proposal_id
     where u.id = v_ag.responder_user_id;
    v_recipient := v_ag.requester_user_id;
    v_body := coalesce(v_name, 'The provider') || ' requested payment of ₹' || coalesce(v_ag.agreed_price::text, '0')
      || ' for "' || coalesce(v_ag.request_title, 'your request') || '".';
    v_link := '/agreement/' || p_id;
    v_type := 'AGREEMENT';
    v_cooldown := interval '6 hours';
    v_metadata := jsonb_build_object('amount', v_ag.agreed_price, 'amountLabel', 'Payment Due', 'statusPill', 'Pay Now',
      'tone', 'warning', 'agreementId', p_id, 'actions', jsonb_build_array('PAY', 'VIEW_AGREEMENT'));

  else
    raise exception 'INVALID_KIND';
  end if;

  if exists (select 1 from public.notifications n
              where n.user_id = v_recipient and n.metadata->>'nudgeFor' = v_key and n.created_at > now() - v_cooldown) then
    raise exception 'NUDGE_COOLDOWN';
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (v_recipient, v_type, v_title, v_body, v_link, coalesce(v_metadata, '{}'::jsonb) || jsonb_build_object('nudgeFor', v_key));

  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.request_payment_nudge(text, text) from public, anon;
grant execute on function public.request_payment_nudge(text, text) to authenticated;

create or replace function public.on_queue_token_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_owner text;
  v_shop text;
  v_actor text := auth.uid()::text;
begin
  if (new.status in ('CALLED', 'SERVED') and new.status is distinct from old.status)
     or (new.arrived_at is not null and old.arrived_at is null) then
    update public.queue_settings set last_activity_at = now() where business_id = new.business_id;
  end if;

  if new.status = 'LEFT' and old.status is distinct from 'LEFT' then
    begin
      if old.status in ('CALLED', 'SERVED') and new.customer_user_id is not null and v_actor = new.customer_user_id then
        -- The customer left on their own.
        select b.owner_user_id into v_owner from public.businesses b where b.id = new.business_id;
        if v_owner is not null then
          insert into public.notifications (user_id, type, title, body, deep_link, metadata)
          values (v_owner, 'QUEUE_UPDATE', 'Customer left the queue',
                  coalesce(new.customer_name, 'A customer') || ' left before paying.',
                  '/business/' || new.business_id || '/manage/queue',
                  jsonb_build_object('actorName', new.customer_name, 'statusPill', 'Left', 'tone', 'neutral'));
        end if;
      elsif new.closed_reason = 'NO_SHOW' and new.customer_user_id is not null and v_actor is distinct from new.customer_user_id then
        -- The shop removed a customer who didn't turn up.
        select b.name into v_shop from public.businesses b where b.id = new.business_id;
        insert into public.notifications (user_id, type, title, body, deep_link, metadata)
        values (new.customer_user_id, 'QUEUE_UPDATE', 'Removed from the queue',
                coalesce(nullif(v_shop, ''), 'The shop') || ' called you but you weren''t there, so your place in the queue was released.',
                '/queues',
                jsonb_build_object('statusPill', 'No-show', 'tone', 'neutral'));
      end if;
    exception when others then null;
    end;
  end if;
  return new;
end $function$;
