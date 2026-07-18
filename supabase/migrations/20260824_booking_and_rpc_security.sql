-- 20260824 — Booking, agreement, and delegated-access authority hardening
--
-- EXPAND migration: introduces server-authoritative mutation RPCs while keeping
-- existing authenticated table-write policies temporarily for deployed-client
-- compatibility. A later CONTRACT migration may remove those raw writes only
-- after the new frontend is deployed and old clients are cut off.

-- Expire elapsed delegated sessions without deleting audit history.
update public.business_access_sessions
set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
where status in ('PENDING', 'ACTIVE')
  and expires_at is not null
  and expires_at <= now();

-- Invariants are intentionally fatal: a migration must not report success if
-- concurrency protection could not be installed.
create unique index if not exists business_access_sessions_one_current
  on public.business_access_sessions (business_id, grantee_user_id)
  where status in ('PENDING', 'ACTIVE');

create unique index if not exists agreements_one_per_request
  on public.agreements (request_id)
  where request_id is not null;

create unique index if not exists agreements_one_per_proposal
  on public.agreements (proposal_id)
  where proposal_id is not null;

drop index if exists public.appointments_no_double_book;
create unique index appointments_no_double_book
  on public.appointments (target_type, target_id, scheduled_for)
  where status in ('PENDING', 'ACCEPTED');

-- Correct broad agreement reads immediately; this does not break legitimate
-- clients because every agreement screen is party-scoped.
drop policy if exists read_agreements on public.agreements;
create policy read_agreements on public.agreements
  for select to authenticated
  using (
    (select auth.uid()) is not null
    and (
      (select auth.uid())::text in (requester_user_id, responder_user_id)
      or exists (
        select 1 from public.users u
        where u.id = (select auth.uid())::text
          and u.roles && array['admin', 'super_admin']::text[]
      )
    )
  );


-- Delegated business access: canonical UUID contract and atomic decisions.
-- These access predicates are recreated here because some live environments
-- contain the delegated-session tables/RPCs but are missing the historical
-- helper functions. The raw predicate is not client-executable; callers use
-- the current-user wrapper below.
create or replace function public.has_business_access(
  p_business_id text, p_uid text
) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_user_id = p_uid
  ) or exists (
    select 1 from public.business_access_sessions s
    where s.business_id = p_business_id
      and s.grantee_user_id = p_uid
      and s.status = 'ACTIVE'
      and (s.expires_at is null or s.expires_at > now())
  );
$$;

