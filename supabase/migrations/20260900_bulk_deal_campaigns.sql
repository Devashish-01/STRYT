-- ============================================================
-- 20260900 — Business bulk-buying campaigns
--
-- Replaces bulk_deals' instant-order model (bulk_deal_order() wrote an
-- appointment immediately per purchase, no pooling) with a campaign model:
-- customers PLEDGE a quantity and pay a flat deposit to join, the campaign
-- closes once it hits its target quantity (paid pledges only), an optional
-- deadline, or the owner manually closes it — whichever comes first — and
-- only THEN does the whole batch get fulfilled together via claim passes,
-- mirroring Group Buy's token model but without any of Group Buy's
-- proposal/agreement coupling (a business has no one to negotiate with over
-- its own listing).
--
-- Deliberately NOT reusing group_buy_tokens/request_me_toos: those back
-- real in-flight group buys today, with delicate uniqueness/idempotency
-- guarantees. Parallel tables here, identical shape, zero risk to what
-- already works. Deliberately NOT widening the shared entity_status enum
-- (businesses/providers/places all use it) — campaign lifecycle lives in
-- new nullable columns instead (closed_at/close_outcome), derived states,
-- not a parallel status vocabulary bolted onto a shared type.
--
-- bulk_deal_order()/bulk_deal_quote() (the old instant-purchase RPCs) are
-- left in place, untouched, in this migration — the client still calls them
-- until the pledge-flow ships (a later phase). Do not drop them here.
-- ============================================================

-- ── 1) bulk_deals: campaign fields ──────────────────────────────────────

alter table public.bulk_deals add column if not exists deposit_amount numeric(10,2);
alter table public.bulk_deals drop constraint if exists bulk_deals_deposit_amount_sane;
alter table public.bulk_deals add constraint bulk_deals_deposit_amount_sane
  check (deposit_amount is null or (deposit_amount > 0 and deposit_amount <= regular_price));

alter table public.bulk_deals add column if not exists closes_at timestamptz;
alter table public.bulk_deals add column if not exists pledged_quantity integer not null default 0;
alter table public.bulk_deals add column if not exists closed_at timestamptz;
alter table public.bulk_deals add column if not exists close_outcome text;
alter table public.bulk_deals drop constraint if exists bulk_deals_close_outcome_valid;
alter table public.bulk_deals add constraint bulk_deals_close_outcome_valid
  check (close_outcome is null or close_outcome in ('FULFILLED', 'REFUNDED'));

-- Existing ACTIVE deals from the old instant-order model land with
-- deposit_amount null ("no deposit required") rather than being blocked or
-- broken — an owner can set one from the console once the new fields are
-- visible there.

comment on column public.bulk_deals.closed_at is
  'null = still collecting pledges. Non-null + close_outcome null = closed under target, awaiting the owner''s decision (extend/fulfil/refund). Non-null + close_outcome set = resolved.';

-- ── 2) bulk_deal_pledges — replaces the old instant bulk_deal_order() insert ──

create table if not exists public.bulk_deal_pledges (
  id                uuid primary key default gen_random_uuid(),
  deal_id           text not null references public.bulk_deals(id) on delete cascade,
  user_id           text not null references public.users(id) on delete cascade,
  quantity          integer not null default 1 check (quantity > 0),
  notes             text,
  delivery_address  text,
  deposit_method    text check (deposit_method in ('UPI','CASH')),
  deposit_status    text not null default 'UNPAID' check (deposit_status in ('UNPAID','PENDING_CONFIRM','PAID','REJECTED')),
  deposit_amount    numeric(10,2),
  deposit_reference text,
  created_at        timestamptz not null default now(),
  unique (deal_id, user_id)
);

create index if not exists bulk_deal_pledges_deal_idx on public.bulk_deal_pledges (deal_id);
create index if not exists bulk_deal_pledges_user_idx on public.bulk_deal_pledges (user_id);

alter table public.bulk_deal_pledges enable row level security;

