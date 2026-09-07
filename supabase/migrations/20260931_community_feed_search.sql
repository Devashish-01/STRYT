-- ============================================================
-- 20260931 — COMMUNITY_POSTS_GAP_LOG #8: the community feed had no way to
-- search. Global Search covers businesses, providers and categories only, so
-- "did anyone post about the water cut" meant scrolling until you found it or
-- gave up. Type filters and sorts existed; keywords didn't.
--
-- Full-text rather than ILIKE, and 'simple' rather than 'english':
--   · 'english' stems and drops stopwords against an English dictionary, which
--     is wrong for the Hinglish/Marathi-in-Latin-script that real posts here
--     are written in — it would quietly discard tokens it thinks are noise.
--   · 'simple' just lowercases and splits, which is the honest behaviour for
--     mixed-script text.
-- Prefix matching (:* on every token) is what makes 'electric' find
-- 'electrician'; without it, 'simple' would demand whole words and a search box
-- that only matches complete words feels broken.
--
-- community_search_tsquery scrubs everything that isn't alphanumeric or space
-- BEFORE the ::tsquery cast, so a query containing tsquery's own operators
-- (& | ! : *) is treated as the text somebody typed, never as syntax.
--
-- The GIN index expression is character-for-character the one in the WHERE
-- clause below — they have to match exactly or the planner won't use it.
-- ============================================================

create or replace function public.community_search_tsquery(p_q text)
returns tsquery
language sql
immutable
set search_path = public
as $$
  select (
    select string_agg(tok || ':*', ' & ')::tsquery
    from unnest(
      string_to_array(
        regexp_replace(lower(trim(coalesce(p_q, ''))), '[^[:alnum:][:space:]]', ' ', 'g'),
        ' '
      )
    ) as tok
    where tok <> ''
  );
$$;

grant execute on function public.community_search_tsquery(text) to anon, authenticated;

create index if not exists community_posts_search_idx
  on public.community_posts
  using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(author_name, '')
    )
  );

-- Adding a parameter means dropping and recreating; in_query defaults to null,
-- so every existing 5-, 6- and 7-argument call keeps resolving here.
drop function if exists public.community_posts_feed(double precision, double precision, double precision, integer, integer, text, text);

create function public.community_posts_feed(
  in_lng double precision default null,
  in_lat double precision default null,
  in_radius_km double precision default 5,
  in_limit integer default 20,
  in_offset integer default 0,
  in_type text default null,
  in_sort text default 'recent',
  in_query text default null
)
returns setof public.community_posts
language sql
stable
set search_path = public
as $$
  with viewer as (
    select
      case
        when in_lat is null or in_lng is null then null
        else ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography
      end as pt,
      public.community_search_tsquery(in_query) as q
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
    -- A query of only punctuation scrubs down to nothing; v.q is then null and
    -- the search is treated as absent rather than as "match nothing".
    and (
      v.q is null
      or to_tsvector(
           'simple',
           coalesce(cp.title, '') || ' ' || coalesce(cp.body, '') || ' ' || coalesce(cp.author_name, '')
         ) @@ v.q
    )
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

-- Same grants the dropped function carried: /community-hub is a public route,
-- so guests read the feed too.
grant execute on function public.community_posts_feed(double precision, double precision, double precision, integer, integer, text, text, text) to anon, authenticated;
