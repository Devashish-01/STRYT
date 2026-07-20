-- ============================================================
-- 20260835 — Appointment line items + real per-item inventory reservation
--
-- Closes the gap where booking never reliably decremented catalog stock:
-- cart/multi-item checkout collapsed to a single synthetic package_id
-- ("cart"), which reserve_catalog_item(p_item_id) can never match, so
-- per-item quantities were silently discarded and stock never moved.
-- Provider bookings (hard-gated to BUSINESS-only client-side) and both
-- walk-in paths had the same class of gap.
--
-- appointment_items is purely additive: appointments.package_id/name/price
-- stay exactly as-is (every existing screen keeps reading those flat fields
-- unchanged) as a human-readable order summary; the new table holds the real
-- per-item/quantity detail a cart or multi-unit purchase actually has.
--
-- reserve_catalog_item(text) (20260804) is left untouched/unused by new code
-- — nothing currently calling it breaks. New code exclusively calls the
-- plural reserve_catalog_items(jsonb) below, which can loop multiple items
-- and — unlike the old best-effort version — hard-fails a FINITE item that's
-- genuinely out of stock instead of silently flooring at zero and letting
-- the booking through anyway.
--
-- Run manually in the Supabase SQL editor (this repo's established pattern —
-- migrations here are applied by the project owner, not auto-run).
-- ============================================================

-- ── 1 · appointment_items ─────────────────────────────────────
create table if not exists public.appointment_items (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  text not null references public.appointments(id) on delete cascade,
  -- No FK to catalog_items: that table was created via Studio schema drift
  -- with an inconsistent PK type (see 20260804's own comment), so — exactly
  -- like appointments.package_id already does — this is stored loose and
  -- matched with an ::text cast at read time.
  catalog_item_id text,
  item_name       text not null,
  unit_price      numeric not null default 0,
  quantity        integer not null check (quantity > 0),
  created_at      timestamptz not null default now()
);

create index if not exists appointment_items_appointment_idx on public.appointment_items (appointment_id);
create index if not exists appointment_items_catalog_item_idx on public.appointment_items (catalog_item_id);

alter table public.appointment_items enable row level security;

-- Same read predicate as appointments' own appt_select policy (20260701) —
-- a line item is only ever as visible as its parent appointment row.
do $$ begin
  create policy appointment_items_select on public.appointment_items
    for select
    using (
      exists (
        select 1 from public.appointments a
        where a.id = appointment_items.appointment_id
          and auth.uid()::text in (a.customer_user_id, a.target_owner_user_id)
      )
    );
exception when duplicate_object then null; end $$;

-- No insert/update/delete policy at all: every write happens inside the
-- SECURITY DEFINER functions below, never directly from the client.
revoke all on public.appointment_items from public, anon;
grant select on public.appointment_items to authenticated;

-- ── 2 · reserve_catalog_items(jsonb) ──────────────────────────
-- p_items shape: [{"catalog_item_id": "...", "quantity": 2, ...}, ...]
-- (extra keys like item_name/unit_price are ignored here — this function
-- only touches catalog_items stock, not appointment_items).
create or replace function public.reserve_catalog_items(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_row public.catalog_items%rowtype;
begin
  if p_items is null then return; end if;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(catalog_item_id text, quantity int)
  loop
    if v_item.catalog_item_id is null or coalesce(v_item.quantity, 0) <= 0 then
      continue;
    end if;

    select * into v_row from public.catalog_items
      where id::text = v_item.catalog_item_id
      for update;

    -- Unknown id, or an always-available (INFINITE) item: nothing to reserve
    -- — matches the original single-item function's safe no-op semantics.
    if not found or v_row.inventory_type is distinct from 'FINITE' then
      continue;
    end if;

    if coalesce(v_row.quantity, 0) < v_item.quantity then
      raise exception 'INSUFFICIENT_STOCK: %', v_row.name;
    end if;

    update public.catalog_items
       set quantity = v_row.quantity - v_item.quantity,
           stock_status = case when v_row.quantity - v_item.quantity <= 0 then 'OUT_OF_STOCK' else stock_status end
     where id = v_row.id;
  end loop;
end
$$;

revoke all on function public.reserve_catalog_items(jsonb) from public, anon;
grant execute on function public.reserve_catalog_items(jsonb) to authenticated;

-- ── 3 · appointment_create: accept an optional real cart ──────
-- Drop the pre-p_items signature first: create-or-replace can't widen an
-- existing function's parameter list in place, so without this it would
-- silently create a second overload instead of replacing — leaving both
-- live and making any RPC call that omits p_items ambiguous.
drop function if exists public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric);
create or replace function public.appointment_create(
  p_target_type text, p_target_id text, p_scheduled_for timestamptz,
  p_date_label text, p_time_label text, p_notes text default null,
  p_photo_url text default null, p_package_id text default null,
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
  v_customer_name text;
  v_customer_avatar text;
  v_appointment public.appointments%rowtype;
  v_items jsonb := p_items;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name, b.cover_image
    into v_owner, v_target_name, v_target_avatar
    from public.businesses b where b.id = p_target_id;
  else
    select p.user_id, p.display_name, p.avatar
    into v_owner, v_target_name, v_target_avatar
    from public.providers p where p.id = p_target_id;
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;

  select coalesce(nullif(trim(u.name), ''), 'Customer'), u.avatar
  into v_customer_name, v_customer_avatar
  from public.users u where u.id = v_uid;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label, notes, photo_url,
    package_id, package_name, package_price, status
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, v_customer_name, v_customer_avatar,
    p_scheduled_for, p_date_label, p_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    p_package_id, p_package_name, p_package_price, 'PENDING'
  ) returning * into v_appointment;

  -- No structured cart passed → fall back to the single package as one
  -- implicit line item, so every existing single-package call site (direct
  -- bookings, provider bookings — the BUSINESS-only gate that used to live
  -- client-side is gone, this covers both target types identically) gets
  -- correct reservation for free.
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

    -- Raises INSUFFICIENT_STOCK on a genuinely sold-out FINITE item, which
    -- rolls back this entire transaction (the appointment row above included)
    -- — a real fix, not just cosmetic: today a sold-out item can still be
    -- "booked", it just silently floors at zero.
    perform public.reserve_catalog_items(v_items);
  end if;

  return v_appointment;
end
$$;

revoke all on function public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb) from public, anon;
grant execute on function public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb) to authenticated;

