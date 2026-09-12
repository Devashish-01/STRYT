-- ============================================================
-- Rollback for 20260955_proposal_notifications_v2.sql
-- Restores all replaced objects to their exact production catalog definitions
-- from supabase/snapshots/2026-09-13_after_20260958.sql.
-- ============================================================

-- ── Restore notify_on_proposal ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_proposal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  req_owner text;
  req_title text;
begin
  select requester_user_id, title
    into req_owner, req_title
    from public.requests
   where id = new.request_id;

  if req_owner is null or req_owner = new.responder_user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    req_owner,
    'PROPOSAL',
    coalesce(new.responder_name, 'Someone') || ' sent a quote',
    'On "' || coalesce(req_title, 'your request') || '"' || coalesce(' — ₹' || new.price::text, ''),
    '/request/' || new.request_id,
    jsonb_build_object(
      'avatarUrl', new.responder_avatar,
      'actorName', new.responder_name,
      'amount', new.price,
      'amountLabel', 'Quoted',
      'tone', 'brand'
    )
  );
  return new;
end $function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_proposal() TO postgres, service_role;

-- ── Restore notify_on_proposal_broadcast ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_proposal_broadcast()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  req_owner text;
  req_title text;
begin
  select requester_user_id, title
    into req_owner, req_title
    from public.requests
   where id = new.request_id;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select mt.user_id,
         'QUOTE_BROADCAST',
         coalesce(new.responder_name, 'A provider') || ' sent a group quote',
         'On "' || coalesce(req_title, 'a request you joined') || '"' || coalesce(' — ₹' || new.price::text, ''),
         '/request/' || new.request_id,
         jsonb_build_object(
           'avatarUrl', new.responder_avatar,
           'actorName', new.responder_name,
           'amount', new.price,
           'amountLabel', 'Quoted',
           'tone', 'brand'
         )
    from public.request_me_toos mt
   where mt.request_id = new.request_id
     and mt.user_id <> coalesce(req_owner, '')
     and mt.user_id <> new.responder_user_id;

  return new;
end $function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_proposal_broadcast() TO postgres, service_role;

-- ── Restore proposal_submit_counter ─────────────────────────
CREATE OR REPLACE FUNCTION public.proposal_submit_counter(p_proposal_id text, p_amount numeric, p_message text DEFAULT NULL::text)
 RETURNS proposal_counters
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
  v_counter public.proposal_counters%rowtype;
  v_other text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_proposal from public.proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_request from public.requests
  where id = v_proposal.request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if v_uid not in (v_request.requester_user_id, v_proposal.responder_user_id)
     and not (v_proposal.responder_type = 'business' and public.has_business_scope(v_proposal.responder_entity_id, v_uid, 'leads'))
     and not (v_proposal.responder_type = 'provider' and exists(select 1 from public.providers p where p.id = v_proposal.responder_entity_id and p.user_id = v_uid))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_A_PARTY';
  end if;

  if v_request.status <> 'OPEN' or v_proposal.status <> 'SUBMITTED' then
    raise exception 'NEGOTIATION_CLOSED';
  end if;

  insert into public.proposal_counters (proposal_id, by_user_id, amount, message)
  values (p_proposal_id, v_uid, p_amount, left(coalesce(p_message, ''), 1000))
  returning * into v_counter;

  -- Touch proposal updated_at so standard proposals realtime subscriptions fire
  update public.proposals set updated_at = now() where id = p_proposal_id;

  v_other := case when v_uid = v_request.requester_user_id
    then v_proposal.responder_user_id else v_request.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_other, 'PROPOSAL_COUNTER', 'New counter-offer',
      '₹' || p_amount::text || ' on "' || left(coalesce(v_request.title, 'your request'), 60) || '".',
      '/request/' || v_request.id);
  exception when others then null;
  end;

  return v_counter;
end;
$function$
;
GRANT EXECUTE ON FUNCTION public.proposal_submit_counter(p_proposal_id text, p_amount numeric, p_message text) TO authenticated, postgres, service_role;