-- Read: the pledger themself, the deal's owner/team (has_business_access),
-- or admin. Every write goes through a SECURITY DEFINER RPC below — no
-- direct insert/update/delete policy at all, so pledged_quantity can never
-- drift out of sync with the rows backing it (a raw delete would skip the
-- recompute a leave-RPC does).
create policy read_bulk_deal_pledges on public.bulk_deal_pledges for select
  using (
    user_id = (auth.uid())::text
    or exists (
      select 1 from public.bulk_deals d
       where d.id = deal_id and public.has_business_access(d.business_id, (auth.uid())::text)
    )
    or public.is_admin()
  );

-- ── 3) bulk_deal_tokens — claim passes, mirrors group_buy_tokens' shape ──

create table if not exists public.bulk_deal_tokens (
  id             text primary key default ('bdt_' || replace(gen_random_uuid()::text, '-', '')),
  token_code     text not null unique,
  deal_id        text not null references public.bulk_deals(id) on delete cascade,
  holder_user_id text not null references public.users(id),
  issuer_user_id text not null references public.users(id),
  business_id    text references public.businesses(id),
  quantity       integer not null default 1 check (quantity > 0),
  unit_price     numeric(10,2),
  item_label     text,
  status         text not null default 'ISSUED' check (status in ('ISSUED','REDEEMED','EXPIRED')),
  redeemed_at    timestamptz,
  redeemed_by    text,
  valid_until    timestamptz,
  pickup_pin     text,
  created_at     timestamptz not null default now()
);

create unique index if not exists bulk_deal_tokens_one_per_holder on public.bulk_deal_tokens (deal_id, holder_user_id);
create index if not exists bulk_deal_tokens_business_idx on public.bulk_deal_tokens (business_id);

alter table public.bulk_deal_tokens enable row level security;

-- No insert/update policy — minted and redeemed only via the RPCs below,
-- same posture as group_buy_tokens (a pass can't be forged or double-spent
-- via raw PostgREST).
create policy read_bulk_deal_tokens on public.bulk_deal_tokens for select
  using (
    holder_user_id = (auth.uid())::text
    or issuer_user_id = (auth.uid())::text
    or (business_id is not null and public.has_business_access(business_id, (auth.uid())::text))
    or public.is_admin()
  );

-- ── 4) Pledging RPCs — mirror group_buy_join/group_buy_leave ────────────

create or replace function public.bulk_deal_pledge_join(
  p_deal_id text, p_quantity integer default 1, p_notes text default null,
  p_delivery_address text default null
) returns public.bulk_deals
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.status <> 'ACTIVE' then raise exception 'DEAL_NOT_ACTIVE'; end if;
  if v_deal.closed_at is not null then raise exception 'DEAL_CLOSED'; end if;
  if v_deal.owner_user_id = v_uid then raise exception 'OWNER_CANNOT_PLEDGE'; end if;

  if v_deal.fulfillment_type = 'DOORSTEP'
     and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;

  insert into public.bulk_deal_pledges (deal_id, user_id, quantity, notes, delivery_address)
  values (p_deal_id, v_uid, p_quantity,
          nullif(left(trim(coalesce(p_notes,'')), 300), ''),
          nullif(left(trim(coalesce(p_delivery_address,'')), 400), ''))
  on conflict (deal_id, user_id) do update
    set quantity = excluded.quantity,
        notes = excluded.notes,
        delivery_address = excluded.delivery_address;

  update public.bulk_deals
     set pledged_quantity = (select coalesce(sum(quantity), 0) from public.bulk_deal_pledges where deal_id = p_deal_id)
   where id = p_deal_id
  returning * into v_deal;

  return v_deal;
end
$$;

revoke execute on function public.bulk_deal_pledge_join(text, integer, text, text) from public, anon;
grant execute on function public.bulk_deal_pledge_join(text, integer, text, text) to authenticated;

