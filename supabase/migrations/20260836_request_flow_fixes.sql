-- ============================================================
-- 20260836 — Request/quote/agreement flow: correctness fixes + withdraw
--
-- Bundles the bugs found in a full read-through of the request → quote →
-- agreement pipeline:
--   1. notify_on_request() deep-links category-matched providers to a route
--      that doesn't exist (/manage/leads instead of /manage/find-work) —
--      every provider lead notification has been 404ing.
--   2. A responder is never notified when their quote is accepted, even
--      though the resulting agreement starts a hard 10-minute confirm-or-
--      expire countdown.
--   3. proposals.price has no floor — a ₹0/negative quote is a dead end
--      that only surfaces at accept time.
--   4. Adds withdraw_proposal — ProposalStatus already has a WITHDRAWN value
--      that nothing has ever set.
--
-- Run manually in the Supabase SQL editor (this repo's established pattern).
-- ============================================================

-- ── 1 · Fix the provider lead deep-link ───────────────────────
create or replace function public.notify_on_request()
returns trigger as $$
declare
  delta double precision;
begin
  if new.lat is null or new.lng is null then
    return new;
  end if;
  delta := coalesce(new.radius_km, 5) / 111.0;

  insert into public.notifications (user_id, type, title, body, deep_link)
  select u.id, 'NEARBY_REQUEST',
         'New request near you',
         coalesce(new.category_name, 'Someone') || ' needs help: "' || left(coalesce(new.title, new.description, 'a request'), 60) || '"',
         '/request/' || new.id
    from public.users u
   where u.id <> new.requester_user_id
     and u.lat is not null and u.lng is not null
     and u.lat between new.lat - delta and new.lat + delta
     and u.lng between new.lng - delta and new.lng + delta
   limit 200;

  if new.category_id is not null then
    insert into public.notifications (user_id, type, title, body, deep_link)
    select b.owner_user_id, 'NEARBY_REQUEST',
           'New ' || coalesce(new.category_name, 'request') || ' request',
           left(coalesce(new.title, new.description, 'A customer nearby needs help'), 80),
           '/business/' || b.id || '/manage/requests'
      from public.businesses b
     where b.category_id = new.category_id
       and b.status = 'ACTIVE'
       and coalesce(b.owner_user_id, '') <> new.requester_user_id
       and b.lat is not null and b.lng is not null
       and b.lat between new.lat - delta and new.lat + delta
       and b.lng between new.lng - delta and new.lng + delta
     limit 200;

    -- Fixed: was '/provider/' || p.id || '/manage/leads', a route that has
    -- never existed (the real Find-Requests screen is at /manage/find-work).
    insert into public.notifications (user_id, type, title, body, deep_link)
    select p.user_id, 'NEARBY_REQUEST',
           'New ' || coalesce(new.category_name, 'request') || ' request',
           left(coalesce(new.title, new.description, 'A customer nearby needs help'), 80),
           '/provider/' || p.id || '/manage/find-work'
      from public.providers p
     where p.category_id = new.category_id
       and p.status = 'ACTIVE'
       and coalesce(p.user_id, '') <> new.requester_user_id
       and p.lat is not null and p.lng is not null
       and p.lat between new.lat - delta and new.lat + delta
       and p.lng between new.lng - delta and new.lng + delta
     limit 200;
  end if;

  return new;
end $$ language plpgsql security definer set search_path = public;

-- ── 2 · proposals.price floor (defense-in-depth; NOT VALID so this
--        can't fail the migration against any pre-existing ₹0 rows —
--        only new/updated rows are checked going forward) ───────
alter table public.proposals drop constraint if exists proposals_price_positive;
alter table public.proposals add constraint proposals_price_positive check (price > 0) not valid;

-- ── 3 · Notify the responder the moment their quote is accepted ──
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

  update public.proposals set status = 'REJECTED'
  where request_id = v_request.id and id <> p_proposal_id and status = 'SUBMITTED';

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    v_proposal.responder_user_id, 'AGREEMENT', 'Your quote was accepted! 🎉',
    'Confirm within 10 minutes to lock in "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
    '/agreement/' || v_agreement_id
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

  update public.proposals set status = 'REJECTED'
  where request_id = v_request.id and id <> p_proposal_id and status = 'SUBMITTED';

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    v_proposal.responder_user_id, 'AGREEMENT', 'Your quote was accepted! 🎉',
    'Confirm within 10 minutes to lock in "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
    '/agreement/' || v_agreement_id
  );

  return v_agreement_id;
end
$$;
-- accept_proposal_at_price (20260824_booking_and_rpc_security.sql) delegates
-- to the two functions above, so it inherits the notification for free —
-- no change needed there.

-- ── 4 · withdraw_proposal — a responder can retract a mis-quote ──
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
  if v_proposal.responder_user_id is distinct from v_uid then
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
end
$$;

revoke all on function public.withdraw_proposal(text) from public, anon;
grant execute on function public.withdraw_proposal(text) to authenticated;
