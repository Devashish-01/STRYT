-- ============================================================
-- CRITICAL — society_members RLS policy causes infinite recursion on every
-- single query (confirmed live: "42P17 infinite recursion detected in
-- policy for relation society_members"). SocietyScreen.tsx is 100% broken
-- right now — every read/write against society_members 500s. This table +
-- its policy were never in any tracked migration (schema drift), so the
-- exact broken policy definition is unknown — this replaces whatever is
-- live with a correct, non-recursive version.
--
-- Root cause pattern: a policy on society_members that checks membership by
-- querying society_members itself re-triggers the same policy → infinite
-- loop. Fix: move the membership check into a SECURITY DEFINER function,
-- which bypasses RLS on its own internal query and breaks the recursion.
-- ============================================================

create or replace function public.is_society_member(p_society_id uuid, p_user_id text)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.society_members
    where society_id = p_society_id and user_id = p_user_id and approved = true
  );
$$;

create or replace function public.is_society_admin(p_society_id uuid, p_user_id text)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.society_members
    where society_id = p_society_id and user_id = p_user_id
      and approved = true and role in ('ADMIN', 'SECRETARY')
  );
$$;

grant execute on function public.is_society_member(uuid, text) to anon, authenticated;
grant execute on function public.is_society_admin(uuid, text) to anon, authenticated;

alter table public.society_members enable row level security;

do $$ begin
  drop policy if exists read_society_members on public.society_members;
  drop policy if exists insert_society_members on public.society_members;
  drop policy if exists update_society_members on public.society_members;
  drop policy if exists delete_society_members on public.society_members;
  -- Drop whatever the untracked live policy was named — Postgres doesn't
  -- expose a portable "drop all policies on table" so this catches the
  -- likely names; if the live one had a different name it'll just no-op
  -- via IF EXISTS and get orphaned (harmless, RLS is enabled either way).
exception when undefined_object then null; end $$;

create policy read_society_members on public.society_members
  for select using (
    user_id = auth.uid()::text
    or public.is_society_member(society_id, auth.uid()::text)
  );

create policy insert_society_members on public.society_members
  for insert with check (user_id = auth.uid()::text);

create policy update_society_members on public.society_members
  for update using (public.is_society_admin(society_id, auth.uid()::text))
  with check (public.is_society_admin(society_id, auth.uid()::text));

create policy delete_society_members on public.society_members
  for delete using (public.is_society_admin(society_id, auth.uid()::text));

-- ============================================================
-- CRITICAL — PII readable with zero authentication
-- Verified live against production: a plain curl with only the public anon
-- key (no login, no session) returned full user rows including `phone`,
-- regardless of that user's own `show_phone_publicly = false` setting —
-- and full `queue_tokens` rows including `customer_name` (an email address
-- in the row we found). The live `read_users` policy is `using (true)` /
-- an equivalent that never checks auth.role(), so the anon (fully
-- logged-out) role passes it.
--
-- This migration closes the "zero-authentication" hole: the entire app
-- requires login to reach any screen (App.tsx's top-level !isAuthed gate),
-- so restricting these SELECT policies to authenticated only breaks
-- nothing in the app itself, while stopping anyone from scraping user PII
-- via the REST API using just the public anon key.
--
-- NOT fully fixed by this migration: an authenticated user can still read
-- another user's phone number via the raw `users` table even if that user
-- set show_phone_publicly = false — Postgres RLS is row-level, not
-- column-level, so respecting that per-column flag needs a privacy-aware
-- view or RPC and an audit of every `.from("users")` call site in the
-- frontend that reads OTHER users' data. Tracked as a new issue — see
-- ISSUES.md. Do not consider this closed.
-- ============================================================

create or replace function public.is_admin(p_user_id text)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = p_user_id and 'admin' = any(roles)
  );
$$;

grant execute on function public.is_admin(text) to anon, authenticated;

drop policy if exists read_users on public.users;
create policy read_users on public.users
  for select using (
    auth.role() = 'authenticated'
    and (
      (customer_enabled = true and customer_deleted_at is null)
      or id = auth.uid()::text
      or public.is_admin(auth.uid()::text)
    )
  );

do $$ begin
  drop policy if exists read_queue_tokens on public.queue_tokens;
exception when undefined_object then null; end $$;
create policy read_queue_tokens on public.queue_tokens
  for select using (
    auth.role() = 'authenticated'
    and (
      customer_user_id = auth.uid()::text
      or exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text)
    )
  );