create or replace function public.bulk_deal_pledge_leave(p_deal_id text)
returns public.bulk_deals
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  delete from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = v_uid;

  update public.bulk_deals
     set pledged_quantity = (select coalesce(sum(quantity), 0) from public.bulk_deal_pledges where deal_id = p_deal_id)
   where id = p_deal_id
  returning * into v_deal;

  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  return v_deal;
end
$$;

revoke execute on function public.bulk_deal_pledge_leave(text) from public, anon;
grant execute on function public.bulk_deal_pledge_leave(text) to authenticated;

-- ── 5) Deposit claim/confirm/reject — mirrors agreement_claim_payment trio,
--       scoped per pledge row instead of per agreement (a deal has many
--       pledgers, an agreement has one payer) ─────────────────────────────

create or replace function public.bulk_deal_pledge_claim_deposit(
  p_deal_id text, p_method text, p_reference text default null
) returns public.bulk_deal_pledges
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledge public.bulk_deal_pledges%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI','CASH') then raise exception 'INVALID_METHOD'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.closed_at is not null then raise exception 'DEAL_CLOSED'; end if;

  select * into v_pledge from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = v_uid for update;
  if not found then raise exception 'NOT_PLEDGED'; end if;
  if v_pledge.deposit_status not in ('UNPAID','REJECTED') then raise exception 'INVALID_TRANSITION'; end if;

  -- Server-authoritative amount, same reasoning as agreement_claim_payment:
  -- the database decides what's owed, a client-sent figure is only ever a
  -- hint. No deposit configured on the deal ("no deposit required") means
  -- there is nothing to claim.
  if v_deal.deposit_amount is null then raise exception 'NO_DEPOSIT_REQUIRED'; end if;

  update public.bulk_deal_pledges
     set deposit_method = p_method,
         deposit_status = 'PENDING_CONFIRM',
         deposit_amount = v_deal.deposit_amount,
         deposit_reference = nullif(left(trim(coalesce(p_reference,'')), 200), '')
   where deal_id = p_deal_id and user_id = v_uid
  returning * into v_pledge;

  return v_pledge;
end
$$;

revoke execute on function public.bulk_deal_pledge_claim_deposit(text, text, text) from public, anon;
grant execute on function public.bulk_deal_pledge_claim_deposit(text, text, text) to authenticated;

create or replace function public.bulk_deal_pledge_confirm_deposit(p_deal_id text, p_pledger_user_id text)
returns public.bulk_deal_pledges
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledge public.bulk_deal_pledges%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if not public.has_business_access(v_deal.business_id, v_uid) then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_pledge from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = p_pledger_user_id for update;
  if not found then raise exception 'PLEDGE_NOT_FOUND'; end if;
  if v_pledge.deposit_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.bulk_deal_pledges set deposit_status = 'PAID'
   where deal_id = p_deal_id and user_id = p_pledger_user_id
  returning * into v_pledge;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (p_pledger_user_id, 'BULK_DEAL_DEPOSIT_CONFIRMED', 'Deposit confirmed',
          'Your deposit for "' || v_deal.title || '" was confirmed.', '/business/' || v_deal.business_id);

  -- The UPDATE above already fired trg_check_bulk_deal_target (it watches
  -- deposit_status) — this is exactly the moment a pledge starts counting
  -- toward MOQ, and the trigger, not this function, is what checks it.

  return v_pledge;
end
$$;

revoke execute on function public.bulk_deal_pledge_confirm_deposit(text, text) from public, anon;
grant execute on function public.bulk_deal_pledge_confirm_deposit(text, text) to authenticated;

create or replace function public.bulk_deal_pledge_reject_deposit(p_deal_id text, p_pledger_user_id text)
returns public.bulk_deal_pledges
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledge public.bulk_deal_pledges%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if not public.has_business_access(v_deal.business_id, v_uid) then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_pledge from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = p_pledger_user_id for update;
  if not found then raise exception 'PLEDGE_NOT_FOUND'; end if;
  if v_pledge.deposit_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.bulk_deal_pledges set deposit_status = 'REJECTED'
   where deal_id = p_deal_id and user_id = p_pledger_user_id
  returning * into v_pledge;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (p_pledger_user_id, 'BULK_DEAL_DEPOSIT_REJECTED', 'Couldn''t verify your deposit',
          'The business could not verify your deposit for "' || v_deal.title || '". You can try again.', '/business/' || v_deal.business_id);

  return v_pledge;
