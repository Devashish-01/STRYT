-- ============================================================
-- STRYT — Launch Hardening migration
-- Fixes the launch blockers from LAUNCH_BLOCKERS.md. Idempotent;
-- safe to re-run. Apply AFTER schema.sql + rls.sql + migration_writes.sql
-- (and the other migration_r* files). This is the LAST migration to run.
--
-- Covers:
--   P0-1  owner-scoped RLS on agreements
--   P0-2  conversations/messages tables + participant-scoped RLS
--   P0-3  agreement_status enum: add DEPOSIT_PAID / IN_PROGRESS / REVIEW
--   P0-5  payments table + RLS (escrow, version-controlled)
--   P1-3  accept_proposal() atomic RPC
--   P2-4  tracking made safe via get_tracking() RPC (agreements stay locked)
--   P1-2  push_subscriptions RLS
--   P3-3  widen rating_avg precision
-- ============================================================

-- ── P0-3 · Extend agreement_status enum ─────────────────────────────────────
-- The app progresses agreements through these states; the original enum lacked
-- them, so startWork/markDepositPaid/submitForReview threw at the DB.
-- NOTE: ADD VALUE cannot be *used* in the same transaction it's created in.
-- These values are only referenced by app code later, so this is safe.
alter type agreement_status add value if not exists 'AGREED';
alter type agreement_status add value if not exists 'DEPOSIT_PAID';
alter type agreement_status add value if not exists 'IN_PROGRESS';
alter type agreement_status add value if not exists 'REVIEW';

-- ── Agreement columns the app writes (idempotent; may already exist) ─────────
alter table public.agreements add column if not exists dispute_reason text;
alter table public.agreements add column if not exists live_status    text;
alter table public.agreements add column if not exists provider_lat   double precision;
alter table public.agreements add column if not exists provider_lng   double precision;
alter table public.agreements add column if not exists tracking_token text;
alter table public.agreements add column if not exists scheduled_for  text;

-- ============================================================
-- P0-1 · Owner-scoped RLS on agreements
-- Replaces the permissive "any authenticated user can write" starter policy
-- (rls.sql) that migration_writes.sql never tightened. Only the requester or
-- responder may read/update their own agreement; no blanket delete; inserts
-- happen via the SECURITY DEFINER accept_proposal() RPC below.
-- ============================================================
alter table public.agreements enable row level security;

do $$ begin
  drop policy if exists write_agreements on public.agreements;
  drop policy if exists read_agreements  on public.agreements;
exception when undefined_object then null; end $$;

do $$ begin
  create policy read_agreements on public.agreements for select
    using (auth.uid()::text in (requester_user_id, responder_user_id));
  create policy upd_agreements on public.agreements for update
    using     (auth.uid()::text in (requester_user_id, responder_user_id))
    with check (auth.uid()::text in (requester_user_id, responder_user_id));
exception when duplicate_object then null; end $$;

-- ============================================================
-- P0-2 · Chat: conversations + messages tables and RLS
-- These were created out-of-band and had NO RLS in version control. Without
-- participant-scoped RLS, the public anon key could read every private message.
-- CREATE IF NOT EXISTS is a no-op where they already exist; the RLS below is
-- the important part.
-- ============================================================
create table if not exists public.conversations (
  id                   text primary key default ('cv_' || replace(gen_random_uuid()::text, '-', '')),
  participant_a        text not null references public.users(id),
  participant_b        text not null references public.users(id),
  last_message_at      timestamptz default now(),
  last_message_preview text,
  has_unread_a         boolean default false,
  has_unread_b         boolean default false,
  subject_type         text,
  subject_id           text,
  subject_name         text,
  subject_avatar       text,
  subject_owner_id     text,
  created_at           timestamptz default now()
);

create table if not exists public.messages (
  id              text primary key default ('msg_' || replace(gen_random_uuid()::text, '-', '')),
  conversation_id text not null references public.conversations(id) on delete cascade,
  sender_id       text not null references public.users(id),
  body            text not null,
  created_at      timestamptz default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id);

alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- A user may only see/insert/update conversations they are part of.
do $$ begin
  create policy conv_select on public.conversations for select
    using (auth.uid()::text in (participant_a, participant_b));
  create policy conv_insert on public.conversations for insert
    with check (auth.uid()::text in (participant_a, participant_b));
  create policy conv_update on public.conversations for update
    using     (auth.uid()::text in (participant_a, participant_b))
    with check (auth.uid()::text in (participant_a, participant_b));
exception when duplicate_object then null; end $$;

-- A user may read messages in conversations they belong to, and may only
-- insert messages authored by themselves into those conversations.
do $$ begin
  create policy msg_select on public.messages for select
    using (exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and auth.uid()::text in (c.participant_a, c.participant_b)
    ));
  create policy msg_insert on public.messages for insert
    with check (
      sender_id = auth.uid()::text
      and exists (
        select 1 from public.conversations c
        where c.id = conversation_id
          and auth.uid()::text in (c.participant_a, c.participant_b)
      )
    );
exception when duplicate_object then null; end $$;

