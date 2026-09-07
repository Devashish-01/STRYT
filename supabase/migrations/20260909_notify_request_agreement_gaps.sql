-- ============================================================
-- 20260909 — Fix 4 missing-notification gaps found in the flow-completeness
-- audit (docs/launch/workflows/24_flow_completeness_audit.md, workflow 04):
--
--   1. proposal_submit_counter — the other party (requester or responder,
--      whichever didn't submit the counter) was never told a counter came in.
--   2. accept_proposal / accept_proposal_counter — every SIBLING proposal on
--      the request auto-flips to REJECTED when one is accepted, but only the
--      WINNER was ever notified. Losers found out only by revisiting the page.
--   3. cancel_expired_agreements' PENDING (10-minute) branch — reverts a
--      never-confirmed agreement with no notice to either party, unlike the
--      same function's 72h unpaid-ACTIVE branch a few lines below, which
--      already notifies both.
--   4. ratings — a plain client-side insert (requestService.rate,
--      src/services/engagement/requestService.ts:572-592) with no trigger at
--      all; the person rated never learns they got a review.
--
-- create or replace + a new trigger — never editing an already-shipped
-- migration, same discipline as 20260906/20260907/20260908.
-- ============================================================

-- ── 1) proposal_submit_counter — notify whichever party didn't send this one ──
create or replace function public.proposal_submit_counter(
  p_proposal_id text, p_amount numeric, p_message text default ''
) returns public.proposal_counters
language plpgsql security definer
set search_path = public
as $$
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

  if v_uid not in (v_request.requester_user_id, v_proposal.responder_user_id) then
    raise exception 'NOT_A_PARTY';
  end if;
  if v_request.status <> 'OPEN' or v_proposal.status <> 'SUBMITTED' then
    raise exception 'NEGOTIATION_CLOSED';
  end if;

  insert into public.proposal_counters (proposal_id, by_user_id, amount, message)
  values (p_proposal_id, v_uid, p_amount, left(coalesce(p_message, ''), 1000))
  returning * into v_counter;

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
end
$$;

-- ── 2) accept_proposal / accept_proposal_counter — notify every rejected sibling ──
create or replace function public.accept_proposal(p_proposal_id text)
returns text
language plpgsql security definer
set search_path = public
as $$
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
    agreed_price, terms, requester_confirmed, responder_confirmed, payment_mode, status
  ) values (
    v_request.id, v_request.title, p_proposal_id,
    v_request.requester_user_id, v_proposal.responder_user_id,
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
    'Confirm within 10 minutes to lock in "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
    '/agreement/' || v_agreement_id,
    jsonb_build_object('amount', v_proposal.price, 'amountLabel', 'Accepted at', 'statusPill', 'Confirm now', 'tone', 'success')
  );

  return v_agreement_id;
end
$$;

create or replace function public.accept_proposal_counter(
  p_proposal_id text, p_counter_id text
) returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
  v_counter public.proposal_counters%rowtype;
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

  select * into v_counter
  from public.proposal_counters c
  where c.proposal_id = p_proposal_id
  order by c.created_at desc, c.id desc
  limit 1 for update;

  if not found or v_counter.id is distinct from p_counter_id then
    raise exception 'COUNTER_NOT_LATEST';
  end if;
  if v_counter.by_user_id is distinct from v_proposal.responder_user_id then
    raise exception 'COUNTER_NOT_OFFERED_BY_RESPONDER';
  end if;
  if v_counter.amount is null or v_counter.amount <= 0 then
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
    agreed_price, terms, requester_confirmed, responder_confirmed, payment_mode, status
  ) values (
    v_request.id, v_request.title, p_proposal_id,
    v_request.requester_user_id, v_proposal.responder_user_id,
    v_counter.amount::integer, coalesce(v_proposal.message, ''),
    false, false, 'OFFLINE', 'PENDING'
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
    'Confirm within 10 minutes to lock in "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
    '/agreement/' || v_agreement_id,
    jsonb_build_object('amount', v_counter.amount, 'amountLabel', 'Accepted at', 'statusPill', 'Confirm now', 'tone', 'success')
  );

  return v_agreement_id;
