-- ============================================================
-- 20260827 — Bulk deal checkout, quota enforcement, fulfillment modes
--
-- Closes the gaps left by 20260826:
--   1. bulk_deal_order() — the actual BUY path. Resolves the tier price
--      SERVER-side (never trusts a client-sent price), enforces MOQ, and
--      decrements available_quota under a row lock so a deal can't oversell.
--      Creates an appointments row so the order lands in the console the
--      business already uses, exactly like appointment_create_walk_in_payment.
--   2. Fulfillment modes stop being decorative: CENTRAL_DROP passes carry a
--      collection PIN, DOORSTEP pledges carry a delivery address.
-- ============================================================

-- ── Fulfillment-mode data ───────────────────────────────────

alter table public.request_me_toos
  add column if not exists delivery_address text;

alter table public.group_buy_tokens
  -- Only set for CENTRAL_DROP: at a society gate there's no merchant scanner,
  -- the coordinator reads a short PIN off the member's phone instead.
  add column if not exists pickup_pin text;

create or replace function public.group_buy_join(
  p_request_id text, p_quantity integer default 1, p_notes text default null,
  p_delivery_address text default null
) returns public.requests
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_req public.requests%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;

  select * into v_req from public.requests where id = p_request_id;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'OPEN' then raise exception 'REQUEST_CLOSED'; end if;

  -- A doorstep group buy is undeliverable without an address, so it's
  -- required at pledge time rather than chased down after the deal closes.
  if v_req.fulfillment_type = 'DOORSTEP'
     and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;

  insert into public.request_me_toos (request_id, user_id, quantity, notes, delivery_address)
  values (p_request_id, v_uid, p_quantity,
          nullif(left(trim(coalesce(p_notes,'')), 300), ''),
          nullif(left(trim(coalesce(p_delivery_address,'')), 400), ''))
  on conflict (request_id, user_id) do update
    set quantity = excluded.quantity,
        notes = excluded.notes,
        delivery_address = excluded.delivery_address;

  update public.requests
     set me_too_count = (select count(*) from public.request_me_toos where request_id = p_request_id)
   where id = p_request_id
  returning * into v_req;

  return v_req;
end
$$;

revoke execute on function public.group_buy_join(text, integer, text, text) from public, anon;
grant execute on function public.group_buy_join(text, integer, text, text) to authenticated;

-- Re-issued so CENTRAL_DROP passes get a collection PIN.
create or replace function public.group_buy_issue_tokens(
  p_request_id text, p_agreement_id text, p_business_id text default null,
  p_unit_price numeric default null, p_valid_until timestamptz default null
) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_req public.requests%rowtype;
  v_agr public.agreements%rowtype;
  v_issued integer := 0;
  m record;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_req from public.requests where id = p_request_id;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.requester_user_id <> v_uid then raise exception 'NOT_INITIATOR'; end if;

  select * into v_agr from public.agreements where id = p_agreement_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  for m in
    select user_id, quantity from public.request_me_toos where request_id = p_request_id
    union
    select v_req.requester_user_id, coalesce(
      (select quantity from public.request_me_toos
        where request_id = p_request_id and user_id = v_req.requester_user_id), 1)
  loop
    begin
      insert into public.group_buy_tokens (
        token_code, agreement_id, request_id, holder_user_id, issuer_user_id,
        business_id, quantity, unit_price, item_label, valid_until, pickup_pin
      ) values (
        'STRYT-' || upper(substring(md5(gen_random_uuid()::text) from 1 for 4))
                 || '-' || upper(substring(md5(gen_random_uuid()::text) from 1 for 4)),
        p_agreement_id, p_request_id, m.user_id, v_uid,
        p_business_id, coalesce(m.quantity, 1),
        coalesce(p_unit_price, v_agr.agreed_price), v_req.title, p_valid_until,
        case when v_req.fulfillment_type = 'CENTRAL_DROP'
             then lpad((floor(random() * 10000))::int::text, 4, '0')
             else null end
      );
      v_issued := v_issued + 1;
    exception when unique_violation then
      null;
    end;
  end loop;

  update public.requests set group_agreement_id = p_agreement_id where id = p_request_id;

  insert into public.notifications (user_id, type, title, body, deep_link)
  select mt.user_id, 'GROUP_BUY_UNLOCKED', 'Group buy confirmed',
         'Your claim pass for "' || v_req.title || '" is ready',
         '/request/' || p_request_id
    from public.request_me_toos mt
   where mt.request_id = p_request_id and mt.user_id <> v_uid;

  return v_issued;
end
$$;

revoke execute on function public.group_buy_issue_tokens(text, text, text, numeric, timestamptz) from public, anon;
grant execute on function public.group_buy_issue_tokens(text, text, text, numeric, timestamptz) to authenticated;

-- ── The buy path ────────────────────────────────────────────

