-- ============================================================
-- Rollback for 20260950_bulk_deal_notifications_v2.sql
-- Restores all replaced objects to their exact production catalog definitions
-- from supabase/snapshots/2026-09-13_after_20260958.sql.
-- ============================================================

-- ── Restore bulk_deal_pledge_join ─────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_deal_pledge_join(p_deal_id text, p_quantity integer DEFAULT 1, p_notes text DEFAULT NULL::text, p_delivery_address text DEFAULT NULL::text)
 RETURNS bulk_deals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_mine integer;
  v_others integer;
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

  update public.bulk_deals
     set pledged_quantity = (select coalesce(sum(quantity), 0) from public.bulk_deal_pledges where deal_id = p_deal_id)
   where id = p_deal_id
  returning * into v_deal;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_deal.owner_user_id, 'BULK_DEAL_PLEDGE', 'New pledge',
      'Someone pledged ' || p_quantity::text || (case when p_quantity = 1 then ' unit' else ' units' end)
        || ' to "' || left(v_deal.title, 60) || '".',
      '/business/' || v_deal.business_id || '/manage/bulk-deals/' || v_deal.id);
  exception when others then null;
  end;

  return v_deal;
end
$function$
;
GRANT EXECUTE ON FUNCTION public.bulk_deal_pledge_join(p_deal_id text, p_quantity integer, p_notes text, p_delivery_address text) TO authenticated, postgres, service_role;

-- ── Restore bulk_deal_pledge_claim_deposit ─────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_deal_pledge_claim_deposit(p_deal_id text, p_method text, p_reference text DEFAULT NULL::text)
 RETURNS bulk_deal_pledges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledge public.bulk_deal_pledges%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI','CASH') then raise exception 'INVALID_METHOD'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.closed_at is not null then raise exception 'DEAL_CLOSED'; end if;

  select * into v_pledge from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = v_uid for update;
  if not found then raise exception 'NOT_PLEDGED'; end if;
  if v_pledge.deposit_status not in ('UNPAID','REJECTED') then raise exception 'INVALID_TRANSITION'; end if;

  if v_deal.deposit_amount is null then raise exception 'NO_DEPOSIT_REQUIRED'; end if;

  update public.bulk_deal_pledges
     set deposit_method = p_method,
         deposit_status = 'PENDING_CONFIRM',
         deposit_amount = v_deal.deposit_amount,
         deposit_reference = nullif(left(trim(coalesce(p_reference,'')), 200), '')
   where deal_id = p_deal_id and user_id = v_uid
  returning * into v_pledge;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_deal.owner_user_id, 'BULK_DEAL_DEPOSIT_CLAIMED', 'Deposit claim to verify',
      'A pledger says they paid the ₹' || v_deal.deposit_amount::text
        || ' deposit for "' || left(v_deal.title, 60) || '" — confirm or reject.',
      '/business/' || v_deal.business_id || '/manage/bulk-deals/' || v_deal.id);
  exception when others then null;
  end;

  return v_pledge;
end
$function$
;
GRANT EXECUTE ON FUNCTION public.bulk_deal_pledge_claim_deposit(p_deal_id text, p_method text, p_reference text) TO authenticated, postgres, service_role;

-- ── Restore bulk_deal_pledge_confirm_deposit ─────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_deal_pledge_confirm_deposit(p_deal_id text, p_pledger_user_id text)
 RETURNS bulk_deal_pledges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledge public.bulk_deal_pledges%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if not public.has_business_access(v_deal.business_id, v_uid) then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_pledge from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = p_pledger_user_id for update;
  if not found then raise exception 'PLEDGE_NOT_FOUND'; end if;
  if v_pledge.deposit_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.bulk_deal_pledges set deposit_status = 'PAID'
   where deal_id = p_deal_id and user_id = p_pledger_user_id
  returning * into v_pledge;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (p_pledger_user_id, 'BULK_DEAL_DEPOSIT_CONFIRMED', 'Deposit confirmed',
          'Your deposit for "' || v_deal.title || '" was confirmed.', '/business/' || v_deal.business_id);

  -- The UPDATE above already fired trg_check_bulk_deal_target (it watches
  -- deposit_status) — this is exactly the moment a pledge starts counting
  -- toward MOQ, and the trigger, not this function, is what checks it.

  return v_pledge;
end
$function$
;
GRANT EXECUTE ON FUNCTION public.bulk_deal_pledge_confirm_deposit(p_deal_id text, p_pledger_user_id text) TO authenticated, postgres, service_role;

