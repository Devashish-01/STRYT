-- ============================================================
-- 20260826 — Bulk Booking & Bulk Buying
--
-- Three things, in dependency order:
--   1. SECURITY FIX: proposals were world-readable (read_proposals qual = true).
--      Anyone with the shipped publishable key could GET /rest/v1/proposals
--      and read every competing bid's price. Scoped here to requester/
--      responder/admin, mirroring the already-correct read_agreements policy.
--      Aggregate counts stay public via a trigger-maintained proposal_count
--      column, so "3 providers quoted" still works without exposing prices.
--   2. Pooling with QUANTITY — request_me_toos was a binary join, but a group
--      buy needs "I want 2 of these".
--   3. bulk_deals (business wholesale offers) + group_buy_tokens (the QR claim
--      passes issued when an initiator closes a deal).
--
-- Every write to tokens goes through a SECURITY DEFINER RPC — there is no
-- insert/update RLS policy on group_buy_tokens at all, so redemption can't be
-- forged or double-spent from a raw client call.
-- ============================================================

-- ── 1. Proposal privacy ─────────────────────────────────────

alter table public.requests
  add column if not exists proposal_count integer not null default 0;

-- Backfill before the policy tightens, so existing rows don't read as 0.
update public.requests r
   set proposal_count = (select count(*) from public.proposals p where p.request_id = r.id)
 where proposal_count = 0;

create or replace function public.sync_request_proposal_count()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.requests set proposal_count = proposal_count + 1 where id = new.request_id;
  elsif tg_op = 'DELETE' then
    update public.requests set proposal_count = greatest(0, proposal_count - 1) where id = old.request_id;
  end if;
  return null;
end
$$;

drop trigger if exists trg_sync_request_proposal_count on public.proposals;
create trigger trg_sync_request_proposal_count
  after insert or delete on public.proposals
  for each row execute function public.sync_request_proposal_count();

-- THE fix. A competing bidder can no longer read rival prices.
drop policy if exists read_proposals on public.proposals;
create policy read_proposals on public.proposals for select
  using (
    responder_user_id = (auth.uid())::text
    or exists (
      select 1 from public.requests r
       where r.id = proposals.request_id
         and r.requester_user_id = (auth.uid())::text
    )
    or public.is_admin()
  );

-- ── 2. Pooling with quantity ────────────────────────────────

alter table public.request_me_toos
  add column if not exists quantity integer not null default 1 check (quantity > 0),
  add column if not exists notes text;

alter table public.requests
  add column if not exists bulk_price_per_unit numeric(10,2),
  add column if not exists fulfillment_type text
    check (fulfillment_type is null or fulfillment_type in
      ('ON_SITE_CAMP','CLINIC_VISIT','STORE_PICKUP','CENTRAL_DROP','DOORSTEP')),
  add column if not exists group_agreement_id text;

-- Joining a pool is a pledge, not a like — it carries a quantity and has to
-- keep the denormalized me_too_count honest, so it goes through an RPC
-- rather than a raw upsert.
create or replace function public.group_buy_join(
  p_request_id text, p_quantity integer default 1, p_notes text default null
) returns public.requests
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_req public.requests%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;

  select * into v_req from public.requests where id = p_request_id;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'OPEN' then raise exception 'REQUEST_CLOSED'; end if;

  insert into public.request_me_toos (request_id, user_id, quantity, notes)
  values (p_request_id, v_uid, p_quantity, nullif(left(trim(coalesce(p_notes,'')), 300), ''))
  on conflict (request_id, user_id) do update
    set quantity = excluded.quantity, notes = excluded.notes;

  update public.requests
     set me_too_count = (select count(*) from public.request_me_toos where request_id = p_request_id)
   where id = p_request_id
  returning * into v_req;

  return v_req;
end
$$;

revoke execute on function public.group_buy_join(text, integer, text) from public, anon;
grant execute on function public.group_buy_join(text, integer, text) to authenticated;

create or replace function public.group_buy_leave(p_request_id text)
returns public.requests
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_req public.requests%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  delete from public.request_me_toos where request_id = p_request_id and user_id = v_uid;
  update public.requests
     set me_too_count = (select count(*) from public.request_me_toos where request_id = p_request_id)
   where id = p_request_id
  returning * into v_req;
  return v_req;
end
$$;

revoke execute on function public.group_buy_leave(text) from public, anon;
grant execute on function public.group_buy_leave(text) to authenticated;

-- ── 3. Business bulk deals ──────────────────────────────────

