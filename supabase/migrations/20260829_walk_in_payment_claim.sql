-- ============================================================
-- 20260829 — Always-visible walk-in payment on the business profile
--
-- appointment_create_walk_in_payment: a real, signed-in customer with no
-- prior booking/queue relationship to a business can pay for a purchase made
-- in person, choosing catalog item(s) client-side and submitting the
-- condensed total here. Neither existing walk-in path fits this:
--   - appointment_create_walk_in is owner-only (stamps the OWNER's uid as
--     customer_user_id) — can't be called by the customer themselves.
--   - appointment_claim_payment explicitly rejects is_walk_in=true rows, and
--     appointment_create rejects any p_scheduled_for <= now() — so a pure
--     client-side combination of the two can't represent "pay right now".
--
-- This RPC creates the row AND claims payment in one atomic insert (the
-- caller *is* the claimant — there's no separate claim step to skip):
-- customer_user_id = auth.uid() (the real customer, never the owner),
-- is_walk_in = false (deliberate — this is what lets appointment_confirm_
-- payment / appointment_reject_payment pick these rows up completely
-- unchanged, with zero new owner-side code), payment_status set directly to
-- PENDING_CONFIRM. package_id = 'walkin_cart' is a sentinel distinct from
-- the existing order-ahead checkout()'s 'cart', for staff-side debugging.
-- ============================================================

create or replace function public.appointment_create_walk_in_payment(
  p_target_id text, p_package_name text, p_package_price numeric,
  p_method text, p_reference text default null
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
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;
  if p_package_price is null or p_package_price <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if nullif(trim(coalesce(p_package_name, '')), '') is null then raise exception 'PACKAGE_NAME_REQUIRED'; end if;

  select b.owner_user_id, b.name, b.cover_image
  into v_owner, v_target_name, v_target_avatar
  from public.businesses b where b.id = p_target_id;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;
  -- An owner can't "buy from themselves" through this path — they already
  -- have appointment_create_walk_in / appointment_record_walk_in_payment.
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

  return v_appointment;
end
$$;

revoke execute on function public.appointment_create_walk_in_payment(text, text, numeric, text, text) from public, anon;
grant execute on function public.appointment_create_walk_in_payment(text, text, numeric, text, text) to authenticated;
