-- ============================================================
-- 20260824 — "Places to Visit": staff-curated points of interest (mountains,
-- treks, sports venues, tourist spots) shown on the Map. Regular users can
-- submit a request to add one, which starts PENDING and needs admin approval
-- before it's publicly visible — same pattern businesses already use.
--
-- Reuses: entity_status enum, public.sync_geom() trigger (already generic
-- off lat/lng/geom on any table), and the admin-only-status-change trigger
-- pattern from enforce_business_location_freeze (20260844) so a submitter
-- can't self-approve their own place by just UPDATE-ing status.
-- ============================================================

create table if not exists public.places (
  id                    text primary key default ('pl_' || replace(gen_random_uuid()::text, '-', '')),
  submitted_by_user_id  text not null references public.users(id),
  name                  text not null,
  category              text not null check (category in ('MOUNTAIN','TREK','SPORTS_VENUE','TOURIST_SPOT','OTHER')),
  description           text,
  address_line1         text,
  city                  text,
  lat                   double precision,
  lng                   double precision,
  geom                  geography(Point, 4326),
  cover_image           text,
  gallery               text[] not null default '{}',
  status                entity_status not null default 'PENDING',
  rejection_reason      text,
  created_at            timestamptz not null default now()
);

create index if not exists places_geom_idx on public.places using gist (geom);
create index if not exists places_status_pending_idx on public.places (status) where status = 'PENDING';
create index if not exists places_submitted_by_idx on public.places (submitted_by_user_id);

drop trigger if exists places_geom on public.places;
create trigger places_geom before insert or update on public.places
  for each row execute function public.sync_geom();

alter table public.places enable row level security;

-- Public sees ACTIVE; the submitter sees their own row regardless of status
-- (so they can track their own pending/rejected submission); admin sees all.
create policy select_places on public.places for select
  using (status = 'ACTIVE' or submitted_by_user_id = (auth.uid())::text or public.is_admin());

-- Anyone signed in can submit, but it's forced to PENDING unless the caller
-- is an admin — that's what lets an admin's own create flow go straight to
-- ACTIVE through the exact same form/insert path, no separate code path.
create policy insert_places on public.places for insert
  with check (
    submitted_by_user_id = (auth.uid())::text
    and (status = 'PENDING' or public.is_admin())
  );

-- The submitter may edit their own row's content (to fix and effectively
-- resubmit); admin may edit anything.
create policy update_places_owner on public.places for update
  using (submitted_by_user_id = (auth.uid())::text)
  with check (submitted_by_user_id = (auth.uid())::text);
create policy update_places_admin on public.places for update
  using (public.is_admin()) with check (public.is_admin());

-- Belt-and-suspenders: without this, update_places_owner above would let a
-- submitter UPDATE their own row's status straight to ACTIVE, self-approving
-- their own place. Mirrors enforce_business_location_freeze exactly.
create or replace function public.enforce_places_status_freeze()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if auth.role() is distinct from 'service_role' and not public.is_admin() then
      raise exception 'Only an admin can change a place''s review status';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_enforce_places_status_freeze on public.places;
create trigger trg_enforce_places_status_freeze
  before update on public.places
  for each row execute function public.enforce_places_status_freeze();