end
$$;

-- ── 3) cancel_expired_agreements — notify both parties on the PENDING (10-min) revert too ──
create or replace function public.cancel_expired_agreements()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ag record;
begin
  for v_ag in
    select * from public.agreements
    where status = 'PENDING'
      and created_at < now() - interval '10 minutes'
  loop
    update public.agreements set status = 'CANCELLED' where id = v_ag.id;
    update public.requests set status = 'OPEN' where id = v_ag.request_id;
    update public.proposals set status = 'SUBMITTED' where request_id = v_ag.request_id;

    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values
        (v_ag.requester_user_id, 'AGREEMENT', 'Deal window expired',
         'Neither side confirmed "' || coalesce(v_ag.request_title, 'this agreement') || '" in time — it has been cancelled.',
         '/agreement/' || v_ag.id),
        (v_ag.responder_user_id, 'AGREEMENT', 'Deal window expired',
         'Neither side confirmed "' || coalesce(v_ag.request_title, 'this agreement') || '" in time — it has been cancelled.',
         '/agreement/' || v_ag.id);
    exception when others then null;
    end;
  end loop;

  insert into public.notifications (user_id, type, title, body, deep_link)
  select a.requester_user_id, 'AGREEMENT', 'Payment reminder',
         'You still need to pay for "' || coalesce(a.request_title, 'your agreement')
           || '" — this deal auto-cancels after 3 days unpaid.',
         '/agreement/' || a.id
    from public.agreements a
   where a.status = 'ACTIVE'
     and coalesce(a.payment_status, 'UNPAID') in ('UNPAID', 'REJECTED')
     and a.created_at < now() - interval '24 hours'
     and not exists (
       select 1 from public.notifications n
        where n.deep_link = '/agreement/' || a.id and n.title = 'Payment reminder'
     );

  for v_ag in
    select * from public.agreements
    where status = 'ACTIVE'
      and coalesce(payment_status, 'UNPAID') in ('UNPAID', 'REJECTED')
      and created_at < now() - interval '72 hours'
  loop
    update public.agreements set status = 'CANCELLED' where id = v_ag.id;
    update public.requests set status = 'OPEN' where id = v_ag.request_id;
    update public.proposals set status = 'SUBMITTED' where request_id = v_ag.request_id;

    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values
        (v_ag.requester_user_id, 'AGREEMENT', 'Agreement auto-cancelled',
         'Payment was never made for "' || coalesce(v_ag.request_title, 'your agreement') || '" — it has been cancelled.',
         '/agreement/' || v_ag.id),
        (v_ag.responder_user_id, 'AGREEMENT', 'Agreement auto-cancelled',
         'The unpaid agreement for "' || coalesce(v_ag.request_title, 'your agreement') || '" has been cancelled.',
         '/agreement/' || v_ag.id);
    exception when others then null;
    end;
  end loop;
end
$function$;

-- ── 4) ratings — new trigger, this table has never had one ──
create or replace function public.notify_on_rating() returns trigger as $$
begin
  if new.ratee_type = 'USER' and new.rater_user_id is not null then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.ratee_id, 'RATING', 'You got a review',
        case when new.rating >= 4 then '⭐ '::text else ''::text end || new.rating || '/5' ||
          case when new.comment is not null and length(trim(new.comment)) > 0
               then ' — "' || left(new.comment, 100) || '"' else '' end,
        coalesce('/agreement/' || new.agreement_id, '/u/' || new.ratee_id));
    exception when others then null;
    end;
  end if;
  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_on_rating on public.ratings;
create trigger trg_notify_on_rating
  after insert on public.ratings
  for each row execute function public.notify_on_rating();
