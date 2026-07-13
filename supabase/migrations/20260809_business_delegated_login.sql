-- ============================================================
-- Business remote / delegated login. Run manually in Supabase SQL editor.
--
-- Lets a business owner create a shareable login id + password so another
-- STRYT user can manage that business without the owner sharing their own
-- account. Optional owner approval per login, and every grant is a
-- time-boxed session the owner can revoke.
--
-- SECURITY: passwords are bcrypt-hashed with pgcrypto and NEVER leave the DB
-- (set + verify happen inside SECURITY DEFINER RPCs). Delegated access is
-- granted by ADDING permissive policies (RLS is OR-combined) alongside the
-- existing owner policies — existing owner rules are untouched.
-- ============================================================

create extension if not exists pgcrypto;

-- ── Credentials (one set per business) ───────────────────────
create table if not exists public.business_login_credentials (
  business_id      text primary key references public.businesses(id) on delete cascade,
  login_id         text not null unique,
  password_hash    text not null,
  require_approval boolean not null default true,
  session_hours    int not null default 8,
  is_enabled       boolean not null default true,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists blc_login_idx on public.business_login_credentials (lower(login_id));

-- ── Access sessions (one per login attempt) ──────────────────
create table if not exists public.business_access_sessions (
  id              text primary key default gen_random_uuid()::text,
  business_id     text not null references public.businesses(id) on delete cascade,
  grantee_user_id text not null references public.users(id) on delete cascade,
  status          text not null default 'PENDING'
                    check (status in ('PENDING','ACTIVE','EXPIRED','REVOKED','DENIED')),
  requested_at    timestamptz default now(),
  approved_at     timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz default now()
);
create index if not exists bas_business_idx on public.business_access_sessions (business_id, status);
create index if not exists bas_grantee_idx on public.business_access_sessions (grantee_user_id, status);

alter table public.business_login_credentials enable row level security;
alter table public.business_access_sessions enable row level security;

-- Owner may read their credential row (never the hash on the client — the app
-- selects only non-secret columns). Writes go through set_business_login().
do $$ begin
  create policy read_own_blc on public.business_login_credentials for select
    using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text));
exception when duplicate_object then null; end $$;

-- Owner of the business OR the grantee can read the session rows.
do $$ begin
  create policy read_bas on public.business_access_sessions for select
    using (grantee_user_id = auth.uid()::text
      or exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text));
exception when duplicate_object then null; end $$;
-- A grantee may revoke (leave) their own session.
do $$ begin
  create policy update_own_bas on public.business_access_sessions for update
    using (grantee_user_id = auth.uid()::text) with check (grantee_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- ── Access predicate: owner OR an active, unexpired session ───
create or replace function public.has_business_access(p_business_id text, p_uid text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = p_uid)
      or exists (select 1 from public.business_access_sessions s
                  where s.business_id = p_business_id and s.grantee_user_id = p_uid
                    and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now()));
$$;
grant execute on function public.has_business_access(text, text) to authenticated;

-- ── List the businesses the current user can manage via a session ──
create or replace function public.my_delegated_businesses()
returns setof text language sql security definer stable set search_path = public as $$
  select business_id from public.business_access_sessions
   where grantee_user_id = auth.uid()::text
     and status = 'ACTIVE' and (expires_at is null or expires_at > now());
$$;
grant execute on function public.my_delegated_businesses() to authenticated;

-- ── Additive delegated-write policies on business-owned tables ──
-- RLS is permissive (OR), so these grant active-session holders the same write
-- access as the owner WITHOUT modifying the existing owner policies. Wrapped so
-- a missing table simply skips.
do $$ begin
  create policy delegated_access_catalog on public.catalog_items for all
    using (public.has_business_access(business_id, auth.uid()::text))
    with check (public.has_business_access(business_id, auth.uid()::text));
exception when duplicate_object then null; when undefined_table then null; end $$;

do $$ begin
  create policy delegated_access_queue_tokens on public.queue_tokens for all
    using (public.has_business_access(business_id, auth.uid()::text))
    with check (public.has_business_access(business_id, auth.uid()::text));
exception when duplicate_object then null; when undefined_table then null; end $$;

do $$ begin
  create policy delegated_access_queue_settings on public.queue_settings for all
    using (public.has_business_access(business_id, auth.uid()::text))
    with check (public.has_business_access(business_id, auth.uid()::text));
exception when duplicate_object then null; when undefined_table then null; end $$;

do $$ begin
  create policy delegated_access_biz_portfolio on public.business_portfolio_items for all
    using (public.has_business_access(business_id, auth.uid()::text))
    with check (public.has_business_access(business_id, auth.uid()::text));
exception when duplicate_object then null; when undefined_table then null; end $$;

do $$ begin
  create policy delegated_access_loyalty on public.loyalty_cards for all
    using (public.has_business_access(business_id, auth.uid()::text))
    with check (public.has_business_access(business_id, auth.uid()::text));
exception when duplicate_object then null; when undefined_table then null; end $$;

do $$ begin
  create policy delegated_access_qna on public.business_qna for all
    using (public.has_business_access(business_id, auth.uid()::text))
    with check (public.has_business_access(business_id, auth.uid()::text));
exception when duplicate_object then null; when undefined_table then null; end $$;

-- Business row updates (edit profile, hours, availability) + appointments where
-- the delegate manages that business.
do $$ begin
  create policy delegated_access_businesses on public.businesses for update
    using (public.has_business_access(id, auth.uid()::text))
    with check (public.has_business_access(id, auth.uid()::text));
