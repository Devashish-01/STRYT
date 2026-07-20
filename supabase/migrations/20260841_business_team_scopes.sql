-- ============================================================
-- Scoped team-member access on top of business_access_sessions.
-- Run manually in Supabase SQL editor.
--
-- Today's "Delegated access" grant (grant_business_access) is all-or-nothing:
-- the grantee gets full owner-equivalent access to every business-owned
-- table. This adds a scope layer so an owner can instead grant a real STRYT
-- user access to just appointments, queue, catalogue, or leads/quotes —
-- everything money- or identity-sensitive (payments, verification, business
-- profile edits, settings) stays reachable only by the owner or a FULL grant.
--
-- Existing sessions default to access_level='FULL' so nothing currently
-- granted loses access. RLS stays additive (OR-combined) — owner policies
-- are untouched throughout.
-- ============================================================

alter table public.business_access_sessions
  add column if not exists access_level text not null default 'FULL' check (access_level in ('FULL','SCOPED')),
  add column if not exists scopes text[] not null default '{}';

-- ── Scope-aware access predicate ──────────────────────────────
-- Owner → true. Otherwise an ACTIVE, unexpired session where either the
-- grant is FULL, or the requested scope is in the grant's scope list.
create or replace function public.has_business_scope(p_business_id text, p_uid text, p_scope text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = p_uid)
      or exists (select 1 from public.business_access_sessions s
                  where s.business_id = p_business_id and s.grantee_user_id = p_uid
                    and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now())
                    and (s.access_level = 'FULL' or p_scope = any(s.scopes)));
$$;
-- Raw predicate, NOT client-executable — same treatment as has_business_access
-- (20260824_booking_and_rpc_security.sql's comment: "The raw predicate is not
-- client-executable; callers use the current-user wrapper below"). A client
-- could otherwise pass an arbitrary uid to probe another user's access.
-- my_business_access_scope (below) is the safe, auth.uid()-only wrapper.
revoke execute on function public.has_business_scope(text, text, text) from public, anon, authenticated;

-- ── Full-access predicate: owner OR a FULL-level active session ──
-- Used for the handful of surfaces that stay FULL-grant/owner-only
-- regardless of scope (business profile edits, loyalty cards). NOTE:
-- delegated_access_businesses is the ONLY update policy on public.businesses
-- (confirmed — no separate "owner can update their own business" policy
-- exists anywhere in the migration history), so the owner branch here is
-- load-bearing, not a redundant belt-and-suspenders check.
create or replace function public.has_business_full_access(p_business_id text, p_uid text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = p_uid)
      or exists (select 1 from public.business_access_sessions s
                  where s.business_id = p_business_id and s.grantee_user_id = p_uid
                    and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now())
                    and s.access_level = 'FULL');
$$;
-- Raw predicate, NOT client-executable — same reasoning as has_business_scope above.
revoke execute on function public.has_business_full_access(text, text) from public, anon, authenticated;

-- ── Rewrite the delegated-write policies to be scope-aware ────
-- Same additive pattern as 20260809_business_delegated_login.sql — these
-- REPLACE the existing has_business_access(...)-only policies of the same
-- name. A FULL grant still passes every one of these (has_business_scope
-- treats FULL as "any scope"); a SCOPED grant only passes the scopes it holds.
drop policy if exists delegated_access_catalog on public.catalog_items;
do $$ begin
  create policy delegated_access_catalog on public.catalog_items for all
    using (public.has_business_scope(business_id, auth.uid()::text, 'catalog'))
    with check (public.has_business_scope(business_id, auth.uid()::text, 'catalog'));
exception when duplicate_object then null; when undefined_table then null; end $$;

drop policy if exists delegated_access_queue_tokens on public.queue_tokens;
do $$ begin
  create policy delegated_access_queue_tokens on public.queue_tokens for all
    using (public.has_business_scope(business_id, auth.uid()::text, 'queue'))
    with check (public.has_business_scope(business_id, auth.uid()::text, 'queue'));
exception when duplicate_object then null; when undefined_table then null; end $$;

drop policy if exists delegated_access_queue_settings on public.queue_settings;
do $$ begin
  create policy delegated_access_queue_settings on public.queue_settings for all
    using (public.has_business_scope(business_id, auth.uid()::text, 'queue'))
    with check (public.has_business_scope(business_id, auth.uid()::text, 'queue'));
exception when duplicate_object then null; when undefined_table then null; end $$;

drop policy if exists delegated_access_biz_portfolio on public.business_portfolio_items;
do $$ begin
  create policy delegated_access_biz_portfolio on public.business_portfolio_items for all
    using (public.has_business_scope(business_id, auth.uid()::text, 'catalog'))
    with check (public.has_business_scope(business_id, auth.uid()::text, 'catalog'));
