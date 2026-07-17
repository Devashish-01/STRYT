-- 20260826 — Let anonymous visitors call businesses_nearby()
--
-- Guest mode (GUEST_MODE_PLAN.md) lets a signed-out visitor browse what's within
-- 1 km. Home/Explore's "nearby" sort goes through the PostGIS RPCs, and
-- `businesses_nearby` was the ONLY one in that family without an EXECUTE grant
-- to `anon` — its sibling `providers_nearby`, plus `community_posts_nearby`,
-- `neighborhood_today`, `get_public_profile` and `booked_slots`, all already had
-- it. A guest's Home therefore rendered the providers rail fine and threw
-- "permission denied for function businesses_nearby" (401) on the businesses
-- rail, surfacing as a "Couldn't load" toast.
--
-- Safe to grant, and this is drift rather than a deliberate stance:
--   * The function is NOT security definer — it executes as the caller, so the
--     existing RLS policy on `businesses` still applies in full. This grant
--     exposes exactly what `anon` can already SELECT from the table directly,
--     and nothing more.
--   * Its own WHERE clause already restricts to
--     `status='ACTIVE' AND owner_enabled AND deleted_at IS NULL` — the same
--     predicate as the `read_businesses` RLS policy.

grant execute on function public.businesses_nearby(
  double precision, double precision, double precision, text, integer, integer
) to anon;
