-- ============================================================
-- 20260891 — Community posts: universal media + per-type fields
--
-- Two problems this fixes.
--
-- 1. PHOTOS WERE TYPE-GATED. `community_posts` has a single `image` column and
--    the composer only offered a picker for LOST_FOUND and GIVEAWAY. A found
--    dog and a free sofa could have a photo; a road-closure alert or a shoutout
--    to the corner bakery could not — even though those are exactly the posts a
--    photo makes credible. `media text[]` makes photos universal and multiple.
--    `image` is KEPT and kept populated with media[1] so every existing render
--    path (feed card, profile Posts tabs, notification thumbnails) works
--    untouched, and so a rollback can't blank out existing posts.
--
-- 2. EVERY TYPE SHARED ONE SHAPE. A poll had no closing time, an alert had no
--    severity and no end, a lost-item post had nowhere to say where it was last
--    seen. Authors were pushing all of that into the free-text body, where it
--    can't be rendered, sorted, or notified on. Each type now gets the few
--    fields it actually needs.
--
-- Time-boxing (`expires_at`) is the other half of #2: an alert is news, not an
-- archive. Posts that age out on their own are lower-stakes to write, and the
-- feed stops showing last week's water cut as if it were current.
--
-- All columns are nullable / defaulted, so this migration is additive and safe
-- to apply ahead of the client that writes them.
--
-- Run manually in the Supabase SQL editor (this repo's established pattern).
-- ============================================================

-- ---------- 1. Columns ----------

alter table public.community_posts
  add column if not exists media        text[] not null default '{}'::text[],
  add column if not exists image_alt    text,
  add column if not exists poll_ends_at timestamptz,
  add column if not exists severity     text,
  add column if not exists expires_at   timestamptz,
  add column if not exists last_seen    text,
  add column if not exists reward       text,
  add column if not exists pickup_note  text,
  add column if not exists tagged_listing jsonb;

comment on column public.community_posts.media is
  'All photos on the post. image = media[1] for backward compatibility with older read paths.';
comment on column public.community_posts.image_alt is
  'Author-written description of the photo, read by screen readers.';
comment on column public.community_posts.expires_at is
  'When the post stops surfacing in the feed. Set for time-boxed types (ALERT, POLL); null = evergreen.';
comment on column public.community_posts.tagged_listing is
  'A business/provider the AUTHOR tagged: {listingType,listingId,name}. Distinct from `recommendations`, which is what other neighbors added.';

-- Severity is only meaningful on an ALERT, and only these three values.
-- NOT VALID: validate against new rows only. Existing rows all have
-- severity = null, which passes anyway, but this keeps the ALTER from taking a
-- long lock on a large table.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'community_posts_severity_check'
      and conrelid = 'public.community_posts'::regclass
  ) then
    alter table public.community_posts
      add constraint community_posts_severity_check
      check (severity is null or severity in ('INFO', 'WARNING', 'URGENT'))
      not valid;
  end if;
end
$$;

-- Cap media server-side too. The client caps at 4, but the client is not a
-- security boundary and an unbounded array is an unbounded row.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'community_posts_media_len_check'
      and conrelid = 'public.community_posts'::regclass
  ) then
    alter table public.community_posts
      add constraint community_posts_media_len_check
      check (coalesce(array_length(media, 1), 0) <= 4)
      not valid;
  end if;
end
$$;

-- The feed filters on expiry on every read, so it needs an index. Partial:
-- only time-boxed posts have a non-null expires_at, and those are the minority.
create index if not exists community_posts_expires_at_idx
  on public.community_posts (expires_at)
  where expires_at is not null;

-- Poll close time, for the "poll ended" sweep in a later migration.
create index if not exists community_posts_poll_ends_at_idx
  on public.community_posts (poll_ends_at)
  where poll_ends_at is not null;

-- ---------- 2. Backfill media from image ----------
-- Existing posts keep their single photo AND gain it in the new column, so the
-- new read path doesn't show them as photoless.
update public.community_posts
   set media = array[image]
 where image is not null
   and image <> ''
   and coalesce(array_length(media, 1), 0) = 0;

-- ---------- 3. Feed: hide expired posts ----------
-- Same 5-param signature as 20260866, so this is a plain CREATE OR REPLACE.
-- The only change is the expiry predicate — the author-radius capping from
-- 20260866 is preserved verbatim.
create or replace function public.community_posts_nearby(
  in_lng          double precision,
  in_lat          double precision,
  in_radius_km    double precision default 10,
  in_limit        integer default 50,
  in_offset       integer default 0
)
returns setof public.community_posts
language sql
stable
set search_path = public
as $$
  select cp.*
  from public.community_posts cp
  left join public.businesses b
    on cp.author_type = 'business' and b.id = cp.author_ref_id
  left join public.providers p
    on cp.author_type = 'provider' and p.id = cp.author_ref_id
  where cp.geom is not null
    and (cp.expires_at is null or cp.expires_at > now())
    and ST_DWithin(
      cp.geom,
      ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
      least(
        in_radius_km,
        case
          when cp.author_type = 'business' then greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0)
          when cp.author_type = 'provider'  then greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0)
          else in_radius_km
        end
      ) * 1000
    )
  order by cp.created_at desc
  limit in_limit offset in_offset;
$$;

alter function public.community_posts_nearby(double precision, double precision, double precision, integer, integer) set search_path = public;
grant execute on function public.community_posts_nearby(double precision, double precision, double precision, integer, integer) to anon, authenticated;

-- ---------- 4. Author edit RPC covers the new media fields ----------
-- Without this, editing a post through community_post_update would rewrite
-- `image` and leave `media` holding the old photo — the card (media) and the
-- edit sheet (image) would then disagree about what the post shows.
--
-- The old 4-arg signature is DROPPED rather than left alongside a defaulted
-- 6-arg version: two overloads both callable with 4 positional arguments is
-- ambiguous, and PostgREST would have to guess. Callers use named arguments
-- (p_id/p_title/...), so adding the two new optional params is source-compatible.
drop function if exists public.community_post_update(text, text, text, text);

create or replace function public.community_post_update(
  p_id        text,
  p_title     text,
  p_body      text default null,
  p_image     text default null,
  p_media     text[] default null,
  p_image_alt text default null
) returns public.community_posts
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_post public.community_posts%rowtype;
  v_media text[];
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_post from public.community_posts where id = p_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if v_post.author_user_id is distinct from v_uid then raise exception 'NOT_YOUR_POST'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'TITLE_REQUIRED'; end if;

  -- p_media null = "caller didn't say", so fall back to the single p_image it
  -- did send (that's the pre-media client, still shipping in an older app
  -- build / OTA bundle). An explicitly empty array means "remove the photos".
  v_media := coalesce(
    p_media,
    case when nullif(p_image, '') is null then '{}'::text[] else array[p_image] end
  );
  if coalesce(array_length(v_media, 1), 0) > 4 then
    raise exception 'TOO_MANY_PHOTOS';
  end if;

  update public.community_posts
     set title     = left(trim(p_title), 150),
         body      = nullif(left(trim(coalesce(p_body, '')), 2000), ''),
         media     = v_media,
         -- image stays the first photo so older read paths keep working.
         image     = v_media[1],
         image_alt = nullif(trim(coalesce(p_image_alt, '')), '')
   where id = p_id
   returning * into v_post;

  return v_post;
end
$$;

revoke all on function public.community_post_update(text, text, text, text, text[], text) from public, anon;
grant execute on function public.community_post_update(text, text, text, text, text[], text) to authenticated;