exception when duplicate_object then null; when undefined_table then null; end $$;

do $$ begin
  create policy delegated_access_appointments on public.appointments for update
    using (target_type = 'BUSINESS' and public.has_business_access(target_id, auth.uid()::text))
    with check (target_type = 'BUSINESS' and public.has_business_access(target_id, auth.uid()::text));
exception when duplicate_object then null; when undefined_table then null; end $$;

-- ── Owner sets/updates the login credentials ─────────────────
create or replace function public.set_business_login(
  p_business_id text, p_login_id text, p_password text,
  p_require_approval boolean, p_session_hours int, p_enabled boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = auth.uid()::text) then
    raise exception 'Only the business owner can set login access.';
  end if;
  insert into public.business_login_credentials (business_id, login_id, password_hash, require_approval, session_hours, is_enabled, updated_at)
  values (p_business_id, p_login_id, crypt(nullif(p_password, ''), gen_salt('bf')), p_require_approval, greatest(1, p_session_hours), p_enabled, now())
  on conflict (business_id) do update set
    login_id = excluded.login_id,
    -- keep the existing password when the owner edits settings without retyping it
    password_hash = case when coalesce(p_password, '') <> '' then crypt(p_password, gen_salt('bf')) else public.business_login_credentials.password_hash end,
    require_approval = excluded.require_approval,
    session_hours = excluded.session_hours,
    is_enabled = excluded.is_enabled,
    updated_at = now();
end $$;
grant execute on function public.set_business_login(text, text, text, boolean, int, boolean) to authenticated;

-- ── A logged-in user attempts a business login ───────────────
create or replace function public.business_login_attempt(p_login_id text, p_password text)
returns table (status text, business_id text, session_id text, business_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_cred public.business_login_credentials%rowtype;
  v_status text;
  v_expires timestamptz;
  v_sid text;
  v_name text;
begin
  if v_uid is null then raise exception 'Sign in to your STRYT account first.'; end if;
  select * into v_cred from public.business_login_credentials
   where lower(login_id) = lower(p_login_id) and is_enabled = true;
  if v_cred.business_id is null or v_cred.password_hash <> crypt(p_password, v_cred.password_hash) then
    raise exception 'Invalid login id or password.';
  end if;

  if v_cred.require_approval then
    v_status := 'PENDING'; v_expires := null;
  else
    v_status := 'ACTIVE'; v_expires := now() + make_interval(hours => v_cred.session_hours);
  end if;

  insert into public.business_access_sessions (business_id, grantee_user_id, status, approved_at, expires_at)
  values (v_cred.business_id, v_uid, v_status, case when v_status = 'ACTIVE' then now() else null end, v_expires)
  returning id into v_sid;

  select b.name into v_name from public.businesses b where b.id = v_cred.business_id;

  if v_status = 'PENDING' then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      select b.owner_user_id, 'QUEUE_UPDATE', 'Business access request',
             'Someone requested access to ' || coalesce(b.name, 'your business') || '. Review it in Account & settings.',
             '/account/business-access'
        from public.businesses b where b.id = v_cred.business_id;
    exception when others then null; end;
  end if;

  status := v_status; business_id := v_cred.business_id; session_id := v_sid; business_name := v_name;
  return next;
end $$;
grant execute on function public.business_login_attempt(text, text) to authenticated;

-- ── Owner approves / denies a pending session ────────────────
create or replace function public.decide_business_session(p_session_id text, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_biz text; v_hours int;
begin
  select s.business_id into v_biz
    from public.business_access_sessions s
    join public.businesses b on b.id = s.business_id
   where s.id = p_session_id and b.owner_user_id = auth.uid()::text;
  if v_biz is null then raise exception 'Only the business owner can decide this request.'; end if;

  select session_hours into v_hours from public.business_login_credentials where business_id = v_biz;
  update public.business_access_sessions
     set status = case when p_approve then 'ACTIVE' else 'DENIED' end,
         approved_at = case when p_approve then now() else null end,
         expires_at = case when p_approve then now() + make_interval(hours => coalesce(v_hours, 8)) else null end
   where id = p_session_id and status = 'PENDING';

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    select grantee_user_id, 'QUEUE_UPDATE',
           case when p_approve then 'Access approved ✓' else 'Access request denied' end,
           case when p_approve then 'You can now manage the business from Switch account.' else 'The owner declined your access request.' end,
           '/account/business-access'
      from public.business_access_sessions where id = p_session_id;
  exception when others then null; end;
end $$;
grant execute on function public.decide_business_session(text, text) to authenticated;

-- ── Revoke a session (owner) or leave one (grantee) ──────────
create or replace function public.revoke_business_session(p_session_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.business_access_sessions s
     set status = 'REVOKED', expires_at = now()
   where s.id = p_session_id
     and (s.grantee_user_id = auth.uid()::text
          or exists (select 1 from public.businesses b where b.id = s.business_id and b.owner_user_id = auth.uid()::text));
end $$;
grant execute on function public.revoke_business_session(text) to authenticated;

-- ── Expire elapsed sessions (opportunistic sweep) ────────────
create or replace function public.close_expired_business_sessions()
returns void language sql security definer set search_path = public as $$
  update public.business_access_sessions
     set status = 'EXPIRED'
   where status = 'ACTIVE' and expires_at is not null and expires_at < now();
$$;
grant execute on function public.close_expired_business_sessions() to anon, authenticated;