create or replace function public.my_business_access_status(p_business_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select (select auth.uid()) is not null
    and public.has_business_access(p_business_id, (select auth.uid())::text);
$$;

create or replace function public.close_expired_business_sessions()
returns void
language sql security definer
set search_path = public
as $$
  update public.business_access_sessions
  set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
  where status in ('PENDING', 'ACTIVE')
    and expires_at is not null
    and expires_at <= now();
$$;

create or replace function public.decide_business_session(
  p_session_id uuid, p_approve boolean
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_session public.business_access_sessions%rowtype;
  v_hours integer;
  v_business_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select s.* into v_session
  from public.business_access_sessions s
  join public.businesses b on b.id = s.business_id
  where s.id = p_session_id and b.owner_user_id = v_uid
  for update of s;

  if not found then raise exception 'NOT_ALLOWED'; end if;
  if v_session.status <> 'PENDING' then raise exception 'ALREADY_DECIDED'; end if;

  if v_session.expires_at is not null and v_session.expires_at <= now() then
    update public.business_access_sessions
    set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
    where id = p_session_id and status = 'PENDING';
    return;
  end if;

  select least(greatest(coalesce(c.session_hours, 8), 1), 720), b.name
  into v_hours, v_business_name
  from public.businesses b
  left join public.business_login_credentials c on c.business_id = b.id
  where b.id = v_session.business_id;

  update public.business_access_sessions
  set status = case when p_approve then 'ACTIVE' else 'DENIED' end,
      decided_at = now(),
      expires_at = case when p_approve
        then now() + make_interval(hours => v_hours)
        else null end
  where id = p_session_id and status = 'PENDING';

  if not found then raise exception 'ALREADY_DECIDED'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      v_session.grantee_user_id, 'BUSINESS_ACCESS',
      case when p_approve then 'Access approved' else 'Access denied' end,
      case when p_approve
        then 'You can now manage ' || coalesce(v_business_name, 'the business') || '.'
        else 'Your request to manage ' || coalesce(v_business_name, 'the business') || ' was declined.' end,
      case when p_approve
        then '/business/' || v_session.business_id || '/manage'
        else '/account/business-access' end
    );
  exception when others then null;
  end;
end
$$;

create or replace function public.revoke_business_session(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_session public.business_access_sessions%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_session
  from public.business_access_sessions
  where id = p_session_id
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.grantee_user_id is distinct from v_uid
     and not exists (
       select 1 from public.businesses b
       where b.id = v_session.business_id and b.owner_user_id = v_uid
     ) then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.business_access_sessions
  set status = 'REVOKED', decided_at = now(),
      expires_at = case when status = 'ACTIVE' then now() else expires_at end
  where id = p_session_id and status in ('PENDING', 'ACTIVE');
end
$$;

create or replace function public.grant_business_access(
  p_business_id text, p_identifier text
) returns table (session_id uuid, grantee_name text)
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_identifier text := trim(coalesce(p_identifier, ''));
  v_digits text := regexp_replace(v_identifier, '\D', '', 'g');
  v_target text;
  v_name text;
  v_business_name text;
  v_session_id uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select b.name into v_business_name
  from public.businesses b
  where b.id = p_business_id and b.owner_user_id = v_uid;
  if not found then raise exception 'NOT_ALLOWED'; end if;
  if v_identifier = '' then raise exception 'IDENTIFIER_REQUIRED'; end if;

  if v_identifier ~ '@.*\.' then
    select u.id, coalesce(nullif(trim(u.alias), ''), u.name, 'User')
    into v_target, v_name
    from public.users u
    where lower(u.email) = lower(v_identifier)
    order by u.id limit 1;
  elsif regexp_replace(v_identifier, '[\s\-+]', '', 'g') ~ '^\d{6,}$' then
    select u.id, coalesce(nullif(trim(u.alias), ''), u.name, 'User')
    into v_target, v_name
    from public.users u
    where right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10)
          = right(v_digits, 10)
    order by u.id limit 1;
  else
    select u.id, coalesce(nullif(trim(u.alias), ''), u.name, 'User')
    into v_target, v_name
    from public.users u
    where lower(u.alias) = lower(ltrim(v_identifier, '@'))
    order by u.id limit 1;
  end if;

  if v_target is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_target = v_uid then raise exception 'OWNER_ALREADY_HAS_ACCESS'; end if;

  -- Serialize owner grants for the same business/grantee pair so concurrent
  -- requests reuse one current row instead of surfacing a unique-index race.
  perform pg_advisory_xact_lock(hashtextextended(p_business_id || ':' || v_target, 0));

  update public.business_access_sessions
  set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
  where business_id = p_business_id and grantee_user_id = v_target
    and status in ('PENDING', 'ACTIVE')
    and expires_at is not null and expires_at <= now();

  select s.id into v_session_id
  from public.business_access_sessions s
  where s.business_id = p_business_id
    and s.grantee_user_id = v_target
    and s.status in ('PENDING', 'ACTIVE')
  order by s.requested_at desc, s.id desc
  limit 1 for update;

  if v_session_id is null then
    insert into public.business_access_sessions
      (business_id, grantee_user_id, status, decided_at, expires_at)
    values (p_business_id, v_target, 'ACTIVE', now(), null)
    returning id into v_session_id;
  else
    update public.business_access_sessions
    set status = 'ACTIVE', decided_at = now(), expires_at = null
    where id = v_session_id;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_target, 'BUSINESS_ACCESS', 'Access granted',
      'You can now manage ' || coalesce(v_business_name, 'a business') || '.',
      '/business/' || p_business_id || '/manage');
  exception when others then null;
  end;

  return query select v_session_id, coalesce(v_name, 'User');
end
$$;


