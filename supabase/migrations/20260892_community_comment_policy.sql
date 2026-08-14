-- ============================================================
-- 20260892 — Per-post comment policy (replaces the mutual-follow-only gate)
--
-- THE PROBLEM
-- 20260832 made commenting opt-in (allow_comments default false) AND, even when
-- switched on, restricted it to the post author plus MUTUAL followers. In a
-- neighborhood app those two rules compound into a dead end: most posts had
-- comments off, and the ones that didn't could only be answered by someone the
-- author already followed back. "Reliable dentist near KP?" was, in practice,
-- unanswerable by the neighbors it was addressed to.
--
-- THE CHANGE
-- One per-post `comment_policy`, chosen by the author at compose time:
--   EVERYONE  — any signed-in member
--   NEIGHBORS — members within commenting range of the post  (NEW DEFAULT)
--   MUTUALS   — only neighbors the author follows back        (the old behaviour)
--   OFF       — nobody; the author is broadcasting
-- The author may always comment on their own post, under every policy.
--
-- SECURITY POSTURE — this migration WIDENS who can write to post_comments, so
-- it deliberately ships with the guardrails in the same file rather than later:
--   * `user_blocks` — a blocked person cannot comment on the blocker's posts,
--     and the check runs in BOTH directions (blocking someone also removes you
--     from their threads, so blocking can't be used to get the last word).
--   * a per-author rate limit (COMMENT_RATE_LIMIT below), which is what stops a
--     newly-openable comment section from being flooded.
--   * OFF is retained, so any author can always shut a thread down.
-- All of it is enforced inside can_comment_on_post(), which the single
-- post_comments INSERT policy calls — the client's checks stay UX-only.
--
-- BACKWARD COMPATIBILITY
-- `allow_comments` is KEPT and kept in sync by a trigger, because older app
-- builds (and OTA bundles that haven't updated) still read and write it.
-- Existing rows are backfilled to preserve what their author actually chose:
--   allow_comments = false -> 'OFF'
--   allow_comments = true  -> 'MUTUALS'   (what "on" meant before today)
-- Nobody's existing post silently becomes more open than they agreed to. The
-- new NEIGHBORS default applies only to posts created from now on.
--
-- Run manually in the Supabase SQL editor (idempotent, safe to re-run).
-- ============================================================


-- ── 1. Columns ───────────────────────────────────────────────

alter table public.community_posts
  add column if not exists comment_policy  text,
  add column if not exists hide_like_count boolean not null default false;

comment on column public.community_posts.comment_policy is
  'Who may comment: EVERYONE | NEIGHBORS | MUTUALS | OFF. Author always may. Enforced by can_comment_on_post() via the post_comments INSERT policy. Deliberately NO column DEFAULT: trg_sync_allow_comments supplies NEIGHBORS when a caller sends neither this nor allow_comments, which is what lets that trigger tell "sent neither" apart from "explicitly chose a policy" on INSERT. See the trigger for why a table-level default would break that.';
comment on column public.community_posts.hide_like_count is
  'Author chose to keep the like tally private. The like button still works; only the number is hidden.';

-- Backfill BEFORE adding NOT NULL, so existing posts keep the meaning their
-- author picked instead of inheriting the new default.
update public.community_posts
   set comment_policy = case when allow_comments then 'MUTUALS' else 'OFF' end
 where comment_policy is null;

-- NOT NULL via a validated CHECK first, then SET NOT NULL: once Postgres can
-- prove the column is already never-null from a validated CHECK, a plain SET
-- NOT NULL skips its own table-scanning verification. This is the ADD
-- CONSTRAINT ... NOT VALID + VALIDATE CONSTRAINT split — same intent as the
-- NOT VALID checks in 20260891 ("so the ALTER doesn't take a long lock on a
-- large table"), applied here to SET NOT NULL, which has no NOT VALID form of
-- its own. VALIDATE CONSTRAINT takes SHARE UPDATE EXCLUSIVE while it scans
-- (blocks other DDL, not reads/writes) instead of the ACCESS EXCLUSIVE a bare
-- ADD CONSTRAINT / SET NOT NULL holds for the same scan.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'community_posts_comment_policy_not_null_check'
      and conrelid = 'public.community_posts'::regclass
  ) then
    alter table public.community_posts
      add constraint community_posts_comment_policy_not_null_check
      check (comment_policy is not null) not valid;
  end if;
end
$$;
alter table public.community_posts validate constraint community_posts_comment_policy_not_null_check;
alter table public.community_posts alter column comment_policy set not null;
-- Redundant with the real NOT NULL constraint Postgres just derived from it.
alter table public.community_posts drop constraint if exists community_posts_comment_policy_not_null_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'community_posts_comment_policy_check'
      and conrelid = 'public.community_posts'::regclass
  ) then
    alter table public.community_posts
      add constraint community_posts_comment_policy_check
      check (comment_policy in ('EVERYONE', 'NEIGHBORS', 'MUTUALS', 'OFF'))
      not valid;
  end if;
end
$$;
alter table public.community_posts validate constraint community_posts_comment_policy_check;

-- Keep the legacy boolean truthful for older clients that still read it.
-- Without this, an old app build would show "comments are off" on a post whose
-- policy is EVERYONE (or worse, offer a composer on an OFF post).
--
-- comment_policy has NO column default (see the comment on the column, above
-- in this file) precisely so this trigger can tell "the caller sent neither
-- column" apart from "the caller explicitly chose a policy" on INSERT: if a
-- table-level DEFAULT filled comment_policy in before this trigger ran,
-- NEW.comment_policy would never be null here, and the ELSIF branch below (an
-- old client writing only the boolean) would be dead code that never fires —
-- silently discarding that client's write on every insert.
--
-- On UPDATE the same trap shows up in a different shape: comment_policy is
-- NOT NULL, so by definition it is never null on an update either. "Is it
-- null" can't distinguish an explicit write from an untouched column there —
-- the UPDATE branch below compares against OLD instead.
create or replace function public.sync_allow_comments_from_policy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if new.comment_policy is not null then
      new.allow_comments := (new.comment_policy <> 'OFF');
    elsif new.allow_comments is not null then
      -- An old client wrote only the boolean: translate it to the equivalent
      -- policy rather than leaving the two columns disagreeing.
      new.comment_policy := case when new.allow_comments then 'MUTUALS' else 'OFF' end;
    else
      -- Neither column was sent. Everywhere else in this schema that's a
      -- column DEFAULT's job; comment_policy deliberately has none (see
      -- above), so the trigger supplies the default itself.
      new.comment_policy := 'NEIGHBORS';
      new.allow_comments := true;
    end if;
    return new;
  end if;

  -- TG_OP = 'UPDATE'. comment_policy is NOT NULL, so compare against OLD
  -- rather than checking for null.
  if new.comment_policy is distinct from old.comment_policy then
    -- The policy itself changed (a new-style write, whether or not
    -- allow_comments was touched in the same statement) — policy wins.
    new.allow_comments := (new.comment_policy <> 'OFF');
  elsif new.allow_comments is distinct from old.allow_comments then
    -- Only the legacy boolean changed: translate it, same rule as INSERT.
    new.comment_policy := case when new.allow_comments then 'MUTUALS' else 'OFF' end;
  end if;

  return new;
