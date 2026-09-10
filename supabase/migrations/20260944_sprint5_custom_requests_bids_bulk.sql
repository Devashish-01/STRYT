-- ==============================================================================
-- 20260944 — Sprint 5: Custom Requests, Bids, Agreements & Bulk Deals Hardening
--
-- Covers:
-- 1. Agreements schema expansion (responder_entity_id, responder_type)
-- 2. Multi-user team scoping for agreements RLS & lifecycle RPCs (A1)
-- 3. Elimination of direct UPDATE bypass on agreements (A4)
-- 4. Bilateral proposal counter acceptance & leads team scope on withdraw/counter (P1, P2)
-- 5. Realtime publication for proposal_counters & touch proposals.updated_at (P5)
-- 6. Unique index guarding against duplicate active quotes (P3)
-- 7. PENDING agreement 12h auto-cancel extension & safe proposal reversion (A3, A11)
-- 8. Dispute notification trigger (A7)
-- 9. Lightweight me_too_toggle RPC (R7)
-- 10. No-deposit bulk deal claim pass minting & balance_due tracking (BLK-1, BLK-4)
-- 11. Guard against deleting campaigns with active unredeemed passes (BLK-2)
-- 12. Delegated manager access (catalog scope) on bulk deals close & extend (BLK-3)
-- 13. Cross-store voucher redemption guard (BLK-5)
-- ==============================================================================

-- ── 1. Agreements Schema & Indexes ───────────────────────────────────────────

alter table public.agreements
  add column if not exists responder_entity_id text,
  add column if not exists responder_type text;

create index if not exists idx_agreements_responder_entity
  on public.agreements (responder_entity_id)
  where responder_entity_id is not null;

-- ── 2. Read Agreements RLS Policy ─────────────────────────────────────────────

drop policy if exists read_agreements on public.agreements;

create policy read_agreements on public.agreements
  for select to authenticated
  using (
    (select auth.uid()) is not null
    and (
      (select auth.uid())::text in (requester_user_id, responder_user_id)
      or (
        responder_entity_id is not null
        and public.has_business_scope(responder_entity_id, (select auth.uid())::text, 'leads')
      )
      or exists (
        select 1 from public.users u
        where u.id = (select auth.uid())::text
          and u.roles && array['admin', 'super_admin']::text[]
      )
    )
  );

-- ── 3. Drop Direct Client UPDATE Policy (A4 Vulnerability) ───────────────────

drop policy if exists upd_agreements on public.agreements;

-- ── 4. Proposals Unique Index (P3) ───────────────────────────────────────────

create unique index if not exists idx_proposals_active_user
  on public.proposals (request_id, responder_user_id)
  where status = 'SUBMITTED';

-- Ensure proposal_counters is in Supabase Realtime publication (P5)
do $$
begin
  alter publication supabase_realtime add table public.proposal_counters;
exception when others then
  null; -- Already in publication or publication not available
end $$;

-- ── 5. Bilateral Counter Acceptance & Team Permissions (P1, P2) ───────────────

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
$$;

revoke execute on function public.accept_proposal(text) from public, anon;
grant execute on function public.accept_proposal(text) to authenticated;


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
$$;

revoke execute on function public.accept_proposal_counter(text, text) from public, anon;
grant execute on function public.accept_proposal_counter(text, text) to authenticated;


create or replace function public.withdraw_proposal(p_proposal_id text)
returns public.proposals
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_proposal from public.proposals where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  if v_proposal.responder_user_id is distinct from v_uid
     and not (v_proposal.responder_type = 'business' and public.has_business_scope(v_proposal.responder_entity_id, v_uid, 'leads'))
     and not (v_proposal.responder_type = 'provider' and exists(select 1 from public.providers p where p.id = v_proposal.responder_entity_id and p.user_id = v_uid))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_YOUR_PROPOSAL';
  end if;

  if v_proposal.status <> 'SUBMITTED' then
    raise exception 'INVALID_TRANSITION';
  end if;

  select * into v_request from public.requests where id = v_proposal.request_id;
  if found and v_request.status <> 'OPEN' then
    raise exception 'REQUEST_NOT_OPEN';
  end if;

  update public.proposals set status = 'WITHDRAWN' where id = p_proposal_id;
  select * into v_proposal from public.proposals where id = p_proposal_id;
  return v_proposal;
end;
$$;

revoke all on function public.withdraw_proposal(text) from public, anon;
grant execute on function public.withdraw_proposal(text) to authenticated;