-- Realtime for the chat thread (no-op if already added).
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when others then null; end $$;

-- ============================================================
-- P0-5 · payments table + RLS (escrow record, version-controlled)
-- Writes happen server-side (edge function / service role). Participants may
-- READ their payment rows; no client-side insert/update policy is granted, so
-- escrow state cannot be tampered with from the browser.
-- ============================================================
create table if not exists public.payments (
  id                  text primary key default ('pay_' || replace(gen_random_uuid()::text, '-', '')),
  agreement_id        text references public.agreements(id) on delete cascade,
  payer_user_id       text references public.users(id),
  amount              int not null,
  currency            text default 'INR',
  razorpay_order_id   text,
  razorpay_payment_id text,
  status              text default 'CREATED',   -- CREATED|PAID|FAILED|REFUNDED
  escrow_status       text default 'NONE',      -- NONE|HELD|RELEASED
  created_at          timestamptz default now()
);
create index if not exists payments_agreement_idx on public.payments (agreement_id);

alter table public.payments enable row level security;
do $$ begin
  create policy read_payments on public.payments for select
    using (exists (
      select 1 from public.agreements a
      where a.id = agreement_id
        and auth.uid()::text in (a.requester_user_id, a.responder_user_id)
    ));
exception when duplicate_object then null; end $$;

-- ============================================================
-- P1-2 · push_subscriptions RLS (a user owns their own subscriptions)
-- ============================================================
create table if not exists public.push_subscriptions (
  user_id    text not null references public.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text,
  auth       text,
  created_at timestamptz default now(),
  primary key (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
do $$ begin
  create policy own_push on public.push_subscriptions for all
    using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- ============================================================
-- P1-3 · accept_proposal() — atomic, owner-checked
-- Replaces the 4 separate client writes (no transaction) that could corrupt
-- deal state on partial failure. SECURITY DEFINER so it bypasses RLS, with the
-- ownership check enforced inside.
-- ============================================================
create or replace function public.accept_proposal(p_proposal_id text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid   text := auth.uid()::text;
  v_prop  public.proposals%rowtype;
  v_req   public.requests%rowtype;
  v_agid  text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_prop from public.proposals where id = p_proposal_id;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_req from public.requests where id = v_prop.request_id;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  -- Only the request owner may accept a proposal on it.
  if v_req.requester_user_id is distinct from v_uid then
    raise exception 'NOT_REQUEST_OWNER';
  end if;

  -- Don't let an already-progressed request be re-accepted.
  if v_req.status not in ('OPEN', 'AGREED') then
    raise exception 'REQUEST_NOT_OPEN';
  end if;

  update public.proposals set status = 'ACCEPTED' where id = p_proposal_id;

  insert into public.agreements (
    request_id, request_title, proposal_id, requester_user_id, responder_user_id,
    agreed_price, terms, requester_confirmed, responder_confirmed, payment_mode, status
  ) values (
    v_req.id, v_req.title, p_proposal_id, v_req.requester_user_id, v_prop.responder_user_id,
    v_prop.price, coalesce(v_prop.message, ''), false, false, 'OFFLINE', 'PENDING'
  ) returning id into v_agid;

  update public.requests set status = 'IN_PROGRESS' where id = v_req.id;

  update public.proposals set status = 'REJECTED'
    where request_id = v_req.id and id <> p_proposal_id and status = 'SUBMITTED';

  return v_agid;
end $$;

grant execute on function public.accept_proposal(text) to authenticated;

-- ============================================================
-- P2-4 · get_tracking() — safe public read for the share link
-- The public /track/:token page must work for logged-out visitors, but the
-- agreements table is (correctly) locked to participants. This function returns
-- ONLY the safe live-location fields for a valid, non-expired token — so the
-- agreements table never has to be opened to anon.
-- ============================================================
create or replace function public.get_tracking(p_token text)
returns table (
  agreement_id   text,
  provider_lat   double precision,
  provider_lng   double precision,
  live_status    text,
  provider_name  text,
  provider_avatar text
)
language sql security definer set search_path = public as $$
  select a.id, a.provider_lat, a.provider_lng, a.live_status, u.name, u.avatar
  from public.tracking_tokens t
  join public.agreements a on a.id = t.agreement_id
  left join public.users u on u.id = a.responder_user_id
  where t.id = p_token
    and t.expires_at > now();
$$;

grant execute on function public.get_tracking(text) to anon, authenticated;

-- ============================================================
-- P3-3 · Widen rating_avg so averaging can't overflow numeric(2,1)
-- ============================================================
alter table public.users      alter column rating_avg type numeric(3,2);
alter table public.businesses  alter column rating_avg type numeric(3,2);
alter table public.providers   alter column rating_avg type numeric(3,2);

-- ============================================================
-- Verification helper — run after applying to confirm the tightened policies
-- exist. Should return rows for: upd_agreements, conv_select, msg_select.
--   select policyname, tablename from pg_policies
--   where policyname in ('upd_agreements','conv_select','msg_select','read_payments');
-- ============================================================
