-- ============================================================
-- Admin ID/password login, backed by real Supabase Auth (no
-- custom password storage anywhere — Supabase hashes/verifies it).
-- Run manually in Supabase SQL editor.
-- ============================================================

alter table public.users
  add column if not exists admin_login_id text;
create unique index if not exists users_admin_login_id_key on public.users (admin_login_id) where admin_login_id is not null;

-- Resolves an admin login ID -> the underlying auth email, but ONLY for rows
-- that are already tagged admin. Cannot be used to harvest arbitrary user
-- emails: a non-admin's admin_login_id is always null, so it never matches.
create or replace function public.resolve_admin_email(p_login_id text)
returns text as $$
  select au.email
  from public.users u
  join auth.users au on au.id::text = u.id
  where u.admin_login_id = p_login_id
    and u.roles @> array['admin']
  limit 1;
$$ language sql security definer stable;

grant execute on function public.resolve_admin_email(text) to anon, authenticated;

-- One-time bootstrap: the currently signed-in user claims the admin role,
-- but ONLY while zero admins exist system-wide. Self-disables permanently
-- the moment the first admin is created — cannot be replayed to mint extra
-- admins later (that must go through the admin console instead).
create or replace function public.claim_first_admin(p_login_id text)
returns void as $$
declare
  admin_exists boolean;
begin
  select exists(select 1 from public.users where roles @> array['admin']) into admin_exists;
  if admin_exists then
    raise exception 'An admin account already exists. Ask an existing admin to grant access from the console.';
  end if;
  if exists (select 1 from public.users where admin_login_id = p_login_id) then
    raise exception 'That admin ID is already taken.';
  end if;
  update public.users
    set roles = array_append(roles, 'admin'), admin_login_id = p_login_id
    where id = auth.uid()::text;
end $$ language plpgsql security definer;

grant execute on function public.claim_first_admin(text) to authenticated;

-- Lets an existing admin change the login ID for their OWN account only.
create or replace function public.set_admin_login_id(p_new_id text)
returns void as $$
begin
  if not exists (select 1 from public.users where id = auth.uid()::text and roles @> array['admin']) then
    raise exception 'Only an admin can change the admin login ID.';
  end if;
  if exists (select 1 from public.users where admin_login_id = p_new_id and id <> auth.uid()::text) then
    raise exception 'That admin ID is already taken.';
  end if;
  update public.users set admin_login_id = p_new_id where id = auth.uid()::text;
end $$ language plpgsql security definer;

grant execute on function public.set_admin_login_id(text) to authenticated;
