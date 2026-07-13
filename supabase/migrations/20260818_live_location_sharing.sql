-- 20260818 — Live location sharing (replaces the removed SMS-based SOS).
--
-- A user presses "Share live location"; their live coordinates stream to their
-- pre-set emergency contacts, who watch them on a map card inside their chat
-- with that user, until the sharer turns it off. No SMS, no third parties, no
-- unauthenticated endpoints — the whole thing runs through authenticated-only
-- SECURITY DEFINER RPCs, mirroring the go-live hardening pass (revoke from
-- public+anon, grant execute to authenticated only).
--
-- Standard "WhatsApp Live Location" model: one ACTIVE session per user, coords
-- updated periodically by the device, recipients read via get_live_share().

-- ── Emergency contacts (must be STRYT users — delivery is via chat) ────────
create table if not exists public.emergency_contacts (
  id              text primary key default ('ec_' || replace(gen_random_uuid()::text, '-', '')),
  owner_user_id   text not null references public.users(id) on delete cascade,
  contact_user_id text not null references public.users(id) on delete cascade,
  created_at      timestamptz default now(),
  unique (owner_user_id, contact_user_id)
);
create index if not exists ec_owner_idx on public.emergency_contacts (owner_user_id);
alter table public.emergency_contacts enable row level security;
do $$ begin
  -- Owner fully manages their own contact list; nobody else can read it.
  create policy ec_owner_all on public.emergency_contacts
    for all using (owner_user_id = auth.uid()::text)
    with check (owner_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- ── Live share session — one ACTIVE per sharer ─────────────────────────────
create table if not exists public.live_shares (
  id              text primary key default ('ls_' || replace(gen_random_uuid()::text, '-', '')),
  sharer_user_id  text not null references public.users(id) on delete cascade,
  status          text not null default 'ACTIVE',   -- ACTIVE | ENDED
  lat             double precision,
  lng             double precision,
  accuracy        double precision,
  heading         double precision,
  started_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  ended_at        timestamptz
);
-- At most one ACTIVE session per user.
create unique index if not exists live_shares_one_active
  on public.live_shares (sharer_user_id) where status = 'ACTIVE';
alter table public.live_shares enable row level security;
do $$ begin
  -- The sharer manages their own session. Recipients NEVER select this table
  -- directly — they read coords through get_live_share() so exposure is
  -- controlled in one place.
  create policy ls_owner_all on public.live_shares
    for all using (sharer_user_id = auth.uid()::text)
    with check (sharer_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- ── Recipients of a session (one row per emergency contact) ────────────────
create table if not exists public.live_share_recipients (
  share_id          text not null references public.live_shares(id) on delete cascade,
  recipient_user_id text not null references public.users(id) on delete cascade,
  conversation_id   text,
  message_id        text,
  primary key (share_id, recipient_user_id)
);
create index if not exists lsr_recipient_idx on public.live_share_recipients (recipient_user_id);
alter table public.live_share_recipients enable row level security;
do $$ begin
  -- The recipient, and the sharer of the parent session, may read the link row.
  create policy lsr_read on public.live_share_recipients
    for select using (
      recipient_user_id = auth.uid()::text
      or exists (
        select 1 from public.live_shares s
        where s.id = share_id and s.sharer_user_id = auth.uid()::text
      )
    );
exception when duplicate_object then null; end $$;

-- ── Chat message kind + payload so a LIVE_LOCATION card can live in a thread ─
alter table public.messages add column if not exists kind text default 'TEXT';
alter table public.messages add column if not exists meta jsonb;

-- ── RPCs ───────────────────────────────────────────────────────────────────

-- Start (or resume) sharing. Creates the ACTIVE session if none exists and
-- fans a live-location card + notification out to every emergency contact.
-- Idempotent: if a session is already ACTIVE it just refreshes the coords.
create or replace function public.start_live_share(p_lat double precision, p_lng double precision)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid   text := auth.uid()::text;
  v_share text;
  v_name  text;
  v_pa    text;
  v_pb    text;
  v_conv  text;
  v_msg   text;
  r       record;
begin
  if v_uid is null then return null; end if;

  -- Resume an already-running session — refresh coords, don't re-fan cards.
  select id into v_share from public.live_shares
    where sharer_user_id = v_uid and status = 'ACTIVE';
  if v_share is not null then
    update public.live_shares
      set lat = p_lat, lng = p_lng, updated_at = now()
      where id = v_share;
    return v_share;
  end if;

  insert into public.live_shares (sharer_user_id, lat, lng)
    values (v_uid, p_lat, p_lng)
    returning id into v_share;

  select name into v_name from public.users where id = v_uid;

  for r in
    select contact_user_id from public.emergency_contacts where owner_user_id = v_uid
  loop
    -- get-or-create the 1:1 conversation (participants stored least→greatest).
    v_pa := least(v_uid, r.contact_user_id);
    v_pb := greatest(v_uid, r.contact_user_id);
    select id into v_conv from public.conversations
      where participant_a = v_pa and participant_b = v_pb and subject_id is null
      limit 1;
    if v_conv is null then
      insert into public.conversations (participant_a, participant_b)
        values (v_pa, v_pb) returning id into v_conv;
    end if;

    -- Post the live-location card into the thread.
    insert into public.messages (conversation_id, sender_id, body, kind, meta)
      values (v_conv, v_uid, '📍 Live location', 'LIVE_LOCATION',
              jsonb_build_object('share_id', v_share, 'status', 'ACTIVE'))
      returning id into v_msg;

    update public.conversations set
      last_message_at = now(),
      last_message_preview = '📍 Live location',
      has_unread_a = (v_pa <> v_uid),
      has_unread_b = (v_pb <> v_uid)
      where id = v_conv;

    insert into public.live_share_recipients (share_id, recipient_user_id, conversation_id, message_id)
      values (v_share, r.contact_user_id, v_conv, v_msg);

    -- Notify (→ existing notifications→send-push trigger delivers the push).
    insert into public.notifications (user_id, type, title, body, deep_link)
      values (r.contact_user_id, 'LIVE_LOCATION',
              coalesce(v_name, 'Someone') || ' is sharing live location',
              'Tap to follow their location on the map',
              '/chat/' || v_conv);
  end loop;

  return v_share;
end $$;

-- Device pushes a fresh fix. Only the sharer can move their own session.
create or replace function public.update_live_share(
  p_lat double precision, p_lng double precision,
  p_accuracy double precision default null, p_heading double precision default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then return; end if;
  update public.live_shares
    set lat = p_lat, lng = p_lng, accuracy = p_accuracy, heading = p_heading, updated_at = now()
    where sharer_user_id = v_uid and status = 'ACTIVE';
end $$;

-- Stop sharing. Ends the session and flips every recipient card to ENDED.
create or replace function public.stop_live_share()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid   text := auth.uid()::text;
  v_share text;
  r       record;
begin
  if v_uid is null then return; end if;

  select id into v_share from public.live_shares
    where sharer_user_id = v_uid and status = 'ACTIVE';
  if v_share is null then return; end if;

  update public.live_shares set status = 'ENDED', ended_at = now() where id = v_share;

  for r in select message_id from public.live_share_recipients where share_id = v_share loop
    update public.messages
      set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('status', 'ENDED')
      where id = r.message_id;
  end loop;
end $$;

-- The read path recipients poll. Returns coords ONLY to the sharer or an
-- active recipient of that specific session — empty for anyone else.
create or replace function public.get_live_share(p_share_id text)
returns table (
  lat double precision, lng double precision, status text,
  updated_at timestamptz, sharer_name text, sharer_avatar text)
language plpgsql security definer stable set search_path = public as $$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then return; end if;
  return query
    select s.lat, s.lng, s.status, s.updated_at, u.name, u.avatar
    from public.live_shares s
    join public.users u on u.id = s.sharer_user_id
    where s.id = p_share_id
      and (
        s.sharer_user_id = v_uid
        or exists (
          select 1 from public.live_share_recipients rcp
          where rcp.share_id = s.id and rcp.recipient_user_id = v_uid
        )
      );
end $$;

-- Lock execution to authenticated only (no PUBLIC, no anon) — same posture as
-- 20260816/20260817. The whole app is behind ProtectedLayout, so anon never
-- needs any of these.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.start_live_share(double precision, double precision)',
    'public.update_live_share(double precision, double precision, double precision, double precision)',
    'public.stop_live_share()',
    'public.get_live_share(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- Recipients see their card update live without polling gaps.
do $$ begin
  alter publication supabase_realtime add table public.live_shares;
exception when duplicate_object then null; when undefined_object then null; end $$;