end
$$;

revoke execute on function public.bulk_deal_pledge_reject_deposit(text, text) from public, anon;
grant execute on function public.bulk_deal_pledge_reject_deposit(text, text) to authenticated;

-- ── 6) Closing — one internal function, three triggers converge on it ──

-- Not exposed directly (no grant) — called only from bulk_deal_close() below
-- (after an ownership check) and from the auto-close trigger/sweep (which
-- are themselves SECURITY DEFINER, so they carry their own authority; this
-- function does no auth check of its own, callers are responsible for it).
create or replace function public._bulk_deal_close_internal(p_deal_id text, p_trigger text, p_outcome text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_deal public.bulk_deals%rowtype;
  v_paid_qty integer;
  v_unit_price numeric;
  v_tier jsonb;
  m record;
begin
  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.closed_at is not null then return; end if; -- already closed — idempotent no-op, safe to retry

  select coalesce(sum(quantity), 0) into v_paid_qty
    from public.bulk_deal_pledges
   where deal_id = p_deal_id and deposit_status = 'PAID';

  -- Automatic paths (p_outcome null going in) decide their own outcome from
  -- whether the paid pool actually met MOQ; a manual close always carries an
  -- explicit outcome from the owner instead.
  if p_outcome is null and v_paid_qty >= v_deal.moq then
    p_outcome := 'FULFILLED';
  end if;

  update public.bulk_deals set closed_at = now(), close_outcome = p_outcome where id = p_deal_id;

  if p_outcome = 'FULFILLED' then
    -- One shared price for the whole batch, resolved from the pool's total
    -- paid quantity — the point of pooling is the GROUP unlocking a tier
    -- together, not each pledger's own quantity individually.
    select t into v_tier
      from jsonb_array_elements(coalesce(v_deal.tiers, '[]'::jsonb)) as t
     where (t->>'minQty')::numeric <= v_paid_qty
     order by (t->>'minQty')::numeric desc
     limit 1;
    v_unit_price := coalesce((v_tier->>'unitPrice')::numeric, v_deal.regular_price);

    for m in
      select user_id, quantity from public.bulk_deal_pledges
       where deal_id = p_deal_id and deposit_status = 'PAID'
    loop
      insert into public.bulk_deal_tokens (
        token_code, deal_id, holder_user_id, issuer_user_id, business_id,
        quantity, unit_price, item_label
      ) values (
        'STRYT-D-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)),
        p_deal_id, m.user_id, v_deal.owner_user_id, v_deal.business_id,
        m.quantity, v_unit_price, v_deal.title
      )
      on conflict (deal_id, holder_user_id) do nothing; -- retry-safe, same as group_buy_issue_tokens

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

  -- p_outcome still null here means: closed (deadline/manual), under target,
  -- no decision made yet — PENDING_DECISION is this exact state, derived
  -- (closed_at set, close_outcome null), not a stored value.
  end if;
end
$$;

-- Public, owner-facing entry point.
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
  if v_deal.owner_user_id <> v_uid then raise exception 'NOT_OWNER'; end if;
  if v_deal.closed_at is not null then raise exception 'DEAL_ALREADY_CLOSED'; end if;
  if p_outcome is not null and p_outcome not in ('FULFILLED','REFUNDED') then raise exception 'INVALID_OUTCOME'; end if;

  perform public._bulk_deal_close_internal(p_deal_id, 'MANUAL', p_outcome);

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  return v_deal;
end
$$;

revoke execute on function public.bulk_deal_close(text, text) from public, anon;
grant execute on function public.bulk_deal_close(text, text) to authenticated;

-- Reopen a campaign that closed under target without a fulfil/refund
-- decision — the "Extend" action. Also usable proactively on a still-open
-- campaign to just push the deadline further out.
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
  if v_deal.owner_user_id <> v_uid then raise exception 'NOT_OWNER'; end if;
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
end
$$;

revoke execute on function public.bulk_deal_extend(text, timestamptz) from public, anon;
grant execute on function public.bulk_deal_extend(text, timestamptz) to authenticated;

-- ── 7) Auto-close, path 1: target hit (paid pledges only) ──────────────
-- The one genuinely novel piece — no other trigger in this codebase closes
-- anything based on a running total crossing a threshold.

