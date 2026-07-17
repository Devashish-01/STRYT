-- ============================================================
-- Realtime publication sync — makes "live updates" actually live.
--
-- Symptom this fixes: the app only shows new data after a manual refresh.
-- useQueryWithRealtime (src/hooks/useApi.ts) subscribes to postgres_changes,
-- but a table emits change events ONLY if it belongs to the `supabase_realtime`
-- publication. Earlier migrations added tables piecemeal and were applied to
-- the live DB "out of band", so the live publication membership was never
-- verified end-to-end. This migration is the single idempotent source of truth.
--
-- Safe to run repeatedly. Skips tables that don't exist on this DB, and skips
-- tables already published. Run in the Supabase SQL editor.
-- ============================================================

do $$
declare
  t text;
  wanted text[] := array[
    -- chat + notifications (RLS-protected — these are the ones that also need
    -- the realtime socket to carry the user JWT; see useAuthSession.ts setAuth)
    'messages', 'conversations', 'notifications',
    -- community / social
    'community_posts', 'post_comments', 'ratings', 'stories', 'story_views',
    -- marketplace: requests / proposals / deals / bookings
    'requests', 'proposals', 'agreements', 'appointments', 'leads',
    -- live queue
    'queue_settings', 'queue_tokens',
    -- directory rows that screens re-read on change
    'businesses', 'providers', 'categories', 'business_qna',
    -- analytics / trust / moderation
    'business_view_logs', 'provider_view_logs', 'provider_verifications',
    'vouches', 'endorsements', 'reports', 'bug_reports',
    -- society / access / live location
    'society_members', 'gate_passes', 'business_team_members',
    'business_access_sessions', 'live_shares', 'location_share_grants'
  ];
begin
  foreach t in array wanted loop
    -- only touch tables that actually exist here
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    -- add only if not already a member (avoids the duplicate-object error)
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'added % to supabase_realtime', t;
    end if;
  end loop;
end $$;

-- ---- Verification: run this SELECT after the block above. -----------------
-- Any row with in_publication = false is a table your app subscribes to that
-- will NOT push live updates. missing_table = true means it doesn't exist on
-- this DB at all (expected for features not deployed here).
with wanted(tbl) as (
  select unnest(array[
    'messages','conversations','notifications',
    'community_posts','post_comments','ratings','stories','story_views',
    'requests','proposals','agreements','appointments','leads',
    'queue_settings','queue_tokens',
    'businesses','providers','categories','business_qna',
    'business_view_logs','provider_view_logs','provider_verifications',
    'vouches','endorsements','reports','bug_reports',
    'society_members','gate_passes','business_team_members',
    'business_access_sessions','live_shares','location_share_grants'
  ])
)
select
  w.tbl,
  (to_regclass(format('public.%I', w.tbl)) is null)          as missing_table,
  (p.tablename is not null)                                  as in_publication
from wanted w
left join pg_publication_tables p
  on p.pubname = 'supabase_realtime'
 and p.schemaname = 'public'
 and p.tablename = w.tbl
order by in_publication asc, missing_table asc, w.tbl;