-- ── Restore accept_proposal ─────────────────────────
CREATE OR REPLACE FUNCTION public.accept_proposal(p_proposal_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
  v_agreement_id text;
  v_rejected_responder text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_proposal from public.proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_request from public.requests
  where id = v_proposal.request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if v_request.requester_user_id is distinct from v_uid then
    raise exception 'NOT_REQUEST_OWNER';
  end if;
  if v_request.status <> 'OPEN' or v_proposal.status <> 'SUBMITTED' then
    raise exception 'REQUEST_NOT_OPEN';
  end if;
  if v_proposal.price is null or v_proposal.price <= 0 then
    raise exception 'INVALID_PRICE';
  end if;

  if exists (select 1 from public.agreements a
             where a.request_id = v_request.id or a.proposal_id = p_proposal_id) then
    raise exception 'AGREEMENT_ALREADY_EXISTS';
  end if;

  update public.proposals set status = 'ACCEPTED'
  where id = p_proposal_id and status = 'SUBMITTED';
  if not found then raise exception 'PROPOSAL_ALREADY_DECIDED'; end if;

  insert into public.agreements (
    request_id, request_title, proposal_id, requester_user_id, responder_user_id,
    responder_entity_id, responder_type,
    agreed_price, terms, requester_confirmed, responder_confirmed, payment_mode, status
  ) values (
    v_request.id, v_request.title, p_proposal_id,
    v_request.requester_user_id, v_proposal.responder_user_id,
    v_proposal.responder_entity_id, v_proposal.responder_type,
    v_proposal.price, coalesce(v_proposal.message, ''), false, false, 'OFFLINE', 'PENDING'
  ) returning id into v_agreement_id;

  update public.requests set status = 'IN_PROGRESS'
  where id = v_request.id and status = 'OPEN';
  if not found then raise exception 'REQUEST_ALREADY_DECIDED'; end if;

  for v_rejected_responder in
    update public.proposals set status = 'REJECTED'
    where request_id = v_request.id and id <> p_proposal_id and status = 'SUBMITTED'
    returning responder_user_id
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_rejected_responder, 'PROPOSAL', 'Quote not accepted',
        'The requester went with another quote for "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
        '/request/' || v_request.id);
    exception when others then null;
    end;
  end loop;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    v_proposal.responder_user_id, 'AGREEMENT', 'Your quote was accepted! 🎉',
    'Confirm within 12 hours to lock in "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
    '/agreement/' || v_agreement_id,
    jsonb_build_object('amount', v_proposal.price, 'amountLabel', 'Accepted at', 'statusPill', 'Confirm now', 'tone', 'success')
  );

  return v_agreement_id;
end
$function$
;
GRANT EXECUTE ON FUNCTION public.accept_proposal(p_proposal_id text) TO authenticated, postgres, service_role;

-- ── Restore accept_proposal_counter ─────────────────────────
CREATE OR REPLACE FUNCTION public.accept_proposal_counter(p_proposal_id text, p_counter_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
  v_counter public.proposal_counters%rowtype;
  v_agreement_id text;
  v_rejected_responder text;
  v_is_requester boolean := false;
  v_is_responder boolean := false;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_proposal from public.proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_request from public.requests
  where id = v_proposal.request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if v_request.status <> 'OPEN' or v_proposal.status <> 'SUBMITTED' then
    raise exception 'REQUEST_NOT_OPEN';
  end if;

  select * into v_counter
  from public.proposal_counters c
  where c.proposal_id = p_proposal_id
  order by c.created_at desc, c.id desc
  limit 1 for update;

  if not found or v_counter.id is distinct from p_counter_id then
    raise exception 'COUNTER_NOT_LATEST';
  end if;
  if v_counter.amount is null or v_counter.amount <= 0 then
    raise exception 'INVALID_PRICE';
  end if;

  -- Determine party role and validate bilateral counter offer author
  if v_uid = v_request.requester_user_id then
    v_is_requester := true;
    if v_counter.by_user_id is distinct from v_proposal.responder_user_id then
      raise exception 'COUNTER_NOT_OFFERED_BY_RESPONDER';
    end if;
  elsif v_uid = v_proposal.responder_user_id
        or (v_proposal.responder_type = 'business' and public.has_business_scope(v_proposal.responder_entity_id, v_uid, 'leads'))
        or (v_proposal.responder_type = 'provider' and exists(select 1 from public.providers p where p.id = v_proposal.responder_entity_id and p.user_id = v_uid))
        or public.is_admin(v_uid) then
    v_is_responder := true;
    if v_counter.by_user_id is distinct from v_request.requester_user_id then
      raise exception 'COUNTER_NOT_OFFERED_BY_REQUESTER';
    end if;
  else
    raise exception 'NOT_AUTHORIZED_TO_ACCEPT_COUNTER';
  end if;

  if exists (select 1 from public.agreements a
             where a.request_id = v_request.id or a.proposal_id = p_proposal_id) then
    raise exception 'AGREEMENT_ALREADY_EXISTS';
  end if;

  update public.proposals set status = 'ACCEPTED'
  where id = p_proposal_id and status = 'SUBMITTED';
  if not found then raise exception 'PROPOSAL_ALREADY_DECIDED'; end if;

  insert into public.agreements (
    request_id, request_title, proposal_id, requester_user_id, responder_user_id,
    responder_entity_id, responder_type,
    agreed_price, terms, requester_confirmed, responder_confirmed, payment_mode, status
  ) values (
    v_request.id, v_request.title, p_proposal_id,
    v_request.requester_user_id, v_proposal.responder_user_id,
    v_proposal.responder_entity_id, v_proposal.responder_type,
    v_counter.amount::integer, coalesce(v_proposal.message, ''),
    -- Pre-confirm the party that called accept_proposal_counter
    v_is_requester, v_is_responder,
    'OFFLINE', 'PENDING'
  ) returning id into v_agreement_id;

  update public.requests set status = 'IN_PROGRESS'
  where id = v_request.id and status = 'OPEN';
  if not found then raise exception 'REQUEST_ALREADY_DECIDED'; end if;

  for v_rejected_responder in
    update public.proposals set status = 'REJECTED'
    where request_id = v_request.id and id <> p_proposal_id and status = 'SUBMITTED'
    returning responder_user_id
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_rejected_responder, 'PROPOSAL', 'Quote not accepted',
        'The requester went with another quote for "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
        '/request/' || v_request.id);
    exception when others then null;
    end;
  end loop;

  -- Notify other party of accepted counter
  declare
    v_notif_target text := case when v_is_requester then v_proposal.responder_user_id else v_request.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      v_notif_target, 'AGREEMENT', 'Counter-offer accepted! 🎉',
      'The counter of ₹' || v_counter.amount::text || ' was accepted. Confirm within 12 hours to lock in.',
      '/agreement/' || v_agreement_id,
      jsonb_build_object('amount', v_counter.amount, 'amountLabel', 'Agreed at', 'statusPill', 'Confirm now', 'tone', 'success')
    );
  exception when others then null;
  end;

  return v_agreement_id;