exception when duplicate_object then null; when undefined_table then null; end $$;

drop policy if exists delegated_access_qna on public.business_qna;
do $$ begin
  create policy delegated_access_qna on public.business_qna for all
    using (public.has_business_scope(business_id, auth.uid()::text, 'leads'))
    with check (public.has_business_scope(business_id, auth.uid()::text, 'leads'));
exception when duplicate_object then null; when undefined_table then null; end $$;

drop policy if exists delegated_access_appointments on public.appointments;
do $$ begin
  create policy delegated_access_appointments on public.appointments for update
    using (target_type = 'BUSINESS' and public.has_business_scope(target_id, auth.uid()::text, 'appointments'))
    with check (target_type = 'BUSINESS' and public.has_business_scope(target_id, auth.uid()::text, 'appointments'));
exception when duplicate_object then null; when undefined_table then null; end $$;

-- Profile edits (business row) and loyalty cards are NOT part of any
-- requested scope — conservative default, FULL-grant/owner only. This is
-- also, critically, the policy that lets OWNERS update their own business
-- (see has_business_full_access's comment above) — do not narrow this to a
-- session-only check.
drop policy if exists delegated_access_businesses on public.businesses;
do $$ begin
  create policy delegated_access_businesses on public.businesses for update
    using (public.has_business_full_access(id, auth.uid()::text))
    with check (public.has_business_full_access(id, auth.uid()::text));
exception when duplicate_object then null; when undefined_table then null; end $$;

drop policy if exists delegated_access_loyalty on public.loyalty_cards;
do $$ begin
  create policy delegated_access_loyalty on public.loyalty_cards for all
    using (public.has_business_full_access(business_id, auth.uid()::text))
    with check (public.has_business_full_access(business_id, auth.uid()::text));
exception when duplicate_object then null; when undefined_table then null; end $$;

-- ── Leads/quotes: not an RLS gap — proposals' RLS (write_proposals in
-- legacy/rls.sql) is already "any authenticated user, no ownership check at
-- all"; the real gate is the BEFORE INSERT/UPDATE trigger added in
-- 20260801_code_audit_guardrails.sql, enforce_proposal_responder_entity_owner(),
-- which today requires literal business.owner_user_id = responder_user_id —
-- so even a FULL delegate can't submit a quote as the business. Rewritten to
-- reuse has_business_scope (its owner branch already covers literal
-- ownership, so this is a strict widening, not a narrowing). The existing
-- responder_entity_id column (20260727_proposal_responder_entity.sql) is
-- already the business/provider correlation — no new column needed.
create or replace function public.enforce_proposal_responder_entity_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.responder_type is null or new.responder_type = 'user' then
    new.responder_type := 'user';
    new.responder_entity_id := null;
    return new;
  end if;

  if new.responder_type = 'business' then
    if new.responder_entity_id is null
       or not public.has_business_scope(new.responder_entity_id, new.responder_user_id, 'leads') then
      raise exception 'You can only submit a business proposal as a business you have leads access to.';
    end if;
    return new;
  end if;

  -- Providers have no delegation system — literal ownership only, unchanged.
  if new.responder_type = 'provider' then
    if new.responder_entity_id is null or not exists (
      select 1 from public.providers p
       where p.id = new.responder_entity_id
         and p.user_id = new.responder_user_id
    ) then
      raise exception 'You can only submit a provider proposal as a provider profile you own.';
    end if;
    return new;
  end if;

  raise exception 'Invalid proposal responder type.';
end $$;

