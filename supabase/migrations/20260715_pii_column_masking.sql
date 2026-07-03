-- ============================================================
-- ISS-009 — full resolution. Postgres RLS is row-level; it can't mask
-- individual columns per-viewer, which is what "respect show_phone_publicly"
-- actually requires. Traced every frontend call site that reads
-- public.users (24 of them) before writing this — most only ever request
-- safe columns (name/avatar/rating) for other users and are untouched by
-- this migration. The real leaks:
--   1. Raw REST/devtools access could request phone/emergency_contact/exact
--      lat,lng/email/admin_login_id for ANY row the row-level policy let
--      through, regardless of that user's privacy toggles (ISS-F13 already
--      closed the zero-auth version of this; this closes it for
--      authenticated callers too).
--   2. Worse: userService.publicProfile() — the app's own "view someone
--      else's profile" path — was *already* pulling the target's raw phone
--      and exact lat/lng into the client on every profile view, with only
--      the frontend's rendering choosing whether to display it. Anyone
--      opening devtools while viewing any public profile could read another
--      user's exact home coordinates, opted-out-of-phone-sharing or not.
--
-- Fix: revoke SELECT on the sensitive columns from the client-facing roles
-- entirely, and route every legitimate need for them through a
-- SECURITY DEFINER function that enforces self/admin/consent server-side —
-- so the masking can no longer be bypassed by constructing a different
-- query, because the raw values never leave the database for a
-- non-consenting read in the first place.
-- ============================================================

revoke select (phone, email, emergency_contact, emergency_contact_name, lat, lng, admin_login_id)
  on public.users from authenticated, anon;

-- ── Self access — full row, unmasked (used by userService.me()) ──────────
create or replace function public.get_own_profile()
returns setof public.users
language sql security definer stable set search_path = public as $$
  select * from public.users where id = auth.uid()::text;
$$;
grant execute on function public.get_own_profile() to authenticated;

-- ── Self coordinates only — lightweight, used by the "borrow my location
-- for my provider listing / a post / a request" call sites ──────────────
create or replace function public.get_own_coords()
returns table (lat double precision, lng double precision)
language sql security definer stable set search_path = public as $$
  select lat, lng from public.users where id = auth.uid()::text;
$$;
grant execute on function public.get_own_coords() to authenticated;

-- ── Self emergency contact — used only by the SOS alert flow ─────────────
create or replace function public.get_own_emergency_contact()
returns table (emergency_contact text, emergency_contact_name text)
language sql security definer stable set search_path = public as $$
  select emergency_contact, emergency_contact_name from public.users where id = auth.uid()::text;
$$;
grant execute on function public.get_own_emergency_contact() to authenticated;

-- ── Public profile view — masks phone by consent, never returns exact
-- coordinates for anyone but self/admin (raw home coordinates were the
-- worst finding here — a "few km away" figure is consistent with how
-- distance is already shown everywhere else in the app; turn-by-turn
-- directions to a private individual's exact registered address is not a
-- feature this app should have, independent of RLS) ─────────────────────
create or replace function public.get_public_profile(target_id text)
returns table (
  id text, name text, phone text, avatar text, area text,
  rating_avg numeric, rating_count int, created_at timestamptz,
  show_posts_publicly boolean, show_asks_publicly boolean, show_badges_publicly boolean,
  show_phone_publicly boolean, show_city_publicly boolean, show_rating_publicly boolean,
  distance_km numeric
)
language plpgsql security definer stable set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_is_self_or_admin boolean;
  v_my_lat double precision;
  v_my_lng double precision;
begin
  select (u.id = v_uid) or ('admin' = any(u.roles))
    into v_is_self_or_admin
    from public.users u where u.id = v_uid;

  select u.lat, u.lng into v_my_lat, v_my_lng from public.users u where u.id = v_uid;

  return query
    select
      u.id, u.name,
      case when v_is_self_or_admin or u.show_phone_publicly then u.phone else null end,
      u.avatar,
      case when v_is_self_or_admin or u.show_city_publicly then u.area else null end,
      u.rating_avg, u.rating_count, u.created_at,
      u.show_posts_publicly, u.show_asks_publicly, u.show_badges_publicly,
      u.show_phone_publicly, u.show_city_publicly, u.show_rating_publicly,
      case when v_my_lat is null or v_my_lng is null or u.lat is null or u.lng is null then null
           else round((2 * 6371 * asin(sqrt(
             sin(radians(u.lat - v_my_lat) / 2) ^ 2 +
             cos(radians(v_my_lat)) * cos(radians(u.lat)) * sin(radians(u.lng - v_my_lng) / 2) ^ 2
           )))::numeric, 1)
      end
    from public.users u
    where u.id = target_id
      and (v_is_self_or_admin or (u.customer_enabled = true and u.customer_deleted_at is null) or u.id = v_uid);
end $$;
grant execute on function public.get_public_profile(text) to authenticated;

-- ── Admin directory — full columns, admin-only, self-checked inside the
-- function (the calling Postgres role is just "authenticated" either way;
-- "admin" is an app-level flag in users.roles, not a real Postgres role) ──
create or replace function public.admin_search_users(term text)
returns setof public.users
language plpgsql security definer stable set search_path = public as $$
begin
  if not exists (select 1 from public.users where id = auth.uid()::text and 'admin' = any(roles)) then
    raise exception 'NOT_ADMIN';
  end if;
  return query
    select * from public.users
    where name ilike '%' || term || '%'
       or phone ilike '%' || term || '%'
       or email ilike '%' || term || '%'
    limit 20;
end $$;
grant execute on function public.admin_search_users(text) to authenticated;

create or replace function public.admin_recent_users()
returns setof public.users
language plpgsql security definer stable set search_path = public as $$
begin
  if not exists (select 1 from public.users where id = auth.uid()::text and 'admin' = any(roles)) then
    raise exception 'NOT_ADMIN';
  end if;
  return query select * from public.users order by created_at desc limit 30;
end $$;
grant execute on function public.admin_recent_users() to authenticated;

-- ── Nearby-user id lookup for the new-listing broadcast notification —
-- needs to filter by lat/lng, which the revoke above blocks for a plain
-- client-side query even when only `id` is in the output list. ──────────
create or replace function public.get_nearby_user_ids(p_lat double precision, p_lng double precision, p_radius_km double precision)
returns setof text
language sql security definer stable set search_path = public as $$
  select id from public.users
   where lat is not null and lng is not null
     and lat between p_lat - (p_radius_km / 111.0) and p_lat + (p_radius_km / 111.0)
     and lng between p_lng - (p_radius_km / 111.0) and p_lng + (p_radius_km / 111.0);
$$;
grant execute on function public.get_nearby_user_ids(double precision, double precision, double precision) to authenticated;