create or replace function public.proposal_submit_counter(
  p_proposal_id text, p_amount numeric, p_message text default null
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
$$;

revoke execute on function public.proposal_submit_counter(text, numeric, text) from public, anon;
grant execute on function public.proposal_submit_counter(text, numeric, text) to authenticated;

-- ── 6. Agreement Lifecycle RPCs Team Scope & Expiry (A1, A3, A11) ─────────────

create or replace function public.agreement_confirm(p_id text)
returns public.agreements
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
  v_other text;
  v_was_confirmed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements
  where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_agreement.status <> 'PENDING' then raise exception 'INVALID_TRANSITION'; end if;
  if v_agreement.created_at is not null
     and v_agreement.created_at <= now() - interval '12 hours' then
    raise exception 'AGREEMENT_EXPIRED';
  end if;

  if v_uid = v_agreement.requester_user_id then
    v_was_confirmed := coalesce(v_agreement.requester_confirmed, false);
    v_other := v_agreement.responder_user_id;
    update public.agreements set requester_confirmed = true where id = p_id;
  elsif v_uid = v_agreement.responder_user_id
        or (v_agreement.responder_entity_id is not null and public.has_business_scope(v_agreement.responder_entity_id, v_uid, 'leads'))
        or (v_agreement.responder_type = 'provider' and exists(select 1 from public.providers p where p.id = v_agreement.responder_entity_id and p.user_id = v_uid))
        or public.is_admin(v_uid) then
    v_was_confirmed := coalesce(v_agreement.responder_confirmed, false);
    v_other := v_agreement.requester_user_id;
    update public.agreements set responder_confirmed = true where id = p_id;
  else
    raise exception 'NOT_A_PARTY';
  end if;

  update public.agreements
  set status = 'ACTIVE'
  where id = p_id
    and coalesce(requester_confirmed, false)
    and coalesce(responder_confirmed, false);

  select * into v_agreement from public.agreements where id = p_id;

  if not v_was_confirmed and v_agreement.status = 'PENDING' and v_other is not null then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_other, 'AGREEMENT', 'Confirm within 12 hours',
        'The other side confirmed — confirm now or this agreement will auto-cancel.',
        '/agreement/' || p_id);
    exception when others then null;
    end;
  end if;

  return v_agreement;
end
$$;

revoke execute on function public.agreement_confirm(text) from public, anon;
grant execute on function public.agreement_confirm(text) to authenticated;


create or replace function public.cancel_expired_agreements()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_ag record;
begin
  -- 12-hour confirmation window for PENDING agreements
  for v_ag in
    select * from public.agreements
    where status = 'PENDING'
      and created_at < now() - interval '12 hours'
  loop
    update public.agreements set status = 'CANCELLED' where id = v_ag.id;
    update public.requests set status = 'OPEN' where id = v_ag.request_id;
    -- Only revert proposals that were accepted or rejected, protecting WITHDRAWN proposals (A11)
    update public.proposals set status = 'SUBMITTED'
    where request_id = v_ag.request_id and status in ('ACCEPTED', 'REJECTED');
  end loop;

  -- 24h payment reminder
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

  -- 72h unpaid auto-cancel
  for v_ag in
    select * from public.agreements
    where status = 'ACTIVE'
      and coalesce(payment_status, 'UNPAID') in ('UNPAID', 'REJECTED')
      and created_at < now() - interval '72 hours'
  loop
    update public.agreements set status = 'CANCELLED' where id = v_ag.id;
    update public.requests set status = 'OPEN' where id = v_ag.request_id;
    update public.proposals set status = 'SUBMITTED'
    where request_id = v_ag.request_id and status in ('ACCEPTED', 'REJECTED');

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
end;
$$;

revoke execute on function public.cancel_expired_agreements() from public, anon;
grant execute on function public.cancel_expired_agreements() to authenticated;