create or replace function public.check_bulk_deal_target_and_close(p_deal_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_deal public.bulk_deals%rowtype;
  v_paid_qty integer;
begin
  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found or v_deal.closed_at is not null then return; end if;

  select coalesce(sum(quantity), 0) into v_paid_qty
    from public.bulk_deal_pledges
   where deal_id = p_deal_id and deposit_status = 'PAID';

  if v_paid_qty >= v_deal.moq then
    perform public._bulk_deal_close_internal(p_deal_id, 'TARGET_HIT', 'FULFILLED');
  end if;
end
$$;

create or replace function public.trg_bulk_deal_pledge_check_target()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.check_bulk_deal_target_and_close(coalesce(new.deal_id, old.deal_id));
  return coalesce(new, old);
end
$$;

drop trigger if exists trg_check_bulk_deal_target on public.bulk_deal_pledges;
create trigger trg_check_bulk_deal_target
  after insert or update of quantity, deposit_status on public.bulk_deal_pledges
  for each row execute function public.trg_bulk_deal_pledge_check_target();

-- ── 8) Auto-close, path 2: deadline sweep — mirrors close_expired_requests ──

create or replace function public.close_expired_bulk_deals()
returns void
language plpgsql security definer
set search_path = public
as $$
declare d record;
begin
  for d in
    select id from public.bulk_deals
     where closed_at is null and closes_at is not null and closes_at < now()
  loop
    perform public._bulk_deal_close_internal(d.id, 'DEADLINE', null);
  end loop;
end
$$;

revoke execute on function public.close_expired_bulk_deals() from public, anon;
grant execute on function public.close_expired_bulk_deals() to authenticated;

-- ── 9) Redemption — mirrors group_buy_token_redeem / _tokens_for_agreement /
--       _redemption_stats verbatim, s/agreement/deal/ ─────────────────────

create or replace function public.bulk_deal_token_redeem(p_token_code text)
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

  if not (
    v_token.issuer_user_id = v_uid
    or (v_token.business_id is not null and public.has_business_scope(v_token.business_id, v_uid, 'appointments'))
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
end
$$;

revoke execute on function public.bulk_deal_token_redeem(text) from public, anon;
grant execute on function public.bulk_deal_token_redeem(text) to authenticated;

create or replace function public.bulk_deal_tokens_for_deal(p_deal_id text)
returns setof public.bulk_deal_tokens
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
  if not (public.has_business_access(v_deal.business_id, v_uid) or public.is_admin()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query select * from public.bulk_deal_tokens where deal_id = p_deal_id order by created_at desc;
end
$$;

revoke execute on function public.bulk_deal_tokens_for_deal(text) from public, anon;
grant execute on function public.bulk_deal_tokens_for_deal(text) to authenticated;

create or replace function public.bulk_deal_redemption_stats(p_deal_id text)
returns table(total integer, redeemed integer, pending integer)
language sql security definer
set search_path = public
as $$
  select count(*)::int,
         count(*) filter (where status = 'REDEEMED')::int,
         count(*) filter (where status = 'ISSUED')::int
    from public.bulk_deal_tokens
   where deal_id = p_deal_id;
$$;

revoke execute on function public.bulk_deal_redemption_stats(text) from public, anon;
grant execute on function public.bulk_deal_redemption_stats(text) to authenticated;