-- ── 4 · appointment_create_walk_in: same treatment ────────────
drop function if exists public.appointment_create_walk_in(text, text, text, text, timestamptz, text, text, text, text, numeric);
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
    v_allowed := public.has_business_access(p_target_id, v_uid);
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

revoke all on function public.appointment_create_walk_in(text, text, text, text, timestamptz, text, text, text, text, numeric, jsonb) from public, anon;
grant execute on function public.appointment_create_walk_in(text, text, text, text, timestamptz, text, text, text, text, numeric, jsonb) to authenticated;

-- ── 5 · appointment_create_walk_in_payment: same treatment ────
drop function if exists public.appointment_create_walk_in_payment(text, text, numeric, text, text);
create or replace function public.appointment_create_walk_in_payment(
  p_target_id text, p_package_name text, p_package_price numeric,
  p_method text, p_reference text default null, p_items jsonb default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_target_avatar text;
  v_customer_name text;
  v_customer_avatar text;
  v_appointment public.appointments%rowtype;
  v_items jsonb := p_items;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;
  if p_package_price is null or p_package_price <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if nullif(trim(coalesce(p_package_name, '')), '') is null then raise exception 'PACKAGE_NAME_REQUIRED'; end if;

  select b.owner_user_id, b.name, b.cover_image
  into v_owner, v_target_name, v_target_avatar
  from public.businesses b where b.id = p_target_id;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;
  if v_owner = v_uid then raise exception 'OWNER_CANNOT_SELF_PAY'; end if;

  select coalesce(nullif(trim(u.name), ''), 'Customer'), u.avatar
  into v_customer_name, v_customer_avatar
  from public.users u where u.id = v_uid;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label,
    package_id, package_name, package_price, status, is_walk_in,
    payment_method, payment_status, payment_amount, payment_reference
  ) values (
    'BUSINESS', p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, v_customer_name, v_customer_avatar,
    now(), 'Today', 'Walk-in',
    'walkin_cart', left(trim(p_package_name), 200), p_package_price, 'ACCEPTED', false,
    p_method, 'PENDING_CONFIRM', p_package_price,
    nullif(left(trim(coalesce(p_reference, '')), 200), '')
  ) returning * into v_appointment;

  -- No single-package fallback here: 'walkin_cart' is a sentinel, never a
  -- real catalog_items id, so there's nothing meaningful to synthesize when
  -- the caller doesn't pass structured items (a single-item self-pay walk-in
  -- purchase still passes p_items with one entry from the client).
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

revoke all on function public.appointment_create_walk_in_payment(text, text, numeric, text, text, jsonb) from public, anon;
grant execute on function public.appointment_create_walk_in_payment(text, text, numeric, text, text, jsonb) to authenticated;

-- ── 6 · reschedule_appointment: carry line items over, don't
--        reserve a second time ──────────────────────────────
-- A reschedule is the *same* purchase moved to a new slot, not a new order —
-- stock for it was already reserved when the original was first created.
-- Re-running reserve_catalog_items here would double-decrement. Instead this
-- just copies the original's appointment_items rows onto the new row.
create or replace function public.reschedule_appointment(
  p_original_id text, p_scheduled_for timestamptz,
  p_date_label text, p_time_label text, p_notes text default null,
  p_photo_url text default null, p_package_id text default null,
  p_package_name text default null, p_package_price numeric default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_original public.appointments%rowtype;
  v_new public.appointments%rowtype;
  v_changed integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;

  select * into v_original from public.appointments
  where id = p_original_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if v_original.customer_user_id is distinct from v_uid or v_original.is_walk_in then
    raise exception 'NOT_YOUR_BOOKING';
  end if;
  if v_original.status not in ('PENDING', 'ACCEPTED') then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.appointments
  set status = 'CANCELLED', cancelled_by = 'CUSTOMER',
      response_note = coalesce(response_note, 'Rescheduled')
  where id = p_original_id and status = v_original.status;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'INVALID_TRANSITION'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label, notes, photo_url,
    package_id, package_name, package_price, rescheduled_from
  ) values (
    v_original.target_type, v_original.target_id, v_original.target_owner_user_id,
    v_original.target_name, v_original.target_avatar,
    v_uid, v_original.customer_name, v_original.customer_avatar,
    p_scheduled_for, p_date_label, p_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    p_package_id, p_package_name, p_package_price, p_original_id
  ) returning * into v_new;

  insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
  select v_new.id, catalog_item_id, item_name, unit_price, quantity
  from public.appointment_items
  where appointment_id = p_original_id;

  return v_new;
end
$$;

revoke all on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) from public, anon;
grant execute on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) to authenticated;