-- ── Appointment RPCs: same has_business_access → has_business_scope swap ──
-- These are SECURITY DEFINER RPCs (not raw table writes), so the Phase-1
-- delegated_access_appointments RLS rewrite above doesn't reach them at all —
-- without this, a team member granted only 'appointments' scope could see
-- bookings in the UI but every accept/decline/payment action would fail
-- server-side. Signatures are unchanged (only the internal has_business_access
-- call is swapped for has_business_scope(..., 'appointments')), so plain
-- create-or-replace is safe — no duplicate-overload risk from a widened
-- param list. appointment_create_walk_in reproduces the CURRENT 11-param
-- signature from 20260835_appointment_line_items_and_inventory.sql (the one
-- in 20260824 was superseded/dropped there); the other four were never
-- redefined after 20260824 and are reproduced as-is except for that swap.
create or replace function public.appointment_transition(
  p_id text, p_status text, p_response_note text default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_is_customer boolean;
  v_is_manager boolean;
  v_cancelled_by text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_is_customer := v_appointment.customer_user_id = v_uid and not v_appointment.is_walk_in;
  v_is_manager := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));

  if v_is_customer and p_status = 'CANCELLED'
     and v_appointment.status in ('PENDING', 'ACCEPTED') then
    v_cancelled_by := 'CUSTOMER';
  elsif v_is_manager and v_appointment.status = 'PENDING'
        and p_status in ('ACCEPTED', 'REJECTED') then
    v_cancelled_by := null;
  elsif v_is_manager and v_appointment.status = 'ACCEPTED'
        and p_status = 'CANCELLED' then
    v_cancelled_by := 'OWNER';
  elsif v_is_manager and v_appointment.status = 'COMPLETED'
        and p_status = 'NO_SHOW' then
    v_cancelled_by := null;
  else
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.appointments
  set status = p_status,
      response_note = case when p_response_note is null then response_note
        else nullif(left(trim(p_response_note), 1000), '') end,
      cancelled_by = case when p_status = 'CANCELLED' then v_cancelled_by else cancelled_by end
  where id = p_id and status = v_appointment.status
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$$;

create or replace function public.appointment_confirm_payment(p_id text)
returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;
  if v_appointment.payment_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.appointments set payment_status = 'PAID'
  where id = p_id and payment_status = 'PENDING_CONFIRM'
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$$;

create or replace function public.appointment_reject_payment(p_id text)
returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;
  if v_appointment.payment_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.appointments set payment_status = 'REJECTED'
  where id = p_id and payment_status = 'PENDING_CONFIRM'
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$$;

create or replace function public.appointment_record_walk_in_payment(
  p_id text, p_method text, p_amount numeric default null,
  p_reference text default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
  v_amount numeric;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
  if not v_allowed or not v_appointment.is_walk_in then raise exception 'NOT_WALK_IN_MANAGER'; end if;
  if v_appointment.payment_status not in ('UNPAID', 'REJECTED') then raise exception 'INVALID_TRANSITION'; end if;

  v_amount := coalesce(v_appointment.package_price, p_amount);
  if v_amount is null or v_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  update public.appointments
  set payment_method = p_method, payment_status = 'PAID', payment_amount = v_amount,
      payment_reference = nullif(left(trim(coalesce(p_reference, '')), 200), '')
  where id = p_id and is_walk_in and payment_status in ('UNPAID', 'REJECTED')
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$$;

create or replace function public.appointment_create_walk_in(
  p_target_type text, p_target_id text, p_customer_name text,
  p_customer_phone text, p_scheduled_for timestamptz,
  p_date_label text, p_time_label text, p_package_id text default null,
  p_package_name text default null, p_package_price numeric default null,
  p_items jsonb default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_target_avatar text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean := false;
  v_items jsonb := p_items;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if nullif(trim(coalesce(p_customer_name, '')), '') is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name, b.cover_image
    into v_owner, v_target_name, v_target_avatar
    from public.businesses b where b.id = p_target_id;
    v_allowed := public.has_business_scope(p_target_id, v_uid, 'appointments');
  else
    select p.user_id, p.display_name, p.avatar
    into v_owner, v_target_name, v_target_avatar
    from public.providers p where p.id = p_target_id;
    v_allowed := v_owner = v_uid;
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, scheduled_for, date_label, time_label,
    notes, package_id, package_name, package_price, status, is_walk_in
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, left(trim(p_customer_name), 200), p_scheduled_for,
    p_date_label, p_time_label,
    case when nullif(trim(coalesce(p_customer_phone, '')), '') is null
      then 'Walk-in'
      else 'Walk-in • ' || left(trim(p_customer_phone), 30) end,
    p_package_id, p_package_name, p_package_price, 'ACCEPTED', true
  ) returning * into v_appointment;

  if (v_items is null or jsonb_array_length(v_items) = 0) and p_package_id is not null then
    v_items := jsonb_build_array(jsonb_build_object(
      'catalog_item_id', p_package_id,
      'item_name', coalesce(p_package_name, 'Item'),
      'unit_price', coalesce(p_package_price, 0),
      'quantity', 1
    ));
  end if;

  if v_items is not null and jsonb_array_length(v_items) > 0 then
    insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
    select v_appointment.id, x.catalog_item_id, coalesce(x.item_name, 'Item'), coalesce(x.unit_price, 0), x.quantity
    from jsonb_to_recordset(v_items) as x(catalog_item_id text, item_name text, unit_price numeric, quantity int)
    where coalesce(x.quantity, 0) > 0;

    perform public.reserve_catalog_items(v_items);
  end if;

  return v_appointment;
end
$$;

-- ── Owner: grant scoped team-member access ─────────────────────
-- Sibling to grant_business_access (kept untouched, still the FULL-access
-- path) rather than an overload, so existing callers don't have to change.
-- Shares the same identifier lookup (email / phone / @alias) and the same
-- reuse-an-existing-row upsert behavior.
create or replace function public.grant_team_member_access(
  p_business_id text, p_identifier text, p_scopes text[]
) returns table (session_id uuid, grantee_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid      text := auth.uid()::text;
  v_target   text;
  v_name     text;
  v_ident    text := trim(p_identifier);
  v_digits   text := regexp_replace(v_ident, '\D', '', 'g');
  v_biz_name text;
  v_session_id uuid;
  v_scopes   text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                   where s in ('appointments','queue','catalog','leads')), '{}');
