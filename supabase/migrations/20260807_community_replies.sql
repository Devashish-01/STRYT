-- ============================================================
-- Community interactions: nested replies (comments on comments) + ensure the
-- like/comment tables have the write policies that make giving a like or a
-- comment actually persist. Run manually in Supabase SQL editor.
-- ============================================================

-- ── Nested replies ──────────────────────────────────────────
alter table public.post_comments
  add column if not exists parent_id text references public.post_comments(id) on delete cascade;

create index if not exists post_comments_parent_idx
  on public.post_comments (parent_id) where parent_id is not null;

-- ── RLS safety net: make sure likes & comments can be written ──
-- These are idempotent; if the policies already exist this is a no-op. Missing
-- INSERT/DELETE policies are the classic reason a like "does nothing" and a
-- comment silently fails on an RLS-hardened project.
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

do $$ begin
  create policy read_post_likes on public.post_likes for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy insert_own_post_like on public.post_likes for insert
    with check (auth.role() = 'authenticated' and user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy delete_own_post_like on public.post_likes for delete
    using (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy read_post_comments on public.post_comments for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy insert_own_post_comment on public.post_comments for insert
    with check (auth.role() = 'authenticated' and author_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy delete_own_post_comment on public.post_comments for delete
    using (author_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;
