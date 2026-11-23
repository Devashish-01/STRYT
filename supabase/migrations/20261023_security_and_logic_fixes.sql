-- Migration: 20261023_security_and_logic_fixes.sql
-- Fixes critical & high security and business logic issues:
-- 1. Revoke public execution of reserve_catalog_items / reserve_catalog_item
-- 2. Prevent deposit bypass in bulk_deal_pledge_join on paid pledges
-- 3. Drop direct client insert policy on proposal_counters
-- 4. Secure confirm_handoff against null handoff codes
-- 5. Cap exponential lockout exponent in _verify_entity_password against integer overflow

-- 1. Revoke public execution of reserve_catalog_items / reserve_catalog_item
REVOKE ALL ON FUNCTION public.reserve_catalog_items(jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_catalog_item(text) FROM public, anon, authenticated;

-- 2. Drop direct client insert policy on proposal_counters
DROP POLICY IF EXISTS pc_insert ON public.proposal_counters;

-- 3. Secure confirm_handoff against null handoff code bypass
CREATE OR REPLACE FUNCTION public.confirm_handoff(p_delivery_id text, p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_attempt public.handoff_attempts%rowtype;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_matches boolean;
  v_clean_code text := nullif(trim(coalesce(p_code, '')), '');
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_row.status not in ('EN_ROUTE', 'ARRIVED') then raise exception 'INVALID_TRANSITION'; end if;

  select * into v_attempt from public.handoff_attempts where delivery_id = p_delivery_id for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    raise exception 'Too many wrong attempts — wait a few minutes and ask the customer to confirm again.';
  end if;

  -- Require both codes to be non-null and non-empty
  if v_row.handoff_code is null or v_clean_code is null then
    v_matches := false;
  else
    v_matches := (v_row.handoff_code = v_clean_code);
  end if;

  if v_matches then
    delete from public.handoff_attempts where delivery_id = p_delivery_id;
    update public.appointment_deliveries
       set handoff_verified = true, status = case when status = 'EN_ROUTE' then 'ARRIVED' else status end
     where id = p_delivery_id;
    return true;
  end if;

  -- Record failed attempt with rate limiting
  insert into public.handoff_attempts (delivery_id, fail_count, last_attempt_at, locked_until)
  values (p_delivery_id, 1, now(), null)
  on conflict (delivery_id) do update
    set fail_count = case
          when handoff_attempts.last_attempt_at <= now() - v_window then 1
          else handoff_attempts.fail_count + 1
        end,
        last_attempt_at = now(),
        locked_until = case
          when (case when handoff_attempts.last_attempt_at <= now() - v_window then 1 else handoff_attempts.fail_count + 1 end) >= v_max_attempts
          then now() + v_window
          else null
        end;

  return false;
end $function$;

REVOKE ALL ON FUNCTION public.confirm_handoff(p_delivery_id text, p_code text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_handoff(p_delivery_id text, p_code text) TO authenticated;


-- 4. Prevent modifying pledged quantity if deposit is already paid or pending confirmation
CREATE OR REPLACE FUNCTION public.bulk_deal_pledge_join(
  p_deal_id text, p_quantity integer default 1, p_notes text default null,
  p_delivery_address text default null
) RETURNS public.bulk_deals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_mine integer;
  v_others integer;
  v_total_pledged integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.status <> 'ACTIVE' then raise exception 'DEAL_NOT_ACTIVE'; end if;
  if v_deal.closed_at is not null then raise exception 'DEAL_CLOSED'; end if;
  if v_deal.owner_user_id = v_uid then raise exception 'OWNER_CANNOT_PLEDGE'; end if;

  if v_deal.fulfillment_type = 'DOORSTEP'
     and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;

  -- Security check: Cannot modify pledge quantity once deposit is paid or being confirmed
  if exists (
    select 1 from public.bulk_deal_pledges
    where deal_id = p_deal_id and user_id = v_uid and deposit_status in ('PAID', 'PENDING_CONFIRM')
      and quantity <> p_quantity
  ) then
    raise exception 'CANNOT_MODIFY_PAID_PLEDGE';
  end if;

  if v_deal.available_quota is not null then
    select quantity into v_mine
      from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = v_uid;
    v_others := greatest(coalesce(v_deal.pledged_quantity, 0) - coalesce(v_mine, 0), 0);
    if v_others + p_quantity > v_deal.available_quota then
      raise exception 'INSUFFICIENT_QUOTA';
    end if;
  end if;

  insert into public.bulk_deal_pledges (deal_id, user_id, quantity, notes, delivery_address)
  values (p_deal_id, v_uid, p_quantity,
          nullif(left(trim(coalesce(p_notes,'')), 300), ''),
          nullif(left(trim(coalesce(p_delivery_address,'')), 400), ''))
  on conflict (deal_id, user_id) do update
    set quantity = excluded.quantity,
        notes = excluded.notes,
        delivery_address = excluded.delivery_address;

  select coalesce(sum(quantity), 0) into v_total_pledged from public.bulk_deal_pledges where deal_id = p_deal_id;

  update public.bulk_deals
     set pledged_quantity = v_total_pledged
   where id = p_deal_id
  returning * into v_deal;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, entity_type, entity_id, metadata)
    values (
      v_deal.owner_user_id,
      'BULK_DEAL_PLEDGE',
      'New deal pledge',
      'Someone joined your bulk deal for ' || v_deal.title || '.',
      '/deals/' || p_deal_id,
      'bulk_deal',
      p_deal_id,
      jsonb_build_object('deal_id', p_deal_id, 'quantity', p_quantity)
    );
  exception when others then
    -- notification failure should not abort join
  end;

  return v_deal;
end $function$;

REVOKE ALL ON FUNCTION public.bulk_deal_pledge_join(text, integer, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bulk_deal_pledge_join(text, integer, text, text) TO authenticated;

-- 5. Cap exponential lockout exponent in _verify_entity_password
CREATE OR REPLACE FUNCTION public._verify_entity_password(
  p_kind text,
  p_entity_id text,
  p_password text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_salt text;
  v_stored_hash text;
  v_input_hash text;
  v_uid text := auth.uid()::text;
  v_attempt public.entity_password_attempts%rowtype;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_max_lock constant interval := interval '24 hours';
  v_lockouts integer := 0;
begin
  if p_kind not in ('business', 'provider') then
    raise exception 'INVALID_ENTITY_KIND';
  end if;

  if p_kind = 'business' then
    select business_password_salt, business_password_hash
      into v_salt, v_stored_hash
      from public.businesses
     where id = p_entity_id;
  else
    select provider_password_salt, provider_password_hash
      into v_salt, v_stored_hash
      from public.providers
     where id = p_entity_id;
  end if;

  if v_salt is null or v_stored_hash is null then
    return false;
  end if;

  if v_uid is not null then
    select * into v_attempt
      from public.entity_password_attempts
     where entity_type = p_kind
       and entity_id = p_entity_id
       and attempter_user_id = v_uid
     for update;

    if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
      return false;
    end if;

    v_lockouts := coalesce(v_attempt.lockout_count, 0);
  end if;

  v_input_hash := encode(digest(v_salt || p_password, 'sha256'), 'hex');

  if v_input_hash = v_stored_hash then
    if v_uid is not null then
      delete from public.entity_password_attempts
       where entity_type = p_kind
         and entity_id = p_entity_id
         and attempter_user_id = v_uid;
    end if;
    return true;
  end if;

  if v_uid is not null then
    insert into public.entity_password_attempts (
      entity_type, entity_id, attempter_user_id, fail_count, lockout_count, last_attempt_at, locked_until
    ) values (
      p_kind, p_entity_id, v_uid, 1, 0, now(), null
    )
    on conflict (entity_type, entity_id, attempter_user_id) do update
      set fail_count = case
          when entity_password_attempts.last_attempt_at <= now() - v_window
            or entity_password_attempts.locked_until is not null
          then 1 else entity_password_attempts.fail_count + 1 end,
        last_attempt_at = now(),
        lockout_count = case
          when (case
            when entity_password_attempts.last_attempt_at <= now() - v_window
              or entity_password_attempts.locked_until is not null
            then 1 else entity_password_attempts.fail_count + 1 end) >= v_max_attempts
          then v_lockouts + 1 else entity_password_attempts.lockout_count end,
        locked_until = case
          when (case
            when entity_password_attempts.last_attempt_at <= now() - v_window
              or entity_password_attempts.locked_until is not null
            then 1 else entity_password_attempts.fail_count + 1 end) >= v_max_attempts
          then now() + least(v_window * (power(2, least(v_lockouts, 10))::integer), v_max_lock)
          else null end;
  end if;

  return false;
end $function$;

REVOKE ALL ON FUNCTION public._verify_entity_password(p_kind text, p_entity_id text, p_password text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._verify_entity_password(p_kind text, p_entity_id text, p_password text) TO authenticated;