-- ── Restore bulk_deal_pledge_reject_deposit ─────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_deal_pledge_reject_deposit(p_deal_id text, p_pledger_user_id text)
 RETURNS bulk_deal_pledges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledge public.bulk_deal_pledges%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if not public.has_business_access(v_deal.business_id, v_uid) then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_pledge from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = p_pledger_user_id for update;
  if not found then raise exception 'PLEDGE_NOT_FOUND'; end if;
  if v_pledge.deposit_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.bulk_deal_pledges set deposit_status = 'REJECTED'
   where deal_id = p_deal_id and user_id = p_pledger_user_id
  returning * into v_pledge;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (p_pledger_user_id, 'BULK_DEAL_DEPOSIT_REJECTED', 'Couldn''t verify your deposit',
          'The business could not verify your deposit for "' || v_deal.title || '". You can try again.', '/business/' || v_deal.business_id);

  return v_pledge;
end
$function$
;
GRANT EXECUTE ON FUNCTION public.bulk_deal_pledge_reject_deposit(p_deal_id text, p_pledger_user_id text) TO authenticated, postgres, service_role;

-- ── Restore _bulk_deal_close_internal ─────────────────────────
CREATE OR REPLACE FUNCTION public._bulk_deal_close_internal(p_deal_id text, p_trigger text, p_outcome text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deal public.bulk_deals%rowtype;
  v_paid_qty integer;
  v_unit_price numeric;
  v_tier jsonb;
  v_deposit_paid numeric;
  v_balance_due numeric;
  m record;
begin
  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.closed_at is not null then return; end if; -- already closed

  -- BLK-1: Count pledges where deposit was PAID OR deal had no deposit requirement
  select coalesce(sum(quantity), 0) into v_paid_qty
    from public.bulk_deal_pledges
   where deal_id = p_deal_id
     and (v_deal.deposit_amount is null or v_deal.deposit_amount = 0 or deposit_status = 'PAID');

  if p_outcome is null and v_paid_qty >= v_deal.moq then
    p_outcome := 'FULFILLED';
  end if;

  update public.bulk_deals set closed_at = now(), close_outcome = p_outcome where id = p_deal_id;

  if p_outcome = 'FULFILLED' then
    select t into v_tier
      from jsonb_array_elements(coalesce(v_deal.tiers, '[]'::jsonb)) as t
     where (t->>'minQty')::numeric <= v_paid_qty
     order by (t->>'minQty')::numeric desc
     limit 1;
    v_unit_price := coalesce((v_tier->>'unitPrice')::numeric, v_deal.regular_price);

    for m in
      select user_id, quantity, deposit_amount_paid
        from public.bulk_deal_pledges
       where deal_id = p_deal_id
         and (v_deal.deposit_amount is null or v_deal.deposit_amount = 0 or deposit_status = 'PAID')
    loop
      v_deposit_paid := coalesce(m.deposit_amount_paid, 0);
      v_balance_due := greatest(0, (m.quantity * coalesce(v_unit_price, 0)) - v_deposit_paid);

      insert into public.bulk_deal_tokens (
        token_code, deal_id, holder_user_id, issuer_user_id, business_id,
        quantity, unit_price, item_label, deposit_paid, balance_due
      ) values (
        'STRYT-D-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)),
        p_deal_id, m.user_id, v_deal.owner_user_id, v_deal.business_id,
        m.quantity, v_unit_price, v_deal.title, v_deposit_paid, v_balance_due
      )
      on conflict (deal_id, holder_user_id) do update
        set unit_price = excluded.unit_price,
            deposit_paid = excluded.deposit_paid,
            balance_due = excluded.balance_due;

      insert into public.notifications (user_id, type, title, body, deep_link)
      values (m.user_id, 'BULK_DEAL_UNLOCKED', 'Claim pass ready — "' || v_deal.title || '"',
              'The campaign closed and hit its target — your claim pass is ready.', '/community/activity');
    end loop;

  elsif p_outcome = 'REFUNDED' then
    for m in select user_id from public.bulk_deal_pledges where deal_id = p_deal_id and deposit_status = 'PAID' loop
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (m.user_id, 'BULK_DEAL_REFUNDED', '"' || v_deal.title || '" didn''t reach its target',
              'The business will refund your deposit directly.', '/business/' || v_deal.business_id);
    end loop;
  end if;
end;
$function$
;
GRANT EXECUTE ON FUNCTION public._bulk_deal_close_internal(p_deal_id text, p_trigger text, p_outcome text) TO anon, authenticated, postgres, service_role, PUBLIC;

-- ── Restore bulk_deal_extend ─────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_deal_extend(p_deal_id text, p_new_closes_at timestamp with time zone)
 RETURNS bulk_deals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledger record;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  -- BLK-3: Support delegated team member with catalog scope
  if v_deal.owner_user_id <> v_uid
     and not public.has_business_scope(v_deal.business_id, v_uid, 'catalog')
     and not public.is_admin(v_uid) then
    raise exception 'NOT_OWNER';
  end if;

  if v_deal.close_outcome is not null then raise exception 'DEAL_ALREADY_RESOLVED'; end if;
  if p_new_closes_at <= now() then raise exception 'DEADLINE_MUST_BE_FUTURE'; end if;

  update public.bulk_deals set closes_at = p_new_closes_at, closed_at = null where id = p_deal_id
  returning * into v_deal;

  for v_pledger in select user_id from public.bulk_deal_pledges where deal_id = p_deal_id loop
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_pledger.user_id, 'BULK_DEAL_EXTENDED', '"' || v_deal.title || '" got more time',
            'The business extended this campaign — it''s still collecting pledges.', '/business/' || v_deal.business_id);
  end loop;

  return v_deal;