create or replace function public.business_login_attempt(p_login_id text, p_password text)
returns table (status text, business_id text, session_id uuid, business_name text)
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_uid text := auth.uid()::text;
  v_login_key text := lower(trim(coalesce(p_login_id, '')));
  v_attempt public.business_login_attempts%rowtype;
  v_credential public.business_login_credentials%rowtype;
  v_owner text;
  v_name text;
  v_grantee text;
  v_existing public.business_access_sessions%rowtype;
  v_status text;
  v_expires timestamptz;
  v_id uuid;
  v_hash text;
  v_password_matches boolean;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_dummy_hash constant text := '$2a$10$CXSUxhkNpnbyeflgDI/sMei3m6s9krMAI2wx72jT.YBXr.Agkk6H2';
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  if v_login_key = '' then
    return query select 'INVALID_CREDENTIALS'::text, null::text, null::uuid,
      'Invalid login id or password'::text;
    return;
  end if;

  select * into v_attempt
  from public.business_login_attempts
  where login_id = v_login_key and attempted_by = v_uid
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return query select 'LOCKED'::text, null::text, null::uuid,
      ('Too many failed attempts. Try again in ' ||
       greatest(1, ceil(extract(epoch from (v_attempt.locked_until - now())) / 60)::integer) ||
       ' minute(s).')::text;
    return;
  end if;

  select * into v_credential
  from public.business_login_credentials c
  where lower(trim(c.login_id)) = v_login_key and c.is_enabled = true;

  v_hash := coalesce(nullif(v_credential.password_hash, ''), v_dummy_hash);
  v_password_matches := crypt(coalesce(p_password, ''), v_hash) = v_hash;

  if v_credential.business_id is null or p_password is null or not v_password_matches then
    insert into public.business_login_attempts
      (login_id, attempted_by, fail_count, last_attempt_at, locked_until)
    values (v_login_key, v_uid, 1, now(), null)
    on conflict (login_id, attempted_by) do update
    set fail_count = case
          when business_login_attempts.last_attempt_at <= now() - v_window
            or business_login_attempts.locked_until is not null
          then 1 else business_login_attempts.fail_count + 1 end,
        last_attempt_at = now(),
        locked_until = case
          when (case
            when business_login_attempts.last_attempt_at <= now() - v_window
              or business_login_attempts.locked_until is not null
            then 1 else business_login_attempts.fail_count + 1 end) >= v_max_attempts
          then now() + v_window else null end
    returning * into v_attempt;

    if v_attempt.locked_until is not null then
      return query select 'LOCKED'::text, null::text, null::uuid,
        'Too many failed attempts. Try again in 15 minutes.'::text;
    else
      return query select 'INVALID_CREDENTIALS'::text, null::text, null::uuid,
        'Invalid login id or password'::text;
    end if;
    return;
  end if;

  delete from public.business_login_attempts
  where login_id = v_login_key and attempted_by = v_uid;

  select b.owner_user_id, b.name into v_owner, v_name
  from public.businesses b where b.id = v_credential.business_id;
  if v_owner = v_uid then raise exception 'OWNER_ALREADY_HAS_ACCESS'; end if;

  select coalesce(nullif(trim(u.alias), ''), u.name, 'Someone') into v_grantee
  from public.users u where u.id = v_uid;

  -- Serialize successful sessions for this business/grantee pair even when the
  -- attempt counter row does not yet exist.
  perform pg_advisory_xact_lock(
    hashtextextended(v_credential.business_id || ':' || v_uid, 0)
  );

  update public.business_access_sessions
  set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
  where business_id = v_credential.business_id and grantee_user_id = v_uid
    and status in ('PENDING', 'ACTIVE')
    and expires_at is not null and expires_at <= now();

  select * into v_existing
  from public.business_access_sessions s
  where s.business_id = v_credential.business_id
    and s.grantee_user_id = v_uid
    and s.status in ('PENDING', 'ACTIVE')
  order by s.requested_at desc, s.id desc
  limit 1 for update;

  if v_existing.id is not null then
    return query select v_existing.status, v_existing.business_id, v_existing.id, v_name;
    return;
  end if;

  if v_credential.require_approval then
    v_status := 'PENDING';
    v_expires := now() + interval '30 seconds';
  else
    v_status := 'ACTIVE';
    v_expires := now() + make_interval(
      hours => least(greatest(coalesce(v_credential.session_hours, 8), 1), 720)
    );
  end if;

  insert into public.business_access_sessions
    (business_id, grantee_user_id, status, decided_at, expires_at)
  values (
    v_credential.business_id, v_uid, v_status,
    case when v_status = 'ACTIVE' then now() else null end,
    v_expires
  ) returning id into v_id;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      v_owner, 'BUSINESS_ACCESS',
      case when v_status = 'PENDING' then 'Access request' else 'Business login' end,
      v_grantee || case when v_status = 'PENDING'
        then ' wants to manage ' || coalesce(v_name, 'your business') || '. Approve within 30 seconds.'
        else ' logged in to manage ' || coalesce(v_name, 'your business') || '.' end,
      '/account/business-access'
    );
  exception when others then null;
  end;

  return query select v_status, v_credential.business_id, v_id, v_name;
end
$$;


-- Proposal negotiation and acceptance: lock the request/proposal, preserve the
-- original quote, and accept only a latest responder-authored counter by ID.
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
  return v_counter;
end
$$;

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

  return v_agreement_id;
end
$$;