end;
$function$
;
GRANT EXECUTE ON FUNCTION public.accept_proposal_counter(p_proposal_id text, p_counter_id text) TO authenticated, postgres, service_role;

-- ── Restore agreement_claim_payment ─────────────────────────
CREATE OR REPLACE FUNCTION public.agreement_claim_payment(p_id text, p_method text, p_amount integer DEFAULT NULL::integer, p_reference text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.requester_user_id then raise exception 'NOT_REQUESTER'; end if;
  if v_agreement.status <> 'ACTIVE' then raise exception 'INVALID_TRANSITION'; end if;
  if v_agreement.payment_status not in ('UNPAID', 'REJECTED') then raise exception 'PAYMENT_ALREADY_CLAIMED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;
  if v_agreement.agreed_price <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  update public.agreements
  set payment_method = p_method,
      payment_status = 'PENDING_CONFIRM',
      payment_amount = agreed_price,
      payment_reference = nullif(left(trim(coalesce(p_reference, '')), 200), '')
  where id = p_id and status = 'ACTIVE'
    and payment_status in ('UNPAID', 'REJECTED');
  if not found then raise exception 'PAYMENT_ALREADY_CLAIMED'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_agreement.responder_user_id, 'AGREEMENT', 'Payment claim to verify',
      'The requester says they paid ₹' || v_agreement.agreed_price::text
        || ' for "' || left(coalesce(v_agreement.request_title, 'this agreement'), 60) || '" — confirm or reject.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end
$function$
;
GRANT EXECUTE ON FUNCTION public.agreement_claim_payment(p_id text, p_method text, p_amount integer, p_reference text) TO authenticated, postgres, service_role;

-- ── Restore agreement_confirm_payment ─────────────────────────
CREATE OR REPLACE FUNCTION public.agreement_confirm_payment(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_agreement.responder_user_id
     and not (v_agreement.responder_entity_id is not null and public.has_business_scope(v_agreement.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_RESPONDER';
  end if;

  if v_agreement.status <> 'ACTIVE' or v_agreement.payment_status <> 'PENDING_CONFIRM' then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.agreements
  set payment_status = 'PAID', status = 'DEPOSIT_PAID'
  where id = p_id and status = 'ACTIVE' and payment_status = 'PENDING_CONFIRM';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_agreement.requester_user_id, 'AGREEMENT', 'Payment confirmed ✓',
      'Your payment for "' || left(coalesce(v_agreement.request_title, 'this agreement'), 60) || '" was confirmed.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end;
$function$
;
GRANT EXECUTE ON FUNCTION public.agreement_confirm_payment(p_id text) TO authenticated, postgres, service_role;

-- ── Restore agreement_reject_payment ─────────────────────────
CREATE OR REPLACE FUNCTION public.agreement_reject_payment(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_agreement.responder_user_id
     and not (v_agreement.responder_entity_id is not null and public.has_business_scope(v_agreement.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_RESPONDER';
  end if;

  if v_agreement.status <> 'ACTIVE' or v_agreement.payment_status <> 'PENDING_CONFIRM' then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.agreements set payment_status = 'REJECTED'
  where id = p_id and status = 'ACTIVE' and payment_status = 'PENDING_CONFIRM';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_agreement.requester_user_id, 'AGREEMENT', 'Payment not verified',
      'Your payment claim for "' || left(coalesce(v_agreement.request_title, 'this agreement'), 60) || '" wasn''t confirmed. Try again.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end;
$function$
;
GRANT EXECUTE ON FUNCTION public.agreement_reject_payment(p_id text) TO authenticated, postgres, service_role;

notify pgrst, 'reload schema';
