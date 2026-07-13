-- 20260718 — per-entity contact privacy + provider UPI.
-- Adds public/private visibility flags for phone & email across all three
-- identity types (customer/business/provider), an email column where missing,
-- and a UPI VPA on providers (businesses already have upi_id) so the deal flow
-- can collect payment to a provider too. All additive + idempotent.

-- ── users (customer) ────────────────────────────────────────────────────
alter table if exists public.users
  add column if not exists show_email_publicly boolean default false;
-- phone/city already have show_*_publicly from 20260705; email defaults private.

-- ── businesses ──────────────────────────────────────────────────────────
alter table if exists public.businesses
  add column if not exists email               text,
  add column if not exists show_phone_publicly boolean default true,
  add column if not exists show_email_publicly boolean default false;

-- ── providers ───────────────────────────────────────────────────────────
alter table if exists public.providers
  add column if not exists email               text,
  add column if not exists upi_id              text,
  add column if not exists show_phone_publicly boolean default true,
  add column if not exists show_email_publicly boolean default false;

-- Extend the public-profile RPC to also return email (masked by
-- show_email_publicly), preserving the original self/admin bypass, distance
-- computation, and soft-delete gating from 20260715. drop+create because the
-- RETURNS TABLE shape changes (two new trailing columns).
drop function if exists public.get_public_profile(text);

create or replace function public.get_public_profile(target_id text)
returns table (
  id text, name text, phone text, avatar text, area text,
  rating_avg numeric, rating_count int, created_at timestamptz,
  show_posts_publicly boolean, show_asks_publicly boolean, show_badges_publicly boolean,
  show_phone_publicly boolean, show_city_publicly boolean, show_rating_publicly boolean,
  distance_km numeric,
  email text, show_email_publicly boolean
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
      end,
      case when v_is_self_or_admin or coalesce(u.show_email_publicly, false) then u.email else null end,
      coalesce(u.show_email_publicly, false)
    from public.users u
    where u.id = target_id
      and (v_is_self_or_admin or (u.customer_enabled = true and u.customer_deleted_at is null) or u.id = v_uid);
end $$;
grant execute on function public.get_public_profile(text) to authenticated;