begin
  if v_uid is null then raise exception 'Sign in to your STRYT account first.'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;

  select b.name into v_biz_name from public.businesses b
   where b.id = p_business_id and b.owner_user_id = v_uid;
  if v_biz_name is null then raise exception 'Only the business owner can add team members.'; end if;

  if v_ident ~ '@.*\.' then
    select id, name into v_target, v_name from public.users where lower(email) = lower(v_ident) limit 1;
  elsif regexp_replace(v_ident, '[\s\-+]', '', 'g') ~ '^\d{6,}$' then
    select id, name into v_target, v_name from public.users
     where regexp_replace(coalesce(phone, ''), '\D', '', 'g') like '%' || right(v_digits, 10)
     limit 1;
  else
    select id, name into v_target, v_name from public.users
     where lower(alias) = lower(ltrim(v_ident, '@'))
     limit 1;
  end if;

  if v_target is null then
    raise exception 'No STRYT account found for that mobile number, email, or username.';
  end if;
  if v_target = v_uid then
    raise exception 'You already own this business.';
  end if;

  update public.business_access_sessions
     set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
   where business_id = p_business_id and grantee_user_id = v_target
     and status in ('PENDING', 'ACTIVE')
     and expires_at is not null and expires_at <= now();

  select id into v_session_id
  from public.business_access_sessions
  where business_id = p_business_id and grantee_user_id = v_target
    and status in ('PENDING', 'ACTIVE')
  order by requested_at desc, id desc
  limit 1 for update;

  if v_session_id is not null then
    update public.business_access_sessions
       set status = 'ACTIVE', decided_at = now(), expires_at = null,
           access_level = 'SCOPED', scopes = v_scopes
     where id = v_session_id;
  else
    insert into public.business_access_sessions
      (business_id, grantee_user_id, status, decided_at, expires_at, access_level, scopes)
    values (p_business_id, v_target, 'ACTIVE', now(), null, 'SCOPED', v_scopes)
    returning id into v_session_id;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_target, 'QUEUE_UPDATE', 'Team access granted',
            'You can now help manage ' || coalesce(v_biz_name, 'a business') || ' from Switch account.',
            '/account/business-access');
  exception when others then null; end;

  session_id := v_session_id;
  grantee_name := coalesce(v_name, 'User');
  return next;
end $$;
grant execute on function public.grant_team_member_access(text, text, text[]) to authenticated;

-- ── Owner: change an existing ACTIVE session's scopes in place ──
-- Powers "Edit access" on an existing team member without needing their
-- phone/email again (grant_team_member_access re-looks-up by identifier;
-- this instead targets the session directly, owner-checked via the join).
create or replace function public.update_team_member_scopes(p_session_id uuid, p_scopes text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_scopes text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                 where s in ('appointments','queue','catalog','leads')), '{}');
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;
  update public.business_access_sessions s
     set access_level = 'SCOPED', scopes = v_scopes
    from public.businesses b
   where s.id = p_session_id and b.id = s.business_id and b.owner_user_id = v_uid
     and s.status = 'ACTIVE';
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $$;
revoke execute on function public.update_team_member_scopes(uuid, text[]) from public, anon;
grant execute on function public.update_team_member_scopes(uuid, text[]) to authenticated;

-- ── Client-callable: my access level + scopes for one business ─
create or replace function public.my_business_access_scope(p_business_id text)
returns table (access_level text, scopes text[])
language sql security definer stable set search_path = public as $$
  select 'FULL'::text, '{}'::text[]
   where exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = auth.uid()::text)
  union all
  select s.access_level, s.scopes
    from public.business_access_sessions s
   where s.business_id = p_business_id and s.grantee_user_id = auth.uid()::text
     and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now())
   limit 1;
$$;
grant execute on function public.my_business_access_scope(text) to authenticated;
