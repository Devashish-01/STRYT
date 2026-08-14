-- ============================================================
-- 20260895 — Comment reactions + @mentions
--
-- WHY REACTIONS. A comment thread had exactly one response available: another
-- comment. So "thanks, this helped" and "same thing happened to me" both had to
-- become full replies, which pushes the useful answer further down and makes a
-- helpful thread read as a noisy one. A reaction is the cheap acknowledgement
-- that keeps the signal at the top.
--
-- One reaction PER PERSON per comment (the primary key), not a tally per emoji.
-- Changing your mind replaces your reaction rather than adding a second one,
-- which is what makes "who found this useful" a countable thing.
--
-- WHY MENTIONS ARE STORED. Rendering @alias as a link can be done by parsing the
-- body, but two things can't: notifying the person (Task 8) and surviving an
-- alias change. `mentions` stores the resolved user id alongside the alias text
-- as it was written — a snapshot, consistent with how notifications.metadata is
-- handled elsewhere in this schema.
--
-- Mentions resolve by ALIAS ONLY, matching socialService.searchNeighbors: users
-- are findable by their public alias and never by their real name, so mentioning
-- someone cannot be used to confirm a real identity.
--
-- Run manually in the Supabase SQL editor (idempotent, safe to re-run).
-- ============================================================


-- ── 1. Mentions on a comment ─────────────────────────────────

alter table public.post_comments
  add column if not exists mentions jsonb not null default '[]'::jsonb;

comment on column public.post_comments.mentions is
  'Resolved @mentions: [{"userId":"...","alias":"..."}]. Snapshot at write time — the alias is what was typed, so the comment still reads correctly after a rename.';


-- ── 2. Reactions ─────────────────────────────────────────────

create table if not exists public.comment_reactions (
  comment_id text not null references public.post_comments(id) on delete cascade,
  user_id    text not null references public.users(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id),
  -- A closed set, deliberately. An open emoji field is a free-text field in
  -- disguise: it can carry a slur via ZWJ sequences, it can't be aggregated
  -- meaningfully, and it needs its own moderation story.
  constraint comment_reactions_emoji_check check (emoji in ('👍', '❤️', '😂', '😮', '🙏', '💡'))
);

-- comment_id doesn't need its own index: it's already the leading column of
-- the primary key (comment_id, user_id), so a lookup by comment_id alone
-- already uses that index. user_id has no such coverage — it's an FK to
-- users(id) ON DELETE CASCADE sitting only in the PK's trailing position, so
-- without an index of its own, deleting a user sequence-scans this table to
-- find their reactions to cascade. Matches the FK-indexing convention
-- 20260880_perf_indexes_and_rls.sql established repo-wide.
create index if not exists comment_reactions_user_idx on public.comment_reactions (user_id);

alter table public.comment_reactions enable row level security;

-- Counts are public in the same way post_likes counts are: the whole point is
-- that others can see a comment was found useful.
do $$ begin
  create policy read_comment_reactions on public.comment_reactions
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy insert_own_comment_reaction on public.comment_reactions
    for insert to authenticated
    with check (user_id = (select auth.uid())::text);
exception when duplicate_object then null; end $$;

-- UPDATE is needed as well as INSERT: switching reaction is an upsert, which
-- becomes INSERT ... ON CONFLICT DO UPDATE once a row exists. Without this
-- policy that path fails silently — the same RLS gap 20260832 had to fix for
-- story_views.
do $$ begin
  create policy update_own_comment_reaction on public.comment_reactions
    for update to authenticated
    using (user_id = (select auth.uid())::text)
    with check (user_id = (select auth.uid())::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy delete_own_comment_reaction on public.comment_reactions
    for delete to authenticated
    using (user_id = (select auth.uid())::text);
exception when duplicate_object then null; end $$;

-- Reacting is gated by the same rule as commenting: if a post's comment_policy
-- won't let you reply, it shouldn't let you react either — otherwise reactions
-- become a side channel into a closed thread.
create or replace function public.can_react_to_comment(p_comment_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select public.can_comment_on_post(c.post_id)
      from public.post_comments c
      where c.id = p_comment_id
    ),
    false
  );
$$;

revoke execute on function public.can_react_to_comment(text) from public, anon;
grant execute on function public.can_react_to_comment(text) to authenticated;

-- Applied to INSERT and UPDATE by replacing the two policies created above with
-- gated versions. Written as a second step so the file stays readable and
-- re-runnable.
drop policy if exists insert_own_comment_reaction on public.comment_reactions;
create policy insert_own_comment_reaction on public.comment_reactions
  for insert to authenticated
  with check (user_id = (select auth.uid())::text and public.can_react_to_comment(comment_id));

drop policy if exists update_own_comment_reaction on public.comment_reactions;
create policy update_own_comment_reaction on public.comment_reactions
  for update to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text and public.can_react_to_comment(comment_id));


-- ── 3. Realtime ──────────────────────────────────────────────
-- post_comments is already in the publication (20260824). Reactions need to be
-- there too or a reaction from someone else never appears until a manual reload.
do $$ begin
  alter publication supabase_realtime add table public.comment_reactions;
exception when others then null; end $$;