-- Compatibility for deployed clients that still pass an amount. It resolves
-- that amount only to the latest responder-authored counter, then delegates to
-- the ID-based authoritative function.
create or replace function public.accept_proposal_at_price(
  p_proposal_id text, p_final_price integer
) returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_original_price integer;
  v_counter_id text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select p.price into v_original_price
  from public.proposals p
  join public.requests r on r.id = p.request_id
  where p.id = p_proposal_id and r.requester_user_id = v_uid;
  if not found then raise exception 'NOT_REQUEST_OWNER'; end if;

  if p_final_price = v_original_price then
    return public.accept_proposal(p_proposal_id);
  end if;

  select c.id into v_counter_id
  from public.proposal_counters c
  join public.proposals p on p.id = c.proposal_id
  where c.proposal_id = p_proposal_id
    and c.by_user_id = p.responder_user_id
    and c.amount = p_final_price
  order by c.created_at desc, c.id desc
  limit 1;

  if v_counter_id is null then raise exception 'PRICE_NOT_NEGOTIATED'; end if;
  return public.accept_proposal_counter(p_proposal_id, v_counter_id);
end
$$;


-- Agreement confirmation and lifecycle. Every transition locks the row and
-- validates both caller role and current state before mutation.
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
     and v_agreement.created_at <= now() - interval '10 minutes' then
    raise exception 'AGREEMENT_EXPIRED';
  end if;

  if v_uid = v_agreement.requester_user_id then
    v_was_confirmed := coalesce(v_agreement.requester_confirmed, false);
    v_other := v_agreement.responder_user_id;
    update public.agreements set requester_confirmed = true where id = p_id;
  elsif v_uid = v_agreement.responder_user_id then
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
      values (v_other, 'AGREEMENT', 'Confirm within 10 minutes',
        'The other side confirmed — confirm now or this agreement will auto-cancel.',
        '/agreement/' || p_id);
    exception when others then null;
    end;
  end if;

  return v_agreement;
end
$$;

