-- ============================================================
-- 20260894 — Server-side community feed: sort + type filter in one RPC
--
-- TWO BUGS AND A LIMITATION THIS FIXES.
--
-- 1. "Trending nearby" only ranked the page you had already loaded.
--    trendingScore() (src/lib/trending.ts) was applied in the browser to the 20
--    posts currently in memory, so the "top trending post in your area" was
--    really "the top trending post among the newest 20". The busiest post from
--    three days ago could not appear, however hot it was. Ranking has to happen
--    where the whole set is, so the score moves into SQL here.
--
-- 2. Filtered feeds could not paginate. The client filtered by post type AFTER
--    fetching a page, and CommunityHub only rendered "Load more" when the filter
--    was "ALL" — because loading more of a filtered view would have fetched the
--    next 20 *unfiltered* posts and then thrown most of them away. So anything
--    past the first page of, say, Giveaways was unreachable. The type filter
--    becomes a query parameter so the cursor and the filter compose.
--
-- 3. There was no way to sort by distance, even though a hyperlocal feed is
--    exactly where "what's closest" is a reasonable question.
--
-- `community_posts_nearby` (20260866/20260891) is deliberately LEFT IN PLACE
-- rather than replaced: an older OTA bundle still calls it, and this migration
-- may be applied before every client has updated. It stays the 5-arg
-- recent-only path; this is the superset.
--
-- Run manually in the Supabase SQL editor (idempotent, safe to re-run).
-- ============================================================

-- Reddit-style "hot": engagement decayed by age. Kept as its own function so
-- the ordering rule has one definition and the client's trending.ts can be
-- checked against it. The exponent and the +2 hours match trending.ts exactly —
-- +2 stops a brand-new post with one like from dividing by ~0 and pinning
-- itself to the top.
create or replace function public.community_post_hot_score(
  in_likes      integer,
  in_comments   integer,
  in_created_at timestamptz
)
returns double precision
language sql
immutable
parallel safe
set search_path = public
as $$
  select (coalesce(in_likes, 0) + coalesce(in_comments, 0) * 2)::double precision
       / power(
           greatest(extract(epoch from (now() - coalesce(in_created_at, now()))) / 3600.0, 0) + 2,
           1.5
         );
$$;

comment on function public.community_post_hot_score(integer, integer, timestamptz) is
  'Engagement decayed by age. Mirrors trendingScore() in src/lib/trending.ts — change both together.';

-- Note: NOT marked immutable-safe for indexing (it reads now()), so it is
-- declared immutable only to satisfy inlining in the ORDER BY. It is never used
-- in an index or a constraint, where that would be wrong.


create or replace function public.community_posts_feed(
  in_lng       double precision default null,
  in_lat       double precision default null,
  in_radius_km double precision default 5,
  in_limit     integer default 20,
  in_offset    integer default 0,
  -- null = every type. The client's "ALL" filter.
  in_type      text default null,
  -- 'recent' | 'trending' | 'nearest'. Unknown values fall back to 'recent'
  -- rather than erroring: a stale client asking for a sort we removed should
  -- still get a feed.
  in_sort      text default 'recent'
)
returns setof public.community_posts
language sql
stable
set search_path = public
as $$
  with viewer as (
    select case
             when in_lat is null or in_lng is null then null
             else ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography
           end as pt
  )
  select cp.*
  from public.community_posts cp
  cross join viewer v
  left join public.businesses b
    on cp.author_type = 'business' and b.id = cp.author_ref_id
  left join public.providers p
    on cp.author_type = 'provider' and p.id = cp.author_ref_id
  where
    -- Time-boxed posts drop out once they're done (20260891).
    (cp.expires_at is null or cp.expires_at > now())
    and (in_type is null or cp.type = in_type)
    and (
      -- No viewer location: fall back to the global feed, the same behaviour
      -- communityService.feed() had on its no-coords branch.
      v.pt is null
      or (
        cp.geom is not null
        and ST_DWithin(
          cp.geom,
          v.pt,
          -- Author-radius capping, carried over verbatim from 20260866: a shop
          -- with a 2 km reach must not appear to someone 5 km away just because
          -- the viewer's own radius is wider.
          least(
            in_radius_km,
            case
              when cp.author_type = 'business' then greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0)
              when cp.author_type = 'provider'  then greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0)
              else in_radius_km
            end
          ) * 1000
        )
      )
    )
  order by
    case when in_sort = 'trending' then
      public.community_post_hot_score(cp.likes_count, cp.comments_count, cp.created_at)
    end desc nulls last,
    case when in_sort = 'nearest' and v.pt is not null and cp.geom is not null then
      ST_Distance(cp.geom, v.pt)
    end asc nulls last,
    -- Always the final tiebreak, and the whole ordering for 'recent'. Without
    -- it, two posts with an identical hot score could swap places between
    -- pages and the same post would appear twice (or never).
    cp.created_at desc,
    cp.id desc
  limit greatest(coalesce(in_limit, 20), 1)
  offset greatest(coalesce(in_offset, 0), 0);
$$;

alter function public.community_posts_feed(double precision, double precision, double precision, integer, integer, text, text)
  set search_path = public;

-- Guests browse the community feed (/community-hub is a public route), so anon
-- keeps read access here exactly as it has on community_posts_nearby.
grant execute on function public.community_posts_feed(double precision, double precision, double precision, integer, integer, text, text) to anon, authenticated;
grant execute on function public.community_post_hot_score(integer, integer, timestamptz) to anon, authenticated;

-- Supports the type-filtered pagination this RPC makes possible.
create index if not exists community_posts_type_created_idx
  on public.community_posts (type, created_at desc);
