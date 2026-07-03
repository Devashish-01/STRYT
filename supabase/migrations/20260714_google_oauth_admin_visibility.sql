-- ============================================================
-- Google OAuth users weren't findable in the admin customer directory.
-- Root cause, traced through the actual code (not guessed):
--   1. public.users has no `email` column at all. The signup trigger
--      (handle_new_auth_user, migration_writes.sql) and the client-side
--      self-heal (userService.me()) both only ever put email into the
--      `name` column, and only as a last-resort fallback when Google
--      doesn't return a full_name — so email is usually never persisted
--      anywhere queryable at all.
--   2. AdminPanel.tsx's customer search (`runSearch()`) only searches
--      `name ILIKE`, with no way to search by phone, and no way to browse
--      a list without typing a search term first. Google users have
--      phone = NULL (Google doesn't provide one) and a `name` that's
--      either their real name or their email — neither of which an admin
--      searching the way they search everyone else (by phone number,
--      since that's the dominant signup method) will ever match.
-- Run manually in Supabase SQL editor.
-- ============================================================

alter table public.users add column if not exists email text;

-- Backfill existing rows from auth.users where we can.
update public.users u
   set email = au.email
  from auth.users au
 where au.id::text = u.id
   and u.email is null
   and au.email is not null;

create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, name, phone, email, roles)
  values (
    new.id::text,
    coalesce(nullif(new.phone, ''), nullif(new.email, ''), 'New user'),
    new.phone,
    new.email,
    '{customer}'
  )
  on conflict (id) do update set email = coalesce(public.users.email, excluded.email)
  where public.users.email is null;
  return new;
exception when others then
  return new;
end $$ language plpgsql security definer;
