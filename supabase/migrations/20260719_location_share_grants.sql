-- 20260719 — consent-gated exact-location sharing for everyone.
-- Exact coordinates are private by default. To see someone's precise location
-- you request it; they approve. A per-identity global toggle (location_public,
-- default OFF) can open it to everyone without asking. Businesses/providers can
-- flip that on so customers can navigate to them; customers keep it off.
-- Map DISCOVERY (proximity search / approximate pins) is unaffected — this only
-- gates the reveal of precise lat/lng on a profile or in a deal.

-- Global "anyone can see my exact location" toggle, default private.
alter table if exists public.users      add column if not exists location_public boolean default false;
alter table if exists public.businesses add column if not exists location_public boolean default false;
alter table if exists public.providers  add column if not exists location_public boolean default false;

-- ── Grant table ─────────────────────────────────────────────────────────
create table if not exists public.location_share_grants (
  id                text primary key default ('lsg_' || replace(gen_random_uuid()::text, '-', '')),
  owner_user_id     text not null references public.users(id) on delete cascade,
  requester_user_id text not null references public.users(id) on delete cascade,
  status            text not null default 'PENDING',  -- PENDING | APPROVED | DENIED
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (owner_user_id, requester_user_id)
);
create index if not exists lsg_owner_idx     on public.location_share_grants (owner_user_id, status);
create index if not exists lsg_requester_idx on public.location_share_grants (requester_user_id, status);

alter table public.location_share_grants enable row level security;

do $$ begin
  -- Either party can read the grant (owner to manage, requester to see status).
  create policy lsg_read on public.location_share_grants
    for select using (
      owner_user_id = auth.uid()::text or requester_user_id = auth.uid()::text
    );
  -- A requester can create only their own PENDING request.
  create policy lsg_insert on public.location_share_grants
    for insert with check (
      requester_user_id = auth.uid()::text and status = 'PENDING'
    );
  -- Only the owner can approve/deny.
  create policy lsg_update on public.location_share_grants
    for update using (owner_user_id = auth.uid()::text)
    with check (owner_user_id = auth.uid()::text);
  -- Either party can withdraw/revoke.
  create policy lsg_delete on public.location_share_grants
    for delete using (
      owner_user_id = auth.uid()::text or requester_user_id = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

-- Realtime so an owner sees incoming requests / a requester sees approval live.
do $$ begin
  alter publication supabase_realtime add table public.location_share_grants;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ── RPCs ────────────────────────────────────────────────────────────────

-- Requester asks an owner for their exact location. Idempotent: re-requesting
-- while PENDING/APPROVED is a no-op; a prior DENIED flips back to PENDING.
-- Notifies the owner.
create or replace function public.request_location_share(p_owner text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid  text := auth.uid()::text;
  v_name text;
begin
  if v_uid is null or v_uid = p_owner then return; end if;

  insert into public.location_share_grants (owner_user_id, requester_user_id, status)
  values (p_owner, v_uid, 'PENDING')
  on conflict (owner_user_id, requester_user_id) do update
    set status = case when location_share_grants.status = 'APPROVED' then 'APPROVED' else 'PENDING' end,
        updated_at = now();

  select name into v_name from public.users where id = v_uid;
  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    p_owner, 'LOCATION_REQUEST',
    'Location request',
    coalesce(v_name, 'Someone') || ' wants to see your exact location',
    '/settings'
  );
end $$;
grant execute on function public.request_location_share(text) to authenticated;

-- Owner approves or denies a requester. Notifies the requester on approval.
create or replace function public.respond_location_share(p_requester text, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then return; end if;

  update public.location_share_grants
    set status = case when p_approve then 'APPROVED' else 'DENIED' end,
        updated_at = now()
  where owner_user_id = v_uid and requester_user_id = p_requester;

  if p_approve then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      p_requester, 'LOCATION_APPROVED',
      'Location shared',
      'Your location request was approved',
      '/u/' || v_uid
    );
  end if;
end $$;
grant execute on function public.respond_location_share(text, boolean) to authenticated;

-- Reveal exact coords only when allowed: self, admin, owner's global toggle,
-- or an APPROVED grant. Empty result otherwise.
create or replace function public.get_shared_location(p_target text)
returns table (lat double precision, lng double precision)
language plpgsql security definer stable set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
begin
  return query
    select u.lat, u.lng
    from public.users u
    where u.id = p_target
      and (
        u.id = v_uid
        or exists (select 1 from public.users a where a.id = v_uid and 'admin' = any(a.roles))
        or coalesce(u.location_public, false)
        or exists (
          select 1 from public.location_share_grants g
          where g.owner_user_id = p_target
            and g.requester_user_id = v_uid
            and g.status = 'APPROVED'
        )
      );
end $$;
grant execute on function public.get_shared_location(text) to authenticated;
