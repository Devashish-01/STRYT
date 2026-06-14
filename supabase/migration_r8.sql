-- ============================================================
-- NAYA — R8 migration: notifications, bookmarks, follows, lists
-- Run AFTER all previous migrations. Safe to re-run.
-- ============================================================

-- ── 1. NOTIFICATIONS ─────────────────────────────────────────
create table if not exists public.notifications (
  id         text primary key default ('n_' || replace(gen_random_uuid()::text, '-', '')),
  user_id    text not null references public.users(id) on delete cascade,
  type       text not null,   -- NEW_BUSINESS | NEW_PROVIDER | NEARBY_REQUEST | PROPOSAL | AGREEMENT | OFFER | SYSTEM
  title      text not null,
  body       text not null default '',
  deep_link  text not null default '/home',
  is_read    boolean default false,
  created_at timestamptz default now()
);

create index if not exists notif_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

do $$ begin
  -- user sees only their own
  create policy read_notif on public.notifications
    for select using (user_id = auth.uid()::text);
  -- user can mark their own as read
  create policy upd_notif on public.notifications
    for update using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- ── 2. BOOKMARKS ─────────────────────────────────────────────
create table if not exists public.bookmarks (
  id          text primary key default ('bm_' || replace(gen_random_uuid()::text, '-', '')),
  user_id     text not null references public.users(id) on delete cascade,
  target_type text not null,  -- BUSINESS | PROVIDER | REQUEST
  target_id   text not null,
  created_at  timestamptz default now(),
  unique (user_id, target_type, target_id)
);

alter table public.bookmarks enable row level security;

do $$ begin
  create policy read_bm on public.bookmarks
    for select using (user_id = auth.uid()::text);
  create policy ins_bm on public.bookmarks
    for insert with check (user_id = auth.uid()::text);
  create policy del_bm on public.bookmarks
    for delete using (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- ── 3. FOLLOWS ───────────────────────────────────────────────
create table if not exists public.follows (
  id                text primary key default ('f_' || replace(gen_random_uuid()::text, '-', '')),
  follower_user_id  text not null references public.users(id) on delete cascade,
  target_type       text not null,  -- BUSINESS | PROVIDER
  target_id         text not null,
  created_at        timestamptz default now(),
  unique (follower_user_id, target_type, target_id)
);

alter table public.follows enable row level security;

do $$ begin
  create policy read_follows on public.follows
    for select using (follower_user_id = auth.uid()::text);
  create policy ins_follows on public.follows
    for insert with check (follower_user_id = auth.uid()::text);
  create policy del_follows on public.follows
    for delete using (follower_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- ── 4. USER LISTS ────────────────────────────────────────────
create table if not exists public.user_lists (
  id         text primary key default ('sl_' || replace(gen_random_uuid()::text, '-', '')),
  user_id    text not null references public.users(id) on delete cascade,
  name       text not null,
  emoji      text not null default '🌟',
  shared     boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.user_list_items (
  id          text primary key default ('sli_' || replace(gen_random_uuid()::text, '-', '')),
  list_id     text not null references public.user_lists(id) on delete cascade,
  target_type text not null,  -- BUSINESS | PROVIDER | REQUEST
  target_id   text not null,
  created_at  timestamptz default now(),
  unique (list_id, target_type, target_id)
);

alter table public.user_lists      enable row level security;
alter table public.user_list_items enable row level security;

do $$ begin
  create policy read_lists  on public.user_lists for select using (user_id = auth.uid()::text);
  create policy ins_lists   on public.user_lists for insert with check (user_id = auth.uid()::text);
  create policy upd_lists   on public.user_lists for update using (user_id = auth.uid()::text);
  create policy del_lists   on public.user_lists for delete using (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

do $$ begin
  -- items: only accessible if the parent list belongs to the session user
  create policy read_list_items on public.user_list_items
    for select using (
      exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = auth.uid()::text)
    );
  create policy ins_list_items on public.user_list_items
    for insert with check (
      exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = auth.uid()::text)
    );
  create policy del_list_items on public.user_list_items
    for delete using (
      exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = auth.uid()::text)
    );
exception when duplicate_object then null; end $$;

-- ── 5. DB TRIGGERS: auto-create notifications ─────────────────
-- Runs as SECURITY DEFINER so it can insert into notifications
-- for a different user than the one making the write.

-- Trigger A: new proposal → notify the request owner
create or replace function public.notify_on_proposal()
returns trigger as $$
declare
  req_owner text;
  req_title text;
begin
  select requester_user_id, title
    into req_owner, req_title
    from public.requests
   where id = new.request_id;

  -- don't notify if the responder is the requester (self-respond edge case)
  if req_owner is null or req_owner = new.responder_user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    req_owner,
    'PROPOSAL',
    'New proposal on your request',
    'Someone replied to "' || coalesce(req_title, 'your request') || '"',
    '/request/' || new.request_id
  );
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_proposal on public.proposals;
create trigger trg_notify_proposal
  after insert on public.proposals
  for each row execute function public.notify_on_proposal();

-- Trigger B: agreement becomes ACTIVE (both confirmed) → notify both parties
create or replace function public.notify_on_agreement()
returns trigger as $$
begin
  -- only fire when status flips to ACTIVE
  if new.status = 'ACTIVE' and (old.status is null or old.status <> 'ACTIVE') then
    -- notify requester
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      new.requester_user_id,
      'AGREEMENT',
      'Agreement confirmed',
      'Your agreement for "' || coalesce(new.request_title, 'a request') || '" is now active.',
      '/agreement/' || new.id
    );
    -- notify responder (if different)
    if new.responder_user_id <> new.requester_user_id then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (
        new.responder_user_id,
        'AGREEMENT',
        'Agreement confirmed',
        'The agreement for "' || coalesce(new.request_title, 'a request') || '" is active — good luck!',
        '/agreement/' || new.id
      );
    end if;
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_agreement on public.agreements;
create trigger trg_notify_agreement
  after update on public.agreements
  for each row execute function public.notify_on_agreement();