create table if not exists public.bulk_deals (
  id                text primary key default ('bd_' || replace(gen_random_uuid()::text, '-', '')),
  business_id       text not null,
  owner_user_id     text not null references public.users(id),
  catalog_item_id   text,
  title             text not null,
  description       text,
  image             text,
  regular_price     numeric(10,2) not null check (regular_price > 0),
  moq               integer not null default 1 check (moq >= 1),
  -- [{ "minQty": 10, "unitPrice": 650 }, ...] — validated app-side; kept as
  -- jsonb so tiers can be edited without a migration per pricing change.
  tiers             jsonb not null default '[]'::jsonb,
  available_quota   integer check (available_quota is null or available_quota >= 0),
  status            entity_status not null default 'ACTIVE',
  created_at        timestamptz not null default now()
);

create index if not exists bulk_deals_business_idx on public.bulk_deals (business_id);
create index if not exists bulk_deals_active_idx on public.bulk_deals (status) where status = 'ACTIVE';

alter table public.bulk_deals enable row level security;

-- A bulk deal is a public shopfront listing, same as a catalog item.
create policy read_bulk_deals on public.bulk_deals for select
  using (status = 'ACTIVE' or owner_user_id = (auth.uid())::text or public.is_admin());

create policy write_bulk_deals on public.bulk_deals for all
  using (owner_user_id = (auth.uid())::text or public.is_admin())
  with check (owner_user_id = (auth.uid())::text or public.is_admin());

-- ── 4. Group buy claim tokens (QR passes) ───────────────────