create or replace function public.agreement_cancel(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
  v_other text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_agreement.requester_user_id
     and v_uid is distinct from v_agreement.responder_user_id
     and not (v_agreement.responder_entity_id is not null and public.has_business_scope(v_agreement.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_A_PARTY';
  end if;

  if v_agreement.status <> 'ACTIVE' then raise exception 'INVALID_TRANSITION'; end if;
  if coalesce(v_agreement.payment_status, 'UNPAID') not in ('UNPAID', 'REJECTED') then
    raise exception 'PAYMENT_IN_PROGRESS';
  end if;

  update public.agreements set status = 'CANCELLED' where id = p_id and status = 'ACTIVE';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  update public.requests set status = 'OPEN' where id = v_agreement.request_id;
  update public.proposals set status = 'SUBMITTED'
  where request_id = v_agreement.request_id and status in ('ACCEPTED', 'REJECTED');

  v_other := case when v_uid = v_agreement.requester_user_id
    then v_agreement.responder_user_id else v_agreement.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_other, 'AGREEMENT', 'Agreement cancelled',
      'The agreement for "' || coalesce(v_agreement.request_title, 'your request') || '" was cancelled before payment.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end;
$$;

revoke execute on function public.agreement_cancel(text) from public, anon;
grant execute on function public.agreement_cancel(text) to authenticated;


create or replace function public.agreement_confirm_payment(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
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
$$;

revoke execute on function public.agreement_confirm_payment(text) from public, anon;
grant execute on function public.agreement_confirm_payment(text) to authenticated;


create or replace function public.agreement_reject_payment(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
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
$$;

revoke execute on function public.agreement_reject_payment(text) from public, anon;
grant execute on function public.agreement_reject_payment(text) to authenticated;


create or replace function public.agreement_start_work(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_ag.responder_user_id
     and not (v_ag.responder_entity_id is not null and public.has_business_scope(v_ag.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_RESPONDER';
  end if;

  if v_ag.status <> 'DEPOSIT_PAID' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'IN_PROGRESS' where id = p_id;
end;
$$;

revoke execute on function public.agreement_start_work(text) from public, anon;
grant execute on function public.agreement_start_work(text) to authenticated;


create or replace function public.agreement_submit_review(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_ag.responder_user_id
     and not (v_ag.responder_entity_id is not null and public.has_business_scope(v_ag.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_RESPONDER';
  end if;

  if v_ag.status <> 'IN_PROGRESS' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'REVIEW' where id = p_id;
end;
$$;

revoke execute on function public.agreement_submit_review(text) from public, anon;
grant execute on function public.agreement_submit_review(text) to authenticated;


create or replace function public.agreement_dispute(p_id text, p_reason text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_ag public.agreements%rowtype;
  v_other text;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid not in (v_ag.requester_user_id, v_ag.responder_user_id)
     and not (v_ag.responder_entity_id is not null and public.has_business_scope(v_ag.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_A_PARTY';
  end if;

  if v_ag.status not in ('IN_PROGRESS', 'REVIEW', 'DEPOSIT_PAID', 'ACTIVE') then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.agreements set status = 'DISPUTED', dispute_reason = p_reason where id = p_id;

  v_other := case when v_uid = v_ag.requester_user_id then v_ag.responder_user_id else v_ag.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_other, 'AGREEMENT', 'Dispute raised on agreement',
      'A dispute was raised on "' || left(coalesce(v_ag.request_title, 'this agreement'), 60) || '". Reason: ' || left(coalesce(p_reason, 'None stated'), 80),
      '/agreement/' || p_id);
  exception when others then null;
  end;
end;
$$;

revoke execute on function public.agreement_dispute(text, text) from public, anon;
grant execute on function public.agreement_dispute(text, text) to authenticated;

-- ── 7. Lightweight Me Too Toggle RPC (R7) ────────────────────────────────────

create or replace function public.me_too_toggle(p_request_id text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_req public.requests%rowtype;
  v_exists boolean;
  v_count integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_req from public.requests where id = p_request_id;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'OPEN' then raise exception 'REQUEST_CLOSED'; end if;

  select exists(
    select 1 from public.request_me_toos
    where request_id = p_request_id and user_id = v_uid
  ) into v_exists;

  if v_exists then
    delete from public.request_me_toos
    where request_id = p_request_id and user_id = v_uid;

    select count(*) into v_count
    from public.request_me_toos where request_id = p_request_id;

    update public.requests set me_too_count = v_count where id = p_request_id;
    return jsonb_build_object('ok', true, 'meTooed', false, 'count', v_count);
  else
    insert into public.request_me_toos (request_id, user_id, quantity)
    values (p_request_id, v_uid, 1)
    on conflict (request_id, user_id) do nothing;

    select count(*) into v_count
    from public.request_me_toos where request_id = p_request_id;

    update public.requests set me_too_count = v_count where id = p_request_id;
    return jsonb_build_object('ok', true, 'meTooed', true, 'count', v_count);
  end if;
end;
$$;

revoke execute on function public.me_too_toggle(text) from public, anon;
grant execute on function public.me_too_toggle(text) to authenticated;

-- ── 8. Bulk Deals & Group Buy Hardening (BLK-1, BLK-2, BLK-3, BLK-4, BLK-5) ──

alter table public.bulk_deal_tokens
  add column if not exists deposit_paid numeric(10,2) default 0,
  add column if not exists balance_due numeric(10,2) default 0;

create or replace function public._bulk_deal_close_internal(
  p_deal_id text, p_trigger text, p_outcome text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_deal public.bulk_deals%rowtype;
  v_paid_qty integer;
  v_unit_price numeric;
  v_tier jsonb;
  v_deposit_paid numeric;
  v_balance_due numeric;
  m record;
begin
  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.closed_at is not null then return; end if; -- already closed

  -- BLK-1: Count pledges where deposit was PAID OR deal had no deposit requirement
  select coalesce(sum(quantity), 0) into v_paid_qty
    from public.bulk_deal_pledges
   where deal_id = p_deal_id
     and (v_deal.deposit_amount is null or v_deal.deposit_amount = 0 or deposit_status = 'PAID');

  if p_outcome is null and v_paid_qty >= v_deal.moq then
    p_outcome := 'FULFILLED';
  end if;

  update public.bulk_deals set closed_at = now(), close_outcome = p_outcome where id = p_deal_id;

  if p_outcome = 'FULFILLED' then
    select t into v_tier
      from jsonb_array_elements(coalesce(v_deal.tiers, '[]'::jsonb)) as t
     where (t->>'minQty')::numeric <= v_paid_qty
     order by (t->>'minQty')::numeric desc
     limit 1;
    v_unit_price := coalesce((v_tier->>'unitPrice')::numeric, v_deal.regular_price);

    for m in
      select user_id, quantity, deposit_amount_paid
        from public.bulk_deal_pledges
       where deal_id = p_deal_id
         and (v_deal.deposit_amount is null or v_deal.deposit_amount = 0 or deposit_status = 'PAID')
    loop
      v_deposit_paid := coalesce(m.deposit_amount_paid, 0);
      v_balance_due := greatest(0, (m.quantity * coalesce(v_unit_price, 0)) - v_deposit_paid);

      insert into public.bulk_deal_tokens (
        token_code, deal_id, holder_user_id, issuer_user_id, business_id,
        quantity, unit_price, item_label, deposit_paid, balance_due
      ) values (
        'STRYT-D-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)),
        p_deal_id, m.user_id, v_deal.owner_user_id, v_deal.business_id,
        m.quantity, v_unit_price, v_deal.title, v_deposit_paid, v_balance_due
      )
      on conflict (deal_id, holder_user_id) do update
        set unit_price = excluded.unit_price,
            deposit_paid = excluded.deposit_paid,
            balance_due = excluded.balance_due;

      insert into public.notifications (user_id, type, title, body, deep_link)
      values (m.user_id, 'BULK_DEAL_UNLOCKED', 'Claim pass ready — "' || v_deal.title || '"',
              'The campaign closed and hit its target — your claim pass is ready.', '/community/activity');
    end loop;

  elsif p_outcome = 'REFUNDED' then
    for m in select user_id from public.bulk_deal_pledges where deal_id = p_deal_id and deposit_status = 'PAID' loop
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (m.user_id, 'BULK_DEAL_REFUNDED', '"' || v_deal.title || '" didn''t reach its target',
              'The business will refund your deposit directly.', '/business/' || v_deal.business_id);
    end loop;
  end if;
end;
$$;


create or replace function public.bulk_deal_delete(p_deal_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledger text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  if v_deal.owner_user_id <> v_uid
     and not public.has_business_scope(v_deal.business_id, v_uid, 'catalog')
     and not public.is_admin(v_uid) then
    raise exception 'NOT_ALLOWED';
  end if;

  -- BLK-2: Prevent deleting campaign if active unredeemed passes exist
  if exists (
    select 1 from public.bulk_deal_tokens
    where deal_id = p_deal_id and status = 'ISSUED'
  ) then
    raise exception 'CANNOT_DELETE_ACTIVE_TOKENS';
  end if;

  for v_pledger in
    select user_id from public.bulk_deal_pledges
    where deal_id = p_deal_id and deposit_status = 'PAID'
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_pledger, 'BULK_DEAL_DEPOSIT_REJECTED', 'Campaign cancelled',
        'The business removed "' || left(v_deal.title, 60) || '" — your paid deposit needs to be sorted out with them directly.',
        '/business/' || v_deal.business_id);
    exception when others then null;
    end;
  end loop;

  delete from public.bulk_deals where id = p_deal_id;
end;
$$;

revoke execute on function public.bulk_deal_delete(text) from public, anon;
grant execute on function public.bulk_deal_delete(text) to authenticated;


create or replace function public.bulk_deal_close(p_deal_id text, p_outcome text default null)
returns public.bulk_deals
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  -- BLK-3: Support delegated team member with catalog scope
  if v_deal.owner_user_id <> v_uid
     and not public.has_business_scope(v_deal.business_id, v_uid, 'catalog')
     and not public.is_admin(v_uid) then
    raise exception 'NOT_OWNER';
  end if;

  if v_deal.closed_at is not null then raise exception 'DEAL_ALREADY_CLOSED'; end if;
  if p_outcome is not null and p_outcome not in ('FULFILLED','REFUNDED') then
    raise exception 'INVALID_OUTCOME';
  end if;

  perform public._bulk_deal_close_internal(p_deal_id, 'MANUAL', p_outcome);

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  return v_deal;
end;
$$;

revoke execute on function public.bulk_deal_close(text, text) from public, anon;
grant execute on function public.bulk_deal_close(text, text) to authenticated;


create or replace function public.bulk_deal_extend(p_deal_id text, p_new_closes_at timestamptz)
returns public.bulk_deals
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledger record;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  -- BLK-3: Support delegated team member with catalog scope
  if v_deal.owner_user_id <> v_uid
     and not public.has_business_scope(v_deal.business_id, v_uid, 'catalog')
     and not public.is_admin(v_uid) then
    raise exception 'NOT_OWNER';
  end if;

  if v_deal.close_outcome is not null then raise exception 'DEAL_ALREADY_RESOLVED'; end if;
  if p_new_closes_at <= now() then raise exception 'DEADLINE_MUST_BE_FUTURE'; end if;

  update public.bulk_deals set closes_at = p_new_closes_at, closed_at = null where id = p_deal_id
  returning * into v_deal;

  for v_pledger in select user_id from public.bulk_deal_pledges where deal_id = p_deal_id loop
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_pledger.user_id, 'BULK_DEAL_EXTENDED', '"' || v_deal.title || '" got more time',
            'The business extended this campaign — it''s still collecting pledges.', '/business/' || v_deal.business_id);
  end loop;

  return v_deal;
end;
$$;

revoke execute on function public.bulk_deal_extend(text, timestamptz) from public, anon;
grant execute on function public.bulk_deal_extend(text, timestamptz) to authenticated;


create or replace function public.bulk_deal_token_redeem(
  p_token_code text, p_business_id text default null
)
returns public.bulk_deal_tokens
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_token public.bulk_deal_tokens%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_token from public.bulk_deal_tokens
   where token_code = upper(trim(p_token_code)) for update;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;

  -- BLK-5: Guard against cross-store redemption for multi-location businesses
  if p_business_id is not null and v_token.business_id is not null and v_token.business_id <> p_business_id then
    raise exception 'WRONG_BUSINESS_LOCATION';
  end if;

  if not (
    v_token.issuer_user_id = v_uid
    or (v_token.business_id is not null and public.has_business_scope(v_token.business_id, v_uid, 'appointments'))
    or (v_token.business_id is not null and public.has_business_scope(v_token.business_id, v_uid, 'catalog'))
    or public.is_admin(v_uid)
  ) then
    raise exception 'NOT_AUTHORIZED_TO_REDEEM';
  end if;

  if v_token.status = 'REDEEMED' then raise exception 'ALREADY_REDEEMED'; end if;
  if v_token.status = 'EXPIRED' or (v_token.valid_until is not null and v_token.valid_until < now()) then
    raise exception 'TOKEN_EXPIRED';
  end if;

  update public.bulk_deal_tokens
     set status = 'REDEEMED', redeemed_at = now(), redeemed_by = v_uid
   where id = v_token.id and status = 'ISSUED'
  returning * into v_token;

  if not found then raise exception 'ALREADY_REDEEMED'; end if;
  return v_token;
end;
$$;

revoke execute on function public.bulk_deal_token_redeem(text, text) from public, anon;
grant execute on function public.bulk_deal_token_redeem(text, text) to authenticated;
