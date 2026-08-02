-- Launch hardening — two findings from the pre-Play security audit.
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as
-- `launch_security_hardening`.

-- ── 1. Narrow the RLS helper grants ─────────────────────────────────────────
-- 20260870 granted these to `authenticated, anon` to fix "permission denied for
-- function has_business_full_access" when an owner updated their business. The
-- `authenticated` half is genuinely required: RLS evaluates the predicate as
-- the calling role, so without EXECUTE the owner's UPDATE aborts.
--
-- `anon` was collateral. These take (business_id, uid) and return boolean, so
-- an anonymous caller could probe "does user X hold scope Y on business Z" —
-- information disclosure rather than a breach, but there is no reason for a
-- logged-out visitor to hold it.
--
-- Verified in a rolled-back transaction before applying: with anon revoked,
-- anon can still SELECT businesses (4 rows) and catalog_items (3 rows), so
-- public shop pages and discovery are unaffected. The read policies on those
-- tables don't route through these predicates — only the owner/delegate WRITE
-- policies do, and those callers are always `authenticated`.
revoke execute on function public.has_business_scope(text, text, text) from anon;
revoke execute on function public.has_business_full_access(text, text) from anon;

-- ── 2. Harden claim_first_admin ─────────────────────────────────────────────
-- The bootstrap that grants the very first admin role. Two problems:
--
--   a) It was executable by `anon`. Harmless in practice (auth.uid() is null so
--      the UPDATE matched no row) but it has no business being exposed.
--   b) The "does an admin already exist" check and the UPDATE were separate
--      statements, so two concurrent callers could both pass the check and both
--      become admin. Narrow, but this is the one function in the schema where
--      losing that race hands out full administrative control.
--
-- Now: rejects unauthenticated callers explicitly, takes a transaction-scoped
-- advisory lock so the check-then-write is serialised, and re-asserts the
-- no-admin condition inside the UPDATE itself as a second line of defence.
create or replace function public.claim_first_admin(p_login_id text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then
    raise exception 'Sign in to your STRYT account first.';
  end if;

  -- Serialise concurrent claims. Transaction-scoped, so it releases on commit
  -- or rollback without any explicit unlock.
  perform pg_advisory_xact_lock(hashtext('claim_first_admin'));

  if exists (select 1 from public.users where roles @> array['admin']) then
    raise exception 'An admin account already exists. Ask an existing admin to grant access from the console.';
  end if;
  if exists (select 1 from public.users where admin_login_id = p_login_id) then
    raise exception 'That admin ID is already taken.';
  end if;

  perform set_config('app.role_change_ok', 'true', true);

  update public.users u
     set roles = array_append(u.roles, 'admin'), admin_login_id = p_login_id
   where u.id = v_uid
     -- Belt and braces: even if the lock were somehow bypassed, this cannot
     -- mint a second admin.
     and not exists (select 1 from public.users a where a.roles @> array['admin']);

  if not found then
    raise exception 'Could not claim the admin account. Try again.';
  end if;
end $function$;

revoke all on function public.claim_first_admin(text) from public, anon;
grant execute on function public.claim_first_admin(text) to authenticated;