create table if not exists public.group_buy_tokens (
  id             text primary key default ('gt_' || replace(gen_random_uuid()::text, '-', '')),
  token_code     text not null unique,
  agreement_id   text not null,
  request_id     text not null,
  holder_user_id text not null references public.users(id),
  issuer_user_id text not null references public.users(id),
  business_id    text,
  quantity       integer not null default 1 check (quantity > 0),
  unit_price     numeric(10,2),
  item_label     text,
  status         text not null default 'ISSUED' check (status in ('ISSUED','REDEEMED','EXPIRED')),
  redeemed_at    timestamptz,
  redeemed_by    text,
  valid_until    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists group_buy_tokens_holder_idx on public.group_buy_tokens (holder_user_id);
create index if not exists group_buy_tokens_agreement_idx on public.group_buy_tokens (agreement_id);
create unique index if not exists group_buy_tokens_one_per_holder
  on public.group_buy_tokens (agreement_id, holder_user_id);

alter table public.group_buy_tokens enable row level security;

-- Read-only policy. No insert/update policy anywhere on purpose — issuance and
-- redemption are RPC-only (see below), so a pass can't be minted or marked
-- redeemed by a raw PostgREST call.
-- Deliberately does NOT call has_business_scope: anon has no EXECUTE grant on
-- it (revoked on purpose by the 20260881/20260882 hardening migrations), and
-- referencing it here makes a signed-out read raise "permission denied for
-- function" rather than returning zero rows — Postgres evaluates it regardless
-- of an auth.uid() guard. Merchant-side reads go through
-- group_buy_tokens_for_agreement() below instead, which is SECURITY DEFINER
-- and does its own scope check.
create policy read_group_buy_tokens on public.group_buy_tokens for select
  using (
    holder_user_id = (auth.uid())::text
    or issuer_user_id = (auth.uid())::text
    or public.is_admin()
  );

-- Issued in bulk by the INITIATOR when they accept a proposal: one pass per
-- pooled member, each carrying that member's own pledged quantity.
create or replace function public.group_buy_issue_tokens(
  p_request_id text, p_agreement_id text, p_business_id text default null,
  p_unit_price numeric default null, p_valid_until timestamptz default null
) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_req public.requests%rowtype;
  v_agr public.agreements%rowtype;
  v_issued integer := 0;
  m record;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_req from public.requests where id = p_request_id;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.requester_user_id <> v_uid then raise exception 'NOT_INITIATOR'; end if;

  select * into v_agr from public.agreements where id = p_agreement_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  -- The initiator is a participant too, so union their own pledge in. coalesce
  -- to 1 covers an initiator who never explicitly "joined" their own pool.
  for m in
    select user_id, quantity from public.request_me_toos where request_id = p_request_id
    union
    select v_req.requester_user_id, coalesce(
      (select quantity from public.request_me_toos
        where request_id = p_request_id and user_id = v_req.requester_user_id), 1)
  loop
    begin
      insert into public.group_buy_tokens (
        token_code, agreement_id, request_id, holder_user_id, issuer_user_id,
        business_id, quantity, unit_price, item_label, valid_until
      ) values (
        'STRYT-' || upper(substring(md5(gen_random_uuid()::text) from 1 for 4))
                 || '-' || upper(substring(md5(gen_random_uuid()::text) from 1 for 4)),
        p_agreement_id, p_request_id, m.user_id, v_uid,
        p_business_id, coalesce(m.quantity, 1),
        coalesce(p_unit_price, v_agr.agreed_price), v_req.title, p_valid_until
      );
      v_issued := v_issued + 1;
    exception when unique_violation then
      -- Already has a pass for this agreement — re-running is a no-op, which
      -- makes this safe to retry if the caller lost the response.
      null;
    end;
  end loop;

  update public.requests set group_agreement_id = p_agreement_id where id = p_request_id;

  insert into public.notifications (user_id, type, title, body, deep_link)
  select mt.user_id, 'GROUP_BUY_UNLOCKED', 'Group buy confirmed',
         'Your claim pass for "' || v_req.title || '" is ready',
         '/request/' || p_request_id
    from public.request_me_toos mt
   where mt.request_id = p_request_id and mt.user_id <> v_uid;

  return v_issued;
end
$$;

revoke execute on function public.group_buy_issue_tokens(text, text, text, numeric, timestamptz) from public, anon;
grant execute on function public.group_buy_issue_tokens(text, text, text, numeric, timestamptz) to authenticated;

-- Merchant-side scan. `for update` + status guard makes a double scan
-- impossible: the second one raises ALREADY_REDEEMED rather than silently
-- handing over goods twice.
create or replace function public.group_buy_token_redeem(p_token_code text)
returns public.group_buy_tokens
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_tok public.group_buy_tokens%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_tok from public.group_buy_tokens
   where token_code = upper(trim(p_token_code)) for update;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;

  v_allowed := v_tok.issuer_user_id = v_uid
    or (v_tok.business_id is not null
        and public.has_business_scope(v_tok.business_id, v_uid, 'appointments'))
    or exists (
      select 1 from public.agreements a
       where a.id = v_tok.agreement_id and a.responder_user_id = v_uid
    );
  if not v_allowed then raise exception 'NOT_AUTHORIZED_TO_REDEEM'; end if;

  if v_tok.status = 'REDEEMED' then raise exception 'ALREADY_REDEEMED'; end if;
  if v_tok.status = 'EXPIRED' then raise exception 'TOKEN_EXPIRED'; end if;
  if v_tok.valid_until is not null and v_tok.valid_until < now() then
    raise exception 'TOKEN_EXPIRED';
  end if;

  update public.group_buy_tokens
     set status = 'REDEEMED', redeemed_at = now(), redeemed_by = v_uid
   where id = v_tok.id and status = 'ISSUED'
  returning * into v_tok;
  if not found then raise exception 'ALREADY_REDEEMED'; end if;

  return v_tok;
end
$$;

revoke execute on function public.group_buy_token_redeem(text) from public, anon;
grant execute on function public.group_buy_token_redeem(text) to authenticated;

-- Merchant-side roster read. This exists as an RPC rather than an RLS branch
-- because the scope check needs has_business_scope, which anon can't execute
-- (see the read policy comment above).
create or replace function public.group_buy_tokens_for_agreement(p_agreement_id text)
returns setof public.group_buy_tokens
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select
    exists (select 1 from public.agreements a
             where a.id = p_agreement_id
               and (a.responder_user_id = v_uid or a.requester_user_id = v_uid))
    or exists (select 1 from public.group_buy_tokens t
                where t.agreement_id = p_agreement_id
                  and t.business_id is not null
                  and public.has_business_scope(t.business_id, v_uid, 'appointments'))
    or public.is_admin()
  into v_allowed;

  if not v_allowed then raise exception 'NOT_AUTHORIZED'; end if;

  return query select * from public.group_buy_tokens
                where agreement_id = p_agreement_id
                order by created_at desc;
end
$$;

revoke execute on function public.group_buy_tokens_for_agreement(text) from public, anon;
grant execute on function public.group_buy_tokens_for_agreement(text) to authenticated;

-- Live "87 of 100 fulfilled" counter for the merchant console.
create or replace function public.group_buy_redemption_stats(p_agreement_id text)
returns table (total integer, redeemed integer, pending integer)
language sql security definer
set search_path = public
as $$
  select count(*)::integer,
         count(*) filter (where status = 'REDEEMED')::integer,
         count(*) filter (where status = 'ISSUED')::integer
    from public.group_buy_tokens
   where agreement_id = p_agreement_id;
$$;

revoke execute on function public.group_buy_redemption_stats(text) from public, anon;
grant execute on function public.group_buy_redemption_stats(text) to authenticated;
