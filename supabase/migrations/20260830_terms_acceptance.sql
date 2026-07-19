-- ============================================================
-- 20260830 — Terms & Privacy acceptance (clickwrap) capture + version gating
--
-- One combined acceptance ("I am 18+ and agree to the Terms & Conditions and
-- Privacy Policy") is recorded at first sign-in, and re-prompted whenever the
-- app's LEGAL_VERSION (src/lib/legal.ts) is bumped after a policy update.
--
-- Two parts:
--   1. Denormalised latest-acceptance columns on users — cheap for the app's
--      gate to read ("does users.terms_accepted_version = current version?").
--   2. An append-only audit table (terms_acceptances) — the real legal record,
--      one immutable row per acceptance event, never overwritten.
-- Writes to both go through the SECURITY DEFINER RPC below so the timestamp is
-- server-stamped (trustworthy) and the audit row can't be forged/edited by a
-- client. The RPC is the only writer; RLS on the audit table is read-own only.
-- ============================================================

alter table public.users
  add column if not exists terms_accepted_version text,
  add column if not exists terms_accepted_at timestamptz;

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  user_agent text
);

create index if not exists terms_acceptances_user_idx
  on public.terms_acceptances(user_id);

alter table public.terms_acceptances enable row level security;

-- Users may read their own acceptance history. There is deliberately NO insert/
-- update/delete policy: the append-only rows are written only by the SECURITY
-- DEFINER RPC (which bypasses RLS), so acceptances can't be forged or altered.
drop policy if exists "own terms acceptances readable" on public.terms_acceptances;
create policy "own terms acceptances readable" on public.terms_acceptances
  for select using (user_id = auth.uid()::text);

create or replace function public.record_terms_acceptance(
  p_version text,
  p_user_agent text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_version text := nullif(trim(coalesce(p_version, '')), '');
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if v_version is null then raise exception 'VERSION_REQUIRED'; end if;

  insert into public.terms_acceptances (user_id, version, user_agent)
  values (
    v_uid,
    left(v_version, 40),
    nullif(left(trim(coalesce(p_user_agent, '')), 400), '')
  );

  update public.users
     set terms_accepted_version = left(v_version, 40),
         terms_accepted_at = now()
   where id = v_uid;
end
$$;

revoke execute on function public.record_terms_acceptance(text, text) from public, anon;
grant execute on function public.record_terms_acceptance(text, text) to authenticated;