create or replace function public.bulk_deal_order(
  p_deal_id text, p_quantity integer, p_method text,
  p_reference text default null, p_fulfillment text default 'STORE_PICKUP',
  p_address text default null
) returns public.appointments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_biz public.businesses%rowtype;
  v_customer_name text;
  v_customer_avatar text;
  v_unit_price numeric;
  v_total numeric;
  v_tier jsonb;
  v_apt public.appointments%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI','CASH') then raise exception 'INVALID_METHOD'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;

  -- Locked for the whole transaction: two buyers racing for the last units of
  -- a limited deal must not both succeed.
  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.status <> 'ACTIVE' then raise exception 'DEAL_INACTIVE'; end if;
  if p_quantity < v_deal.moq then raise exception 'BELOW_MOQ'; end if;

  if v_deal.available_quota is not null and p_quantity > v_deal.available_quota then
    raise exception 'INSUFFICIENT_QUOTA';
  end if;

  select * into v_biz from public.businesses where id = v_deal.business_id;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  if v_biz.owner_user_id = v_uid then raise exception 'OWNER_CANNOT_SELF_BUY'; end if;

  -- Price is resolved HERE, from the stored tier table — a client-supplied
  -- price would let a buyer name their own discount.
  select t into v_tier
    from jsonb_array_elements(coalesce(v_deal.tiers, '[]'::jsonb)) as t
   where (t->>'minQty')::numeric <= p_quantity
   order by (t->>'minQty')::numeric desc
   limit 1;

  v_unit_price := coalesce((v_tier->>'unitPrice')::numeric, v_deal.regular_price);
  v_total := v_unit_price * p_quantity;

  select coalesce(nullif(trim(u.name), ''), 'Customer'), u.avatar
    into v_customer_name, v_customer_avatar
    from public.users u where u.id = v_uid;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label,
    package_id, package_name, package_price, status, is_walk_in,
    payment_method, payment_status, payment_amount, payment_reference,
    -- NOT party_size: that means "people occupying a booking slot" and is
    -- policed by enforce_slot_capacity. A bulk order is ONE slot for N units,
    -- so the quantity lives on the line item below, not here — otherwise a
    -- 15-unit order reads as a 15-person booking and trips the capacity cap.
    fulfillment_type, delivery_address_line
  ) values (
    'BUSINESS', v_deal.business_id, v_biz.owner_user_id, v_biz.name, v_biz.cover_image,
    v_uid, v_customer_name, v_customer_avatar,
    now(), 'Bulk order', 'To confirm',
    'bulk_deal', left(v_deal.title || ' × ' || p_quantity, 200), v_total, 'PENDING', false,
    p_method, 'PENDING_CONFIRM', v_total,
    nullif(left(trim(coalesce(p_reference,'')), 200), ''),
    case when p_fulfillment = 'DOORSTEP' then 'DELIVERY' else 'IN_STORE' end,
    nullif(left(trim(coalesce(p_address,'')), 400), '')
  ) returning * into v_apt;

  -- Line items are their own table, not a column — one row here so the order
  -- renders with a proper breakdown in the console rather than just a total.
  insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
  values (v_apt.id, v_deal.catalog_item_id, v_deal.title, v_unit_price, p_quantity);

  -- Only after the order is safely written — if the insert had raised, the
  -- lock would roll back and the quota would be untouched.
  if v_deal.available_quota is not null then
    update public.bulk_deals
       set available_quota = available_quota - p_quantity
     where id = p_deal_id;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    v_biz.owner_user_id, 'SYSTEM', 'New bulk order',
    v_customer_name || ' ordered ' || p_quantity || ' × ' || v_deal.title,
    '/business/' || v_deal.business_id || '/manage/appointments'
  );

  return v_apt;
end
$$;

revoke execute on function public.bulk_deal_order(text, integer, text, text, text, text) from public, anon;
grant execute on function public.bulk_deal_order(text, integer, text, text, text, text) to authenticated;

-- Read-only price quote so the sheet can show a live total that is guaranteed
-- to match what checkout will actually charge (same tier logic, one source).
create or replace function public.bulk_deal_quote(p_deal_id text, p_quantity integer)
returns table (unit_price numeric, total numeric, regular_total numeric, saved numeric, meets_moq boolean, quota_ok boolean)
language sql stable security definer
set search_path = public
as $$
  select
    coalesce((
      select (t->>'unitPrice')::numeric
        from jsonb_array_elements(coalesce(d.tiers, '[]'::jsonb)) as t
       where (t->>'minQty')::numeric <= p_quantity
       order by (t->>'minQty')::numeric desc limit 1
    ), d.regular_price) as unit_price,
    coalesce((
      select (t->>'unitPrice')::numeric
        from jsonb_array_elements(coalesce(d.tiers, '[]'::jsonb)) as t
       where (t->>'minQty')::numeric <= p_quantity
       order by (t->>'minQty')::numeric desc limit 1
    ), d.regular_price) * p_quantity as total,
    d.regular_price * p_quantity as regular_total,
    greatest(0, d.regular_price * p_quantity - coalesce((
      select (t->>'unitPrice')::numeric
        from jsonb_array_elements(coalesce(d.tiers, '[]'::jsonb)) as t
       where (t->>'minQty')::numeric <= p_quantity
       order by (t->>'minQty')::numeric desc limit 1
    ), d.regular_price) * p_quantity) as saved,
    p_quantity >= d.moq as meets_moq,
    (d.available_quota is null or p_quantity <= d.available_quota) as quota_ok
  from public.bulk_deals d
  where d.id = p_deal_id;
$$;

revoke execute on function public.bulk_deal_quote(text, integer) from public;
grant execute on function public.bulk_deal_quote(text, integer) to authenticated, anon;
