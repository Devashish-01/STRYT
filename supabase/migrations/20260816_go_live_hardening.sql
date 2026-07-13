-- ============================================================
-- Go-live security hardening (Security Audit H-3, M-6)
-- Run AFTER 20260815_manual_verification.sql.
-- ============================================================

-- ── H-3: block self-escalation of PRIVILEGE roles ───────────────────────
-- public.users.roles mixes two very different things:
--   - capability roles: customer / business_owner / provider — freely
--     self-assignable today (store.tsx onboarding does `roles: next` via a
--     plain client update, and must keep working)
--   - privilege roles: admin / super_admin — must NEVER be settable by a
--     plain authenticated client write, or any user can grant themselves
--     admin (update_users already lets a user update their own row —
--     20260705_privacy_and_followers.sql — this trigger is what stops that
--     row-level permission from also being a privilege-escalation bug).
--
-- Only a service_role caller (an Edge Function) or a session that has
-- explicitly opted in via the app.role_change_ok GUC (set only inside
-- SECURITY DEFINER functions we control, transaction-scoped so it can't
-- leak to later statements) may add/remove admin or super_admin. Same
-- design as the verification badge trigger in
-- 20260815_manual_verification.sql — a raw dashboard SQL edit is likewise
-- blocked unless it also sets the GUC, which is intentional.
create or replace function public.enforce_role_privilege_guard()
returns trigger as $$
declare
  v_role text;
  v_privilege_roles text[] := array['admin', 'super_admin'];
  v_old_roles text[];
begin
  if auth.role() = 'service_role'
     or coalesce(current_setting('app.role_change_ok', true), '') = 'true' then
    return new;
  end if;

  v_old_roles := case when tg_op = 'INSERT' then '{}'::text[] else old.roles end;

  foreach v_role in array v_privilege_roles loop
    if (v_role = any(coalesce(new.roles, '{}')))
       is distinct from (v_role = any(coalesce(v_old_roles, '{}'))) then
      raise exception 'roles: % can only be granted or revoked via the admin console', v_role;
    end if;
  end loop;

  return new;
end $$ language plpgsql;

drop trigger if exists trg_enforce_role_privilege_guard on public.users;
create trigger trg_enforce_role_privilege_guard
  before insert or update on public.users
  for each row execute function public.enforce_role_privilege_guard();

-- claim_first_admin is the one legitimate self-grant of 'admin' (the
-- one-time bootstrap, already re-entrancy-guarded by "admin_exists") — it
-- must opt in to the guard above via the same transaction-local GUC.
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
  perform set_config('app.role_change_ok', 'true', true);
  update public.users
    set roles = array_append(roles, 'admin'), admin_login_id = p_login_id
    where id = auth.uid()::text;
end $$ language plpgsql security definer;

-- ── M-6: SECURITY DEFINER RPCs default to PUBLIC execute ────────────────
-- CREATE FUNCTION grants EXECUTE to PUBLIC unless revoked — no migration
-- ever revoked it, so every DEFINER RPC below (all bypass RLS; several take
-- caller-controlled lat/lng/radius/search-term params) has been callable by
-- the *anon* role via PostgREST RPC this whole time. The app gates every
-- screen behind auth (ProtectedLayout in src/App.tsx) — there is no
-- anonymous-browsing path that legitimately needs these pre-login — so
-- `authenticated` is the correct floor for all of them.
revoke execute on function public.get_nearby_user_ids(double precision, double precision, double precision) from public;
grant execute on function public.get_nearby_user_ids(double precision, double precision, double precision) to authenticated;

revoke execute on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to authenticated;

revoke execute on function public.businesses_nearby(double precision, double precision, double precision, text, int, int) from public;
grant execute on function public.businesses_nearby(double precision, double precision, double precision, text, int, int) to authenticated;

revoke execute on function public.get_leaderboard() from public;
grant execute on function public.get_leaderboard() to authenticated;

revoke execute on function public.get_shared_location(text) from public;
grant execute on function public.get_shared_location(text) to authenticated;

revoke execute on function public.admin_search_users(text) from public;
grant execute on function public.admin_search_users(text) to authenticated;

revoke execute on function public.admin_recent_users() from public;
grant execute on function public.admin_recent_users() to authenticated;

revoke execute on function public.get_own_profile() from public;
grant execute on function public.get_own_profile() to authenticated;

revoke execute on function public.get_own_coords() from public;
grant execute on function public.get_own_coords() to authenticated;

revoke execute on function public.get_own_emergency_contact() from public;
grant execute on function public.get_own_emergency_contact() to authenticated;

-- Belt-and-braces: clamp the broadcast radius server-side too (the client
-- already caps this in discoveryService.ts, but the RPC is the real
-- boundary — don't trust the caller-supplied value alone).
create or replace function public.get_nearby_user_ids(p_lat double precision, p_lng double precision, p_radius_km double precision)
returns setof text
language sql security definer stable set search_path = public as $$
  select id from public.users
   where lat is not null and lng is not null
     and lat between p_lat - (least(p_radius_km, 50) / 111.0) and p_lat + (least(p_radius_km, 50) / 111.0)
     and lng between p_lng - (least(p_radius_km, 50) / 111.0) and p_lng + (least(p_radius_km, 50) / 111.0);
$$;