end
$$;

drop trigger if exists trg_sync_allow_comments on public.community_posts;
create trigger trg_sync_allow_comments
  before insert or update of comment_policy, allow_comments on public.community_posts
  for each row execute function public.sync_allow_comments_from_policy();


-- ── 2. Blocking ──────────────────────────────────────────────
-- The moderation floor under a comment section that is no longer
-- mutual-follow-gated. Kept deliberately minimal: one directed row per
-- (blocker, blocked) pair, and no reason/expiry to reason about.

create table if not exists public.user_blocks (
  blocker_user_id text not null references public.users(id) on delete cascade,
  blocked_user_id text not null references public.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  -- Blocking yourself would silently lock you out of your own threads.
  constraint user_blocks_not_self check (blocker_user_id <> blocked_user_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_user_id);

alter table public.user_blocks enable row level security;

-- You can see, create, and remove only your OWN blocks. Notably you may NOT
-- read who has blocked you: exposing that turns a safety tool into a signal
-- that invites a second account.
do $$ begin
  create policy read_own_blocks on public.user_blocks
    for select to authenticated
    using (blocker_user_id = (select auth.uid())::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy insert_own_blocks on public.user_blocks
    for insert to authenticated
    with check (blocker_user_id = (select auth.uid())::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy delete_own_blocks on public.user_blocks
    for delete to authenticated
    using (blocker_user_id = (select auth.uid())::text);
exception when duplicate_object then null; end $$;

-- Internal-only pair check: does a block exist between these two SPECIFIC
-- ids, in either direction. SECURITY DEFINER so it can evaluate the
-- relationship without granting either party read access to the other's
-- block list.
--
-- NOT exposed to any client role — deliberately no GRANT to authenticated (or
-- anon) below. This used to be the public "is_blocked_between(p_a, p_b)" RPC,
-- and that was a hole: PostgREST auto-exposes any granted function, and
-- p_a/p_b were free parameters, so any signed-in user could call it with two
-- arbitrary ids and learn whether THOSE TWO people block each other —
-- including "did X block me" by passing (me, X). That directly defeats the
-- read_own_blocks policy above, which exists specifically so nobody but the
-- blocker can see a block ("exposing that turns a safety tool into a signal
-- that invites a second account"). is_blocked_between(text), below, is the
-- client-facing replacement — it hardcodes one side to auth.uid() so a caller
-- can never ask about a relationship they aren't part of.
--
-- Kept as a real function (not inlined) because the triggers in 20260896 need
-- to check a block between two THIRD PARTIES — e.g. a candidate alert
-- recipient and the alert's author — where neither side is necessarily
-- auth.uid(): that trigger fires for inserts "from any source... a future
-- admin tool or a backfill", which can run with no session/JWT at all. Those
-- SECURITY DEFINER callers keep working against this function because a
-- function owner always retains implicit EXECUTE on their own objects,
-- independent of the REVOKE below.
create or replace function public._user_blocks_exists(p_a text, p_b text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_user_id = p_a and blocked_user_id = p_b)
       or (blocker_user_id = p_b and blocked_user_id = p_a)
  );
$$;

revoke all on function public._user_blocks_exists(text, text) from public, anon, authenticated;

-- Client-facing block check. Only ever answers "is there a block between ME
-- (the calling session) and this other person" — p_other_user_id is the only
-- free parameter, auth.uid() is always the other side. See the comment above
-- for why the old two-free-parameter version was a leak.
--
-- DROP first: this replaces a (text, text) overload with a (text) one.
-- CREATE OR REPLACE cannot change a function's argument list — without the
-- drop, both overloads would exist side by side and the vulnerable two-id
-- form would still be reachable.
drop function if exists public.is_blocked_between(text, text);

create or replace function public.is_blocked_between(p_other_user_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when auth.uid() is null or p_other_user_id is null then false
    else public._user_blocks_exists(auth.uid()::text, p_other_user_id)
  end;
$$;

revoke execute on function public.is_blocked_between(text) from public, anon;
grant execute on function public.is_blocked_between(text) to authenticated;


-- ── 3. Comment-permission predicate ──────────────────────────
-- Replaces 20260832's version. Same name and signature, so the existing
-- post_comments INSERT policy keeps working without being touched — but it is
-- recreated at the end of this file anyway, to assert that no looser legacy
-- policy has reappeared alongside it.
--
-- NEIGHBORS RADIUS: the feed's own visibility rule can't be reused here, because
-- half of it (the viewer's radius) lives in client localStorage and is not a
-- trustworthy input to a security decision. So "neighbor" is defined
-- server-side as within COMMENT_NEIGHBOR_KM of the post, additionally capped by
-- the author's own broadcast radius for business/provider posts — the same
-- capping community_posts_nearby applies in 20260866, so a shop with a 2 km
-- reach doesn't get commenters from 5 km away.
--
-- A post with no coordinates (geom is null) cannot answer "is this person
-- nearby", so NEIGHBORS falls back to MUTUALS for it rather than failing open.

create or replace function public.can_comment_on_post(p_post_id text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  COMMENT_NEIGHBOR_KM constant double precision := 5;
  -- Deliberately generous for a human conversation and cheap for a script:
  -- 10 comments/minute is far past normal typing speed but well short of a flood.
  COMMENT_RATE_LIMIT  constant integer := 10;
  COMMENT_RATE_WINDOW constant interval := interval '1 minute';

  v_uid    text := auth.uid()::text;
  v_post   public.community_posts%rowtype;
  v_policy text;
  v_author text;
  v_radius double precision;
  v_lat    double precision;
  v_lng    double precision;
  v_recent integer;
begin
  if v_uid is null then return false; end if;

  select * into v_post from public.community_posts where id = p_post_id;
  if not found then return false; end if;

  v_author := v_post.author_user_id;
  -- coalesce covers a row written by an old client that only set the boolean.
  v_policy := coalesce(v_post.comment_policy, case when v_post.allow_comments then 'MUTUALS' else 'OFF' end);

  -- (a) The author may always comment on their own post, under every policy,
  --     and is exempt from the rate limit's window being consumed by others.
  if v_author is not null and v_author = v_uid then
    return true;
  end if;

  -- (b) Blocking wins over any policy, in both directions. Calls the internal
  --     pair-checker directly (v_uid/v_author are already known) rather than
  --     the client-facing is_blocked_between(text), which hardcodes one side
  --     to auth.uid() — that's still v_uid here, but going through the
  --     private helper avoids re-deriving it.
  if v_author is not null and public._user_blocks_exists(v_uid, v_author) then
    return false;
  end if;

  -- (c) Rate limit. Applied before the policy branches so it holds no matter
  --     which policy let the caller in. The advisory lock serializes
  --     concurrent calls from the SAME author for the rest of this
  --     transaction, closing the check-then-act race where two parallel
  --     comment inserts both read the count below before either commits and
  --     both slip in under the limit.
  perform pg_advisory_xact_lock(hashtextextended('comment_rate:' || v_uid, 0));
  select count(*) into v_recent
    from public.post_comments
   where author_user_id = v_uid
     and created_at > now() - COMMENT_RATE_WINDOW;
  if v_recent >= COMMENT_RATE_LIMIT then
    return false;
  end if;

  -- (d) The policy itself.
  if v_policy = 'OFF' then
    return false;
  end if;

  if v_policy = 'EVERYONE' then
    return true;
  end if;

  if v_policy = 'NEIGHBORS' and v_post.geom is not null then
    select lat, lng into v_lat, v_lng from public.users where id = v_uid;
    if v_lat is null or v_lng is null then
      -- No location on file: fall through to the MUTUALS test below rather than
      -- treating an unknown distance as "nearby".
      null;
    else
      v_radius := COMMENT_NEIGHBOR_KM;
      if v_post.author_type = 'business' then
        select least(v_radius, greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0))
          into v_radius
          from public.businesses b where b.id = v_post.author_ref_id;
      elsif v_post.author_type = 'provider' then
        select least(v_radius, greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0))
          into v_radius
          from public.providers p where p.id = v_post.author_ref_id;
      end if;

      if ST_DWithin(
           v_post.geom,
           ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography,
           coalesce(v_radius, COMMENT_NEIGHBOR_KM) * 1000
         ) then
        return true;
      end if;
      return false;
    end if;
  end if;

  -- (e) MUTUALS — and the fallback for a NEIGHBORS post that can't be measured.
  --     Unchanged from 20260832: both directions must exist in `follows`.
  if v_author is null then return false; end if;
  return exists (
      select 1 from public.follows f
      where f.follower_user_id = v_uid
        and f.target_id = v_author
        and f.target_type in ('USER', 'user')
    ) and exists (
      select 1 from public.follows f
      where f.follower_user_id = v_author
        and f.target_id = v_uid
        and f.target_type in ('USER', 'user')
    );
end
$$;

revoke execute on function public.can_comment_on_post(text) from public, anon;
grant execute on function public.can_comment_on_post(text) to authenticated;


-- ── 4. Re-assert the single gated INSERT policy ──────────────
-- Postgres OR-combines permissive policies, so ONE forgotten legacy policy is
-- enough to bypass everything above. 20260832 consolidated these; this repeats
-- the consolidation because widening the rule is exactly when a stray
-- permissive policy would do the most damage.
alter table public.post_comments enable row level security;

drop policy if exists "Allow insert access to post_comments for authenticated" on public.post_comments;
drop policy if exists ins_post_comments on public.post_comments;
drop policy if exists insert_own_post_comment on public.post_comments;
create policy insert_own_post_comment on public.post_comments
  for insert
  with check (
    (select auth.role()) = 'authenticated'
    and author_user_id = (select auth.uid())::text
    and public.can_comment_on_post(post_id)
  );


-- ── 5. Reader-facing view of the rule ────────────────────────
-- The client needs to know WHY it can't comment so it can say something
-- actionable ("Follow each other to comment" vs "You're outside this area")
-- instead of a generic failure. Returns a reason code, never anything about
-- the other party.
create or replace function public.comment_gate_reason(p_post_id text)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid    text := auth.uid()::text;
  v_post   public.community_posts%rowtype;
  v_policy text;
begin
  if v_uid is null then return 'SIGN_IN'; end if;
  select * into v_post from public.community_posts where id = p_post_id;
  if not found then return 'NOT_FOUND'; end if;

  if v_post.author_user_id = v_uid then return 'OK'; end if;
  if public.can_comment_on_post(p_post_id) then return 'OK'; end if;

  v_policy := coalesce(v_post.comment_policy, case when v_post.allow_comments then 'MUTUALS' else 'OFF' end);
  if v_policy = 'OFF' then return 'OFF'; end if;
  if public._user_blocks_exists(v_uid, v_post.author_user_id) then return 'BLOCKED'; end if;
  if v_policy = 'NEIGHBORS' then return 'TOO_FAR'; end if;
  if v_policy = 'MUTUALS' then return 'NOT_MUTUAL'; end if;
  return 'RATE_LIMITED';
end
$$;

revoke execute on function public.comment_gate_reason(text) from public, anon;
grant execute on function public.comment_gate_reason(text) to authenticated;