create or replace function public.notify_agreement_confirm(
  p_agreement_id text, p_recipient_user_id text
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_requester text;
  v_responder text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select requester_user_id, responder_user_id
  into v_requester, v_responder
  from public.agreements where id = p_agreement_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid not in (v_requester, v_responder) then raise exception 'NOT_A_PARTY'; end if;
  if p_recipient_user_id not in (v_requester, v_responder)
     or p_recipient_user_id = v_uid then
    raise exception 'RECIPIENT_MUST_BE_OTHER_PARTY';
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (p_recipient_user_id, 'AGREEMENT', 'Confirm within 10 minutes',
    'The other side confirmed — confirm now or this agreement will auto-cancel.',
    '/agreement/' || p_agreement_id);
end
$$;

create or replace function public.agreement_start_work(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.responder_user_id then raise exception 'NOT_RESPONDER'; end if;
  if v_agreement.status <> 'DEPOSIT_PAID' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'IN_PROGRESS'
  where id = p_id and status = 'DEPOSIT_PAID';
  if not found then raise exception 'INVALID_TRANSITION'; end if;
end $$;

create or replace function public.agreement_submit_review(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.responder_user_id then raise exception 'NOT_RESPONDER'; end if;
  if v_agreement.status <> 'IN_PROGRESS' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'REVIEW'
  where id = p_id and status = 'IN_PROGRESS';
  if not found then raise exception 'INVALID_TRANSITION'; end if;
end $$;

create or replace function public.agreement_complete(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.requester_user_id then raise exception 'NOT_REQUESTER'; end if;
  if v_agreement.status <> 'REVIEW' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'COMPLETED'
  where id = p_id and status = 'REVIEW';
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  update public.payments set escrow_status = 'RELEASED'
  where agreement_id = p_id and escrow_status = 'HELD';
end $$;

create or replace function public.agreement_dispute(p_id text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'REASON_REQUIRED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.requester_user_id
     and v_uid is distinct from v_agreement.responder_user_id then
    raise exception 'NOT_A_PARTY';
  end if;
  if v_agreement.status not in ('IN_PROGRESS', 'REVIEW') then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements
  set status = 'DISPUTED', dispute_reason = left(trim(p_reason), 2000)
  where id = p_id and status in ('IN_PROGRESS', 'REVIEW');
  if not found then raise exception 'INVALID_TRANSITION'; end if;
end $$;

create or replace function public.agreement_claim_payment(
  p_id text, p_method text, p_amount integer default null,
  p_reference text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
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

  -- p_amount remains only for old-client signature compatibility. The database
  -- is authoritative for money and always records agreed_price.
  update public.agreements
  set payment_method = p_method,
      payment_status = 'PENDING_CONFIRM',
      payment_amount = agreed_price,
      payment_reference = nullif(left(trim(coalesce(p_reference, '')), 200), '')
  where id = p_id and status = 'ACTIVE'
    and payment_status in ('UNPAID', 'REJECTED');
  if not found then raise exception 'PAYMENT_ALREADY_CLAIMED'; end if;
end
$$;

create or replace function public.agreement_confirm_payment(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.responder_user_id then raise exception 'NOT_RESPONDER'; end if;
  if v_agreement.status <> 'ACTIVE' or v_agreement.payment_status <> 'PENDING_CONFIRM' then
    raise exception 'INVALID_TRANSITION';
  end if;
  update public.agreements
  set payment_status = 'PAID', status = 'DEPOSIT_PAID'
  where id = p_id and status = 'ACTIVE' and payment_status = 'PENDING_CONFIRM';
  if not found then raise exception 'INVALID_TRANSITION'; end if;
end $$;

create or replace function public.agreement_reject_payment(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.responder_user_id then raise exception 'NOT_RESPONDER'; end if;
  if v_agreement.status <> 'ACTIVE' or v_agreement.payment_status <> 'PENDING_CONFIRM' then
    raise exception 'INVALID_TRANSITION';
  end if;
  update public.agreements set payment_status = 'REJECTED'
  where id = p_id and status = 'ACTIVE' and payment_status = 'PENDING_CONFIRM';
  if not found then raise exception 'INVALID_TRANSITION'; end if;
end $$;


create or replace function public.agreement_update_live_status(
  p_id text, p_status text, p_lat double precision default null,
  p_lng double precision default null
) returns public.agreements
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_status not in ('CONFIRMED', 'LEAVING', 'ON_THE_WAY', 'ARRIVED', 'WORKING', 'DONE') then
    raise exception 'INVALID_LIVE_STATUS';
  end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.responder_user_id then raise exception 'NOT_RESPONDER'; end if;
  if v_agreement.status <> 'IN_PROGRESS' then raise exception 'INVALID_TRANSITION'; end if;

  update public.agreements
  set live_status = p_status,
      provider_lat = coalesce(p_lat, provider_lat),
      provider_lng = coalesce(p_lng, provider_lng)
  where id = p_id and status = 'IN_PROGRESS'
  returning * into v_agreement;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_agreement;
end
$$;

create or replace function public.agreement_create_tracking_token(p_id text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
  v_token uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.requester_user_id then raise exception 'NOT_REQUESTER'; end if;
  if v_agreement.status <> 'IN_PROGRESS' then raise exception 'INVALID_TRANSITION'; end if;

  if v_agreement.tracking_token is not null
     and exists (select 1 from public.tracking_tokens t
                 where t.id = v_agreement.tracking_token and t.expires_at > now()) then
    return v_agreement.tracking_token;
  end if;

  insert into public.tracking_tokens (agreement_id, expires_at)
  values (p_id, now() + interval '4 hours')
  returning id into v_token;

  update public.agreements set tracking_token = v_token where id = p_id;
  return v_token;
end
$$;

create or replace function public.admin_resolve_agreement_dispute(
  p_id text, p_resolution text
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not exists (
    select 1 from public.users u
    where u.id = v_uid and u.roles && array['admin', 'super_admin']::text[]
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_resolution not in ('COMPLETED', 'CANCELLED') then raise exception 'INVALID_RESOLUTION'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_agreement.status <> 'DISPUTED' then raise exception 'INVALID_TRANSITION'; end if;

  update public.agreements
  set status = p_resolution::public.agreement_status
  where id = p_id and status = 'DISPUTED';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  update public.payments
  set escrow_status = case when p_resolution = 'COMPLETED' then 'RELEASED' else 'REFUNDED' end
  where agreement_id = p_id and escrow_status = 'HELD';

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    select party_id, 'AGREEMENT', 'Dispute resolved',
      case when p_resolution = 'COMPLETED'
        then 'The disputed agreement was resolved as completed.'
        else 'The disputed agreement was cancelled.' end,
      '/agreement/' || p_id
    from (values (v_agreement.requester_user_id), (v_agreement.responder_user_id)) v(party_id)
    where party_id is not null;
  exception when others then null;
  end;
end
$$;


-- Appointment creation and transitions. Target ownership and customer identity
-- are resolved server-side rather than trusted from caller-supplied row data.
create or replace function public.appointment_create(
  p_target_type text, p_target_id text, p_scheduled_for timestamptz,
  p_date_label text, p_time_label text, p_notes text default null,
  p_photo_url text default null, p_package_id text default null,
  p_package_name text default null, p_package_price numeric default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_target_avatar text;
  v_customer_name text;
  v_customer_avatar text;
  v_appointment public.appointments%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name, b.cover_image
    into v_owner, v_target_name, v_target_avatar
    from public.businesses b where b.id = p_target_id;
  else
    select p.user_id, p.display_name, p.avatar
    into v_owner, v_target_name, v_target_avatar
    from public.providers p where p.id = p_target_id;
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;

  select coalesce(nullif(trim(u.name), ''), 'Customer'), u.avatar
  into v_customer_name, v_customer_avatar
  from public.users u where u.id = v_uid;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label, notes, photo_url,
    package_id, package_name, package_price, status
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, v_customer_name, v_customer_avatar,
    p_scheduled_for, p_date_label, p_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    p_package_id, p_package_name, p_package_price, 'PENDING'
  ) returning * into v_appointment;

  return v_appointment;
end
$$;

create or replace function public.appointment_create_walk_in(
  p_target_type text, p_target_id text, p_customer_name text,
  p_customer_phone text, p_scheduled_for timestamptz,
  p_date_label text, p_time_label text, p_package_id text default null,
  p_package_name text default null, p_package_price numeric default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_target_avatar text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean := false;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if nullif(trim(coalesce(p_customer_name, '')), '') is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name, b.cover_image
    into v_owner, v_target_name, v_target_avatar
    from public.businesses b where b.id = p_target_id;
    v_allowed := public.has_business_access(p_target_id, v_uid);
  else
    select p.user_id, p.display_name, p.avatar
    into v_owner, v_target_name, v_target_avatar
    from public.providers p where p.id = p_target_id;
    v_allowed := v_owner = v_uid;
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, scheduled_for, date_label, time_label,
    notes, package_id, package_name, package_price, status, is_walk_in
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, left(trim(p_customer_name), 200), p_scheduled_for,
    p_date_label, p_time_label,
    case when nullif(trim(coalesce(p_customer_phone, '')), '') is null
      then 'Walk-in'
      else 'Walk-in • ' || left(trim(p_customer_phone), 30) end,
    p_package_id, p_package_name, p_package_price, 'ACCEPTED', true
  ) returning * into v_appointment;

  return v_appointment;
end
$$;

create or replace function public.appointment_transition(
  p_id text, p_status text, p_response_note text default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_is_customer boolean;
  v_is_manager boolean;
  v_cancelled_by text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_is_customer := v_appointment.customer_user_id = v_uid and not v_appointment.is_walk_in;
  v_is_manager := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_access(v_appointment.target_id, v_uid));

  if v_is_customer and p_status = 'CANCELLED'
     and v_appointment.status in ('PENDING', 'ACCEPTED') then
    v_cancelled_by := 'CUSTOMER';
  elsif v_is_manager and v_appointment.status = 'PENDING'
        and p_status in ('ACCEPTED', 'REJECTED') then
    v_cancelled_by := null;
  elsif v_is_manager and v_appointment.status = 'ACCEPTED'
        and p_status = 'CANCELLED' then
    v_cancelled_by := 'OWNER';
  elsif v_is_manager and v_appointment.status = 'COMPLETED'
        and p_status = 'NO_SHOW' then
    v_cancelled_by := null;
  else
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.appointments
  set status = p_status,
      response_note = case when p_response_note is null then response_note
        else nullif(left(trim(p_response_note), 1000), '') end,
      cancelled_by = case when p_status = 'CANCELLED' then v_cancelled_by else cancelled_by end
  where id = p_id and status = v_appointment.status
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$$;

create or replace function public.appointment_claim_payment(
  p_id text, p_method text, p_amount numeric default null,
  p_reference text default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_amount numeric;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if v_appointment.customer_user_id is distinct from v_uid or v_appointment.is_walk_in then
    raise exception 'NOT_CUSTOMER';
  end if;
  if v_appointment.status not in ('PENDING', 'ACCEPTED', 'COMPLETED') then
    raise exception 'INVALID_TRANSITION';
  end if;
  if v_appointment.payment_status not in ('UNPAID', 'REJECTED') then
    raise exception 'PAYMENT_ALREADY_CLAIMED';
  end if;

  v_amount := coalesce(v_appointment.package_price, p_amount);
  if v_amount is null or v_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  update public.appointments
  set payment_method = p_method,
      payment_status = 'PENDING_CONFIRM',
      payment_amount = v_amount,
      payment_reference = nullif(left(trim(coalesce(p_reference, '')), 200), '')
  where id = p_id and payment_status in ('UNPAID', 'REJECTED')
  returning * into v_appointment;
  if not found then raise exception 'PAYMENT_ALREADY_CLAIMED'; end if;
  return v_appointment;
end
$$;

create or replace function public.appointment_confirm_payment(p_id text)
returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_access(v_appointment.target_id, v_uid));
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;
  if v_appointment.payment_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.appointments set payment_status = 'PAID'
  where id = p_id and payment_status = 'PENDING_CONFIRM'
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$$;

create or replace function public.appointment_reject_payment(p_id text)
returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_access(v_appointment.target_id, v_uid));
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;
  if v_appointment.payment_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.appointments set payment_status = 'REJECTED'
  where id = p_id and payment_status = 'PENDING_CONFIRM'
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$$;

create or replace function public.appointment_record_walk_in_payment(
  p_id text, p_method text, p_amount numeric default null,
  p_reference text default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
  v_amount numeric;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_access(v_appointment.target_id, v_uid));
  if not v_allowed or not v_appointment.is_walk_in then raise exception 'NOT_WALK_IN_MANAGER'; end if;
  if v_appointment.payment_status not in ('UNPAID', 'REJECTED') then raise exception 'INVALID_TRANSITION'; end if;

  v_amount := coalesce(v_appointment.package_price, p_amount);
  if v_amount is null or v_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  update public.appointments
  set payment_method = p_method, payment_status = 'PAID', payment_amount = v_amount,
      payment_reference = nullif(left(trim(coalesce(p_reference, '')), 200), '')
  where id = p_id and is_walk_in and payment_status in ('UNPAID', 'REJECTED')
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$$;


create or replace function public.reschedule_appointment(
  p_original_id text, p_scheduled_for timestamptz,
  p_date_label text, p_time_label text, p_notes text default null,
  p_photo_url text default null, p_package_id text default null,
  p_package_name text default null, p_package_price numeric default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_original public.appointments%rowtype;
  v_new public.appointments%rowtype;
  v_changed integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;

  select * into v_original from public.appointments
  where id = p_original_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if v_original.customer_user_id is distinct from v_uid or v_original.is_walk_in then
    raise exception 'NOT_YOUR_BOOKING';
  end if;
  if v_original.status not in ('PENDING', 'ACCEPTED') then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.appointments
  set status = 'CANCELLED', cancelled_by = 'CUSTOMER',
      response_note = coalesce(response_note, 'Rescheduled')
  where id = p_original_id and status = v_original.status;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'INVALID_TRANSITION'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label, notes, photo_url,
    package_id, package_name, package_price, rescheduled_from
  ) values (
    v_original.target_type, v_original.target_id, v_original.target_owner_user_id,
    v_original.target_name, v_original.target_avatar,
    v_uid, v_original.customer_name, v_original.customer_avatar,
    p_scheduled_for, p_date_label, p_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    p_package_id, p_package_name, p_package_price, p_original_id
  ) returning * into v_new;

  return v_new;
end
$$;

create or replace function public.sweep_my_appointments()
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  update public.appointments
  set status = 'CANCELLED', cancelled_by = 'SYSTEM',
      response_note = coalesce(response_note, 'business not responded')
  where status = 'PENDING' and scheduled_for <= now()
    and (customer_user_id = v_uid or target_owner_user_id = v_uid
      or (target_type = 'BUSINESS' and public.has_business_access(target_id, v_uid)));

  update public.appointments set status = 'COMPLETED'
  where status = 'ACCEPTED' and scheduled_for <= now()
    and (customer_user_id = v_uid or target_owner_user_id = v_uid
      or (target_type = 'BUSINESS' and public.has_business_access(target_id, v_uid)));
end
$$;

create or replace function public.booked_slots(p_target_id text)
returns table (scheduled_for timestamptz)
language sql stable security definer
set search_path = public
as $$
  select a.scheduled_for
  from public.appointments a
  where a.target_id = p_target_id and a.status in ('PENDING', 'ACCEPTED');
$$;

-- Trigger functions need a fixed path but must never be direct API endpoints.
-- Excludes extension-owned functions (e.g. PostGIS trigger helpers like
-- postgis_cache_bbox) — we don't own those and ALTER/REVOKE on them fails
-- with "must be owner of function", aborting the whole migration.
do $$
declare v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('alter function %s set search_path = public', v_function);
    execute format('revoke execute on function %s from public, anon, authenticated', v_function);
  end loop;
end
$$;

-- Remove anonymous raw-table access from private workflow tables. Signed-in
-- compatibility grants remain until the later CONTRACT migration.
revoke all on table public.agreements from public, anon;
revoke all on table public.appointments from public, anon;
revoke all on table public.payments from public, anon;
revoke all on table public.proposal_counters from public, anon;
revoke all on table public.business_access_sessions from public, anon;
revoke all on table public.business_login_credentials from public, anon;
revoke all on table public.business_login_attempts from public, anon;

-- Protected delegated-login helpers.
revoke execute on function public.has_business_access(text, text) from public, anon, authenticated;
revoke execute on function public.set_business_login(text, text, text, boolean, integer, boolean) from public, anon;
revoke execute on function public.business_login_attempt(text, text) from public, anon;
revoke execute on function public.grant_business_access(text, text) from public, anon;
revoke execute on function public.decide_business_session(uuid, boolean) from public, anon;
revoke execute on function public.revoke_business_session(uuid) from public, anon;
revoke execute on function public.close_expired_business_sessions() from public, anon;
revoke execute on function public.my_business_access_status(text) from public, anon;
revoke execute on function public.my_delegated_businesses() from public, anon;

grant execute on function public.set_business_login(text, text, text, boolean, integer, boolean) to authenticated;
grant execute on function public.business_login_attempt(text, text) to authenticated;
grant execute on function public.grant_business_access(text, text) to authenticated;
grant execute on function public.decide_business_session(uuid, boolean) to authenticated;
grant execute on function public.revoke_business_session(uuid) to authenticated;
grant execute on function public.close_expired_business_sessions() to authenticated;
grant execute on function public.my_business_access_status(text) to authenticated;
grant execute on function public.my_delegated_businesses() to authenticated;

-- Protected proposal/agreement APIs.
revoke execute on function public.proposal_submit_counter(text, numeric, text) from public, anon;
revoke execute on function public.accept_proposal(text) from public, anon;
revoke execute on function public.accept_proposal_counter(text, text) from public, anon;
revoke execute on function public.accept_proposal_at_price(text, integer) from public, anon;
revoke execute on function public.agreement_confirm(text) from public, anon;
revoke execute on function public.notify_agreement_confirm(text, text) from public, anon;
revoke execute on function public.agreement_start_work(text) from public, anon;
revoke execute on function public.agreement_submit_review(text) from public, anon;
revoke execute on function public.agreement_complete(text) from public, anon;
revoke execute on function public.agreement_dispute(text, text) from public, anon;
revoke execute on function public.agreement_claim_payment(text, text, integer, text) from public, anon;
revoke execute on function public.agreement_confirm_payment(text) from public, anon;
revoke execute on function public.agreement_reject_payment(text) from public, anon;
revoke execute on function public.agreement_update_live_status(text, text, double precision, double precision) from public, anon;
revoke execute on function public.agreement_create_tracking_token(text) from public, anon;
revoke execute on function public.admin_resolve_agreement_dispute(text, text) from public, anon;

grant execute on function public.proposal_submit_counter(text, numeric, text) to authenticated;
grant execute on function public.accept_proposal(text) to authenticated;
grant execute on function public.accept_proposal_counter(text, text) to authenticated;
grant execute on function public.accept_proposal_at_price(text, integer) to authenticated;
grant execute on function public.agreement_confirm(text) to authenticated;
grant execute on function public.notify_agreement_confirm(text, text) to authenticated;
grant execute on function public.agreement_start_work(text) to authenticated;
grant execute on function public.agreement_submit_review(text) to authenticated;
grant execute on function public.agreement_complete(text) to authenticated;
grant execute on function public.agreement_dispute(text, text) to authenticated;
grant execute on function public.agreement_claim_payment(text, text, integer, text) to authenticated;
grant execute on function public.agreement_confirm_payment(text) to authenticated;
grant execute on function public.agreement_reject_payment(text) to authenticated;
grant execute on function public.agreement_update_live_status(text, text, double precision, double precision) to authenticated;
grant execute on function public.agreement_create_tracking_token(text) to authenticated;
grant execute on function public.admin_resolve_agreement_dispute(text, text) to authenticated;

-- Protected appointment APIs; booked_slots remains intentionally public so a
-- signed-out visitor can inspect availability without appointment PII.
revoke execute on function public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric) from public, anon;
revoke execute on function public.appointment_create_walk_in(text, text, text, text, timestamptz, text, text, text, text, numeric) from public, anon;
revoke execute on function public.appointment_transition(text, text, text) from public, anon;
revoke execute on function public.appointment_claim_payment(text, text, numeric, text) from public, anon;
revoke execute on function public.appointment_confirm_payment(text) from public, anon;
revoke execute on function public.appointment_reject_payment(text) from public, anon;
revoke execute on function public.appointment_record_walk_in_payment(text, text, numeric, text) from public, anon;
revoke execute on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) from public, anon;
revoke execute on function public.sweep_my_appointments() from public, anon;
revoke execute on function public.booked_slots(text) from public;

grant execute on function public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric) to authenticated;
grant execute on function public.appointment_create_walk_in(text, text, text, text, timestamptz, text, text, text, text, numeric) to authenticated;
grant execute on function public.appointment_transition(text, text, text) to authenticated;
grant execute on function public.appointment_claim_payment(text, text, numeric, text) to authenticated;
grant execute on function public.appointment_confirm_payment(text) to authenticated;
grant execute on function public.appointment_reject_payment(text) to authenticated;
grant execute on function public.appointment_record_walk_in_payment(text, text, numeric, text) to authenticated;
grant execute on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) to authenticated;
grant execute on function public.sweep_my_appointments() to authenticated;
grant execute on function public.booked_slots(text) to anon, authenticated;