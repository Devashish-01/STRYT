-- ============================================================
-- STRYT platform state baseline
-- source:   production gnswxlfmcwyhmzlfipql, read from pg_catalog via the Management API
-- taken:    2026-09-15T16:58:34.609Z
-- cutoff:   migration ledger version 20260915163940 (159 rows). Apply migrations with a HIGHER version after this.
-- method:   scripts/baseline/dump-baseline.mjs — apply with scripts/baseline/apply-baseline.mjs (never to production)
-- ============================================================

-- @@item header
set check_function_bodies = false;

-- @@item Storage buckets 1/3
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('app-updates', 'app-updates', true, null, null) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- @@item Storage buckets 2/3
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('uploads', 'uploads', true, null, null) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- @@item Storage buckets 3/3
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('verification-docs', 'verification-docs', false, null, null) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- @@item Storage policies 1/4
DROP POLICY IF EXISTS "User scoped delete" ON storage.objects;
CREATE POLICY "User scoped delete" ON storage.objects AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (((bucket_id = 'uploads'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- @@item Storage policies 2/4
DROP POLICY IF EXISTS "User scoped insert" ON storage.objects;
CREATE POLICY "User scoped insert" ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((bucket_id = 'uploads'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- @@item Storage policies 3/4
DROP POLICY IF EXISTS "User scoped update" ON storage.objects;
CREATE POLICY "User scoped update" ON storage.objects AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((bucket_id = 'uploads'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- @@item Storage policies 4/4
DROP POLICY IF EXISTS verification_docs_owner_insert ON storage.objects;
CREATE POLICY verification_docs_owner_insert ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((bucket_id = 'verification-docs'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- @@item Realtime publication tables 1/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agreements') then
    alter publication supabase_realtime add table public.agreements;
  end if;
end $pub$;

-- @@item Realtime publication tables 2/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments') then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $pub$;

-- @@item Realtime publication tables 3/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bug_reports') then
    alter publication supabase_realtime add table public.bug_reports;
  end if;
end $pub$;

-- @@item Realtime publication tables 4/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'business_access_sessions') then
    alter publication supabase_realtime add table public.business_access_sessions;
  end if;
end $pub$;

-- @@item Realtime publication tables 5/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'business_qna') then
    alter publication supabase_realtime add table public.business_qna;
  end if;
end $pub$;

-- @@item Realtime publication tables 6/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'business_team_members') then
    alter publication supabase_realtime add table public.business_team_members;
  end if;
end $pub$;

-- @@item Realtime publication tables 7/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'business_view_logs') then
    alter publication supabase_realtime add table public.business_view_logs;
  end if;
end $pub$;

-- @@item Realtime publication tables 8/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'businesses') then
    alter publication supabase_realtime add table public.businesses;
  end if;
end $pub$;

-- @@item Realtime publication tables 9/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories') then
    alter publication supabase_realtime add table public.categories;
  end if;
end $pub$;

-- @@item Realtime publication tables 10/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comment_reactions') then
    alter publication supabase_realtime add table public.comment_reactions;
  end if;
end $pub$;

-- @@item Realtime publication tables 11/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_posts') then
    alter publication supabase_realtime add table public.community_posts;
  end if;
end $pub$;

-- @@item Realtime publication tables 12/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $pub$;

-- @@item Realtime publication tables 13/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'endorsements') then
    alter publication supabase_realtime add table public.endorsements;
  end if;
end $pub$;

-- @@item Realtime publication tables 14/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gate_passes') then
    alter publication supabase_realtime add table public.gate_passes;
  end if;
end $pub$;

-- @@item Realtime publication tables 15/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads') then
    alter publication supabase_realtime add table public.leads;
  end if;
end $pub$;

-- @@item Realtime publication tables 16/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_shares') then
    alter publication supabase_realtime add table public.live_shares;
  end if;
end $pub$;

-- @@item Realtime publication tables 17/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'location_share_grants') then
    alter publication supabase_realtime add table public.location_share_grants;
  end if;
end $pub$;

-- @@item Realtime publication tables 18/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $pub$;

-- @@item Realtime publication tables 19/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $pub$;

-- @@item Realtime publication tables 20/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'poll_votes') then
    alter publication supabase_realtime add table public.poll_votes;
  end if;
end $pub$;

-- @@item Realtime publication tables 21/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_comments') then
    alter publication supabase_realtime add table public.post_comments;
  end if;
end $pub$;

-- @@item Realtime publication tables 22/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proposal_counters') then
    alter publication supabase_realtime add table public.proposal_counters;
  end if;
end $pub$;

-- @@item Realtime publication tables 23/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proposals') then
    alter publication supabase_realtime add table public.proposals;
  end if;
end $pub$;

-- @@item Realtime publication tables 24/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'provider_view_logs') then
    alter publication supabase_realtime add table public.provider_view_logs;
  end if;
end $pub$;

-- @@item Realtime publication tables 25/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'providers') then
    alter publication supabase_realtime add table public.providers;
  end if;
end $pub$;

-- @@item Realtime publication tables 26/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'queue_settings') then
    alter publication supabase_realtime add table public.queue_settings;
  end if;
end $pub$;

-- @@item Realtime publication tables 27/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'queue_tokens') then
    alter publication supabase_realtime add table public.queue_tokens;
  end if;
end $pub$;

-- @@item Realtime publication tables 28/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ratings') then
    alter publication supabase_realtime add table public.ratings;
  end if;
end $pub$;

-- @@item Realtime publication tables 29/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports') then
    alter publication supabase_realtime add table public.reports;
  end if;
end $pub$;

-- @@item Realtime publication tables 30/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'requests') then
    alter publication supabase_realtime add table public.requests;
  end if;
end $pub$;

-- @@item Realtime publication tables 31/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'society_members') then
    alter publication supabase_realtime add table public.society_members;
  end if;
end $pub$;

-- @@item Realtime publication tables 32/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stories') then
    alter publication supabase_realtime add table public.stories;
  end if;
end $pub$;

-- @@item Realtime publication tables 33/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'story_views') then
    alter publication supabase_realtime add table public.story_views;
  end if;
end $pub$;

-- @@item Realtime publication tables 34/34
do $pub$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vouches') then
    alter publication supabase_realtime add table public.vouches;
  end if;
end $pub$;

-- @@item Cron jobs 1/3
select cron.schedule('close-expired-bulk-deals', '*/10 * * * *', 'select public.close_expired_bulk_deals();');

-- @@item Cron jobs 2/3
select cron.schedule('close-expired-business-sessions', '* * * * *', 'select public.close_expired_business_sessions()');

-- @@item Cron jobs 3/3
select cron.schedule('notify-ended-polls', '*/10 * * * *', 'select public.notify_ended_polls();');

-- @@item Migration ledger (one baseline row at the cutoff) 1/1
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20260915163940', 'baseline_through_20260915163940') on conflict (version) do nothing;
