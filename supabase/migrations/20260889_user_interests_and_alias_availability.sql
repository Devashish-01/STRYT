-- ============================================================
-- First-run onboarding: interest capture + live @handle availability
-- ============================================================
-- Supports the rebuilt first-login flow (src/screens/auth/UserOnboard.tsx),
-- which replaces a single seven-field form with four one-question steps.
--
-- Two independent pieces, shipped together because the same screen needs both:
--
--   1. users.interest_category_ids — the only genuinely new data the new flow
--      collects. Feeds Home's "Nearby on your street" ranking so a first Home
--      is not identical for every user.
--
--   2. aliases_available() — the flow suggests three handles derived from the
--      user's name and needs to know which are free BEFORE showing them. Today
--      the app discovers a collision only by attempting the write and catching
--      the unique-index violation (UserOnboard.tsx), which means the user fills
--      the field, submits, and starts over.
-- ============================================================

-- ---------- 1. interests ----------
alter table public.users
  add column if not exists interest_category_ids text[];

comment on column public.users.interest_category_ids is
  'Top-level category ids (categories.id where parent_id is null) the user picked during first-run onboarding. A RANKING signal only — Home orders the nearby rail by these, and never filters listings out on their basis. NULL/empty means no preference expressed, which must render exactly as the pre-onboarding-redesign ordering did.';

-- ---------- 2. handle availability ----------
-- Case-insensitive to agree with the existing partial unique index
-- users_alias_unique on lower(alias) (20260806_user_alias.sql) — a check that
-- disagreed with the constraint enforcing it would be worse than no check.
--
-- SECURITY DEFINER because RLS does not let one user read another's row; the
-- function deliberately returns ONLY a boolean per candidate, never a row, an
-- id, or a count. That discloses nothing a signup attempt doesn't already
-- reveal, which is the same bar every "username taken" field on the web meets.
--
-- The caller's own row is excluded so re-confirming the handle you already own
-- reads as available rather than as a collision with yourself.
--
-- Array-shaped so the three suggested handles cost ONE round trip; the
-- debounced custom-input check reuses it with a single-element array. The
-- `limit 10` is an anti-enumeration cap, not a functional limit — the client
-- never sends more than three, so an array longer than that is abuse, and
-- truncating costs a legitimate caller nothing.
create or replace function public.aliases_available(p_aliases text[])
returns table (alias text, available boolean)
language sql security definer stable set search_path = public as $$
  select
    t.candidate as alias,
    not exists (
      select 1
        from public.users u
       where lower(u.alias) = lower(t.candidate)
         and u.alias is not null
         and u.alias <> ''
         and u.id <> coalesce(auth.uid()::text, '')
    ) as available
  from unnest(p_aliases) as t(candidate)
  limit 10;
$$;

comment on function public.aliases_available(text[]) is
  'Per-candidate handle availability for the onboarding @handle step. Case-insensitive (matches the users_alias_unique index on lower(alias)) and excludes the caller''s own row. Returns booleans only.';

-- Convention set by 20260881/20260882: definer functions are reachable at
-- /rest/v1/rpc/<name> with nothing but the publishable key unless PUBLIC is
-- revoked. Only signed-in users pick a handle, so `authenticated` is the whole
-- audience. (Unlike 20260887's helpers, this one is never called from an RLS
-- policy qual, so `anon` needs no grant — see that migration for why that
-- distinction matters.)
revoke execute on function public.aliases_available(text[]) from public;
grant execute on function public.aliases_available(text[]) to authenticated;

-- ---------- notes ----------
-- get_own_profile() deliberately needs NO change here: it is
-- `returns setof public.users` doing `select *`
-- (20260715_pii_column_masking.sql), so interest_category_ids flows through to
-- userService.me() automatically. The `returns table (...)` helpers alongside
-- it (get_own_coords, get_own_emergency_contact) would each have needed a DROP
-- before widening — this one does not.
