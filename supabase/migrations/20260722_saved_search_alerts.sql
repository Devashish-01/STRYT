-- Flow 8 (Discovery) — saved search alerts: notify a user when a new nearby
-- business/provider matches a search they saved. "Recently-viewed rail" needs
-- no schema (client-side, from already-tracked view history).
-- Run manually in Supabase SQL editor.

create table if not exists public.saved_searches (
  id         text primary key default ('ss_' || replace(gen_random_uuid()::text, '-', '')),
  user_id    text not null references public.users(id) on delete cascade,
  query      text not null,
  lat        double precision,
  lng        double precision,
  radius_km  numeric not null default 5,
  created_at timestamptz default now(),
  unique (user_id, query)
);
create index if not exists saved_searches_user_idx on public.saved_searches (user_id);

alter table public.saved_searches enable row level security;

do $$ begin
  create policy saved_searches_all on public.saved_searches
    for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- Plain-SQL haversine (km) — mirrors the client-side formula used throughout
-- the app; no PostGIS dependency assumed.
create or replace function public.haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371 * 2 * asin(sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2 +
    cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
  ));
$$;

-- Separate functions per table (not one shared function) since businesses use
-- `name` while providers use `display_name` for their listing title.

create or replace function public.notify_saved_search_matches_business()
returns trigger as $$
declare
  s record;
begin
  if new.status is distinct from 'ACTIVE' then
    return new;
  end if;

  for s in
    select * from public.saved_searches
    where new.name ilike '%' || query || '%'
       or coalesce(new.sub_category, '') ilike '%' || query || '%'
       or coalesce(new.category_name, '') ilike '%' || query || '%'
  loop
    if s.lat is not null and s.lng is not null and new.lat is not null and new.lng is not null
       and public.haversine_km(s.lat, s.lng, new.lat, new.lng) > s.radius_km then
      continue;
    end if;

    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      s.user_id,
      'SAVED_SEARCH_MATCH',
      'New match for "' || s.query || '"',
      new.name || ' just joined nearby',
      '/business/' || new.id
    );
  end loop;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_saved_search_business on public.businesses;
create trigger trg_notify_saved_search_business
  after insert or update of status on public.businesses
  for each row execute function public.notify_saved_search_matches_business();

create or replace function public.notify_saved_search_matches_provider()
returns trigger as $$
declare
  s record;
begin
  if new.status is distinct from 'ACTIVE' then
    return new;
  end if;

  for s in
    select * from public.saved_searches
    where new.display_name ilike '%' || query || '%'
       or coalesce(new.sub_category, '') ilike '%' || query || '%'
       or coalesce(new.category_name, '') ilike '%' || query || '%'
  loop
    if s.lat is not null and s.lng is not null and new.lat is not null and new.lng is not null
       and public.haversine_km(s.lat, s.lng, new.lat, new.lng) > s.radius_km then
      continue;
    end if;

    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      s.user_id,
      'SAVED_SEARCH_MATCH',
      'New match for "' || s.query || '"',
      new.display_name || ' just joined nearby',
      '/provider/' || new.id
    );
  end loop;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_saved_search_provider on public.providers;
create trigger trg_notify_saved_search_provider
  after insert or update of status on public.providers
  for each row execute function public.notify_saved_search_matches_provider();
