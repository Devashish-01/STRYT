-- Rollback for 20261006_team_access_fixes.sql

drop policy if exists admin_upd_businesses on public.businesses;
create policy admin_upd_businesses on public.businesses for update
  using (
    exists (select 1 from public.users where users.id = (select auth.uid())::text and 'admin' = any(users.roles))
    or has_business_full_access(id, (select auth.uid())::text)
    or owner_user_id = (select auth.uid())::text
  )
  with check (
    exists (select 1 from public.users where users.id = (select auth.uid())::text and 'admin' = any(users.roles))
    or has_business_full_access(id, (select auth.uid())::text)
    or owner_user_id = (select auth.uid())::text
  );

drop function if exists public.set_business_availability(text, boolean, timestamptz);

alter table public.business_login_credentials
  drop column if exists access_level,
  drop column if exists scopes;