end;
$function$
;
GRANT EXECUTE ON FUNCTION public.bulk_deal_extend(p_deal_id text, p_new_closes_at timestamp with time zone) TO authenticated, postgres, service_role;

-- ── Restore bulk_deal_delete ─────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_deal_delete(p_deal_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledger text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  if v_deal.owner_user_id <> v_uid
     and not public.has_business_scope(v_deal.business_id, v_uid, 'catalog')
     and not public.is_admin(v_uid) then
    raise exception 'NOT_ALLOWED';
  end if;

  -- BLK-2: Prevent deleting campaign if active unredeemed passes exist
  if exists (
    select 1 from public.bulk_deal_tokens
    where deal_id = p_deal_id and status = 'ISSUED'
  ) then
    raise exception 'CANNOT_DELETE_ACTIVE_TOKENS';
  end if;

  for v_pledger in
    select user_id from public.bulk_deal_pledges
    where deal_id = p_deal_id and deposit_status = 'PAID'
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_pledger, 'BULK_DEAL_DEPOSIT_REJECTED', 'Campaign cancelled',
        'The business removed "' || left(v_deal.title, 60) || '" — your paid deposit needs to be sorted out with them directly.',
        '/business/' || v_deal.business_id);
    exception when others then null;
    end;
  end loop;

  delete from public.bulk_deals where id = p_deal_id;
end;
$function$
;
GRANT EXECUTE ON FUNCTION public.bulk_deal_delete(p_deal_id text) TO authenticated, postgres, service_role;

-- ── Restore sync_request_me_too ─────────────────────────
CREATE OR REPLACE FUNCTION public.sync_request_me_too()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  req_owner text;
  req_title text;
  req_is_group_buy boolean;
  req_group_target int;
  new_count int;
begin
  if tg_op = 'INSERT' then
    update public.requests
       set me_too_count = coalesce(me_too_count, 0) + 1
     where id = new.request_id
    returning requester_user_id, title, is_group_buy, group_buy_target, me_too_count
      into req_owner, req_title, req_is_group_buy, req_group_target, new_count;

    if req_owner is not null and req_owner <> new.user_id then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        req_owner, 'ME_TOO', 'Someone said "me too"',
        'A neighbor needs "' || coalesce(req_title, 'your request') || '" too.',
        '/request/' || new.request_id,
        case when req_is_group_buy and req_group_target is not null
          then jsonb_build_object('progressCurrent', new_count, 'progressTarget', req_group_target, 'tone', 'brand')
          else null end
      );
    end if;

    if req_is_group_buy and req_group_target is not null and new_count = req_group_target then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        req_owner, 'GROUP_BUY_UNLOCKED', 'Group buy unlocked!',
        req_group_target || ' neighbors joined "' || coalesce(req_title, 'your request') || '" — bulk price unlocked.',
        '/request/' || new.request_id,
        jsonb_build_object('progressCurrent', new_count, 'progressTarget', req_group_target, 'statusPill', 'Unlocked', 'tone', 'success')
      );
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    update public.requests
       set me_too_count = greatest(0, coalesce(me_too_count, 0) - 1)
     where id = old.request_id;
    return old;
  end if;
  return null;
end $function$
;
GRANT EXECUTE ON FUNCTION public.sync_request_me_too() TO authenticated, postgres, service_role;

notify pgrst, 'reload schema';
