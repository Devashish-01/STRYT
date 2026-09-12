-- ============================================================
-- Migration: 20260950_bulk_deal_notifications_v2.sql
-- Group 4: Bulk Buying Hub, Deals & Group Buying Notifications Overhaul
--
-- Fixes:
-- 1. Entity Scoping: Stamps entity_type = 'BUSINESS' and entity_id on
--    merchant-directed bulk deal notifications (pledge joins and deposit claims).
-- 2. Metadata Enrichment: Enriches BULK_DEAL_PLEDGE, BULK_DEAL_DEPOSIT_CLAIMED,
--    BULK_DEAL_DEPOSIT_CONFIRMED, BULK_DEAL_DEPOSIT_REJECTED, BULK_DEAL_UNLOCKED,
--    BULK_DEAL_REFUNDED, BULK_DEAL_EXTENDED, GROUP_BUY_UNLOCKED, and ME_TOO.
-- 3. Merchant Unlock/Refund Lifecycle: Notifies business owner when campaigns
--    reach target MOQ or close without meeting target.
-- 4. Group Buy Viral Loop: Notifies all "Me Too" neighbors when group buy
--    target is reached and bulk price unlocks.
-- ============================================================

-- ── 1. Bulk Deal Pledge Join (with entity scoping & metadata) ──
create or replace function public.bulk_deal_pledge_join(
  p_deal_id text, p_quantity integer default 1, p_notes text default null,
  p_delivery_address text default null
) returns public.bulk_deals
language plpgsql security definer
set search_path = public
as $$
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
      'New pledge',
      'Someone pledged ' || p_quantity::text || (case when p_quantity = 1 then ' unit' else ' units' end)
        || ' to "' || left(v_deal.title, 60) || '".',
      '/business/' || v_deal.business_id || '/manage/bulk-deals/' || v_deal.id,
      'BUSINESS',
      v_deal.business_id,
      jsonb_build_object(
        'dealId', v_deal.id,
        'dealTitle', v_deal.title,
        'quantity', p_quantity,
        'progressCurrent', v_total_pledged,
        'progressTarget', v_deal.moq,
        'unitPrice', v_deal.regular_price,
        'pledgerUserId', v_uid,
        'targetId', v_deal.business_id,
        'targetType', 'BUSINESS',
        'statusPill', 'New Pledge',
        'tone', 'brand',
        'actions', jsonb_build_array('VIEW_DEAL')
      )
    );
  exception when others then null;
  end;

  return v_deal;
end
$$;

revoke execute on function public.bulk_deal_pledge_join(text, integer, text, text) from public, anon;
grant execute on function public.bulk_deal_pledge_join(text, integer, text, text) to authenticated;


-- ── 2. Bulk Deal Pledge Claim Deposit (with entity scoping & metadata) ──
create or replace function public.bulk_deal_pledge_claim_deposit(
  p_deal_id text, p_method text, p_reference text default null
) returns public.bulk_deal_pledges
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledge public.bulk_deal_pledges%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method is null or p_method not in ('UPI','CASH') then
    raise exception 'INVALID_METHOD';
  end if;

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
    insert into public.notifications (user_id, type, title, body, deep_link, entity_type, entity_id, metadata)
    values (
      v_deal.owner_user_id,
      'BULK_DEAL_DEPOSIT_CLAIMED',
      'Deposit claim to verify',
      'A pledger says they paid the ₹' || v_deal.deposit_amount::text
        || ' deposit for "' || left(v_deal.title, 60) || '" — confirm or reject.',
      '/business/' || v_deal.business_id || '/manage/bulk-deals/' || v_deal.id,
      'BUSINESS',
      v_deal.business_id,
      jsonb_build_object(
        'dealId', v_deal.id,
        'dealTitle', v_deal.title,
        'depositAmount', v_deal.deposit_amount,
        'paymentRef', nullif(left(trim(coalesce(p_reference,'')), 200), ''),
        'paymentMethod', p_method,
        'pledgerUserId', v_uid,
        'targetId', v_deal.business_id,
        'targetType', 'BUSINESS',
        'statusPill', 'Pending Verification',
        'tone', 'warning',
        'actions', jsonb_build_array('CONFIRM_DEPOSIT', 'REJECT_DEPOSIT', 'VIEW_DEAL')
      )
    );
  exception when others then null;
  end;

  return v_pledge;
end
$$;

revoke execute on function public.bulk_deal_pledge_claim_deposit(text, text, text) from public, anon;
grant execute on function public.bulk_deal_pledge_claim_deposit(text, text, text) to authenticated;


-- ── 3. Bulk Deal Pledge Confirm Deposit (enriched metadata) ──
create or replace function public.bulk_deal_pledge_confirm_deposit(p_deal_id text, p_pledger_user_id text)
returns public.bulk_deal_pledges
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledge public.bulk_deal_pledges%rowtype;
  v_paid_qty integer;
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

  select coalesce(sum(quantity), 0) into v_paid_qty
    from public.bulk_deal_pledges
   where deal_id = p_deal_id and deposit_status = 'PAID';

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      p_pledger_user_id,
      'BULK_DEAL_DEPOSIT_CONFIRMED',
      'Deposit confirmed',
      'Your deposit for "' || left(v_deal.title, 60) || '" was confirmed.',
      '/business/' || v_deal.business_id,
      jsonb_build_object(
        'dealId', v_deal.id,
        'dealTitle', v_deal.title,
        'depositAmount', v_pledge.deposit_amount,
        'progressCurrent', v_paid_qty,
        'progressTarget', v_deal.moq,
        'targetId', v_deal.business_id,
        'targetType', 'BUSINESS',
        'statusPill', 'Deposit Paid',
        'tone', 'success',
        'actions', jsonb_build_array('VIEW_DEAL')
      )
    );
  exception when others then null;
  end;

  return v_pledge;
end
$$;

revoke execute on function public.bulk_deal_pledge_confirm_deposit(text, text) from public, anon;
grant execute on function public.bulk_deal_pledge_confirm_deposit(text, text) to authenticated;


-- ── 4. Bulk Deal Pledge Reject Deposit (enriched metadata) ──
create or replace function public.bulk_deal_pledge_reject_deposit(p_deal_id text, p_pledger_user_id text)
returns public.bulk_deal_pledges
language plpgsql security definer
set search_path = public
as $$
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

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      p_pledger_user_id,
      'BULK_DEAL_DEPOSIT_REJECTED',
      'Couldn''t verify your deposit',
      'The business could not verify your deposit for "' || left(v_deal.title, 60) || '". You can try again.',
      '/business/' || v_deal.business_id,
      jsonb_build_object(
        'dealId', v_deal.id,
        'dealTitle', v_deal.title,
        'depositAmount', v_deal.deposit_amount,
        'targetId', v_deal.business_id,
        'targetType', 'BUSINESS',
        'statusPill', 'Deposit Rejected',
        'tone', 'danger',
        'actions', jsonb_build_array('VIEW_DEAL')
      )
    );
  exception when others then null;
  end;

  return v_pledge;
end
$$;

revoke execute on function public.bulk_deal_pledge_reject_deposit(text, text) from public, anon;
grant execute on function public.bulk_deal_pledge_reject_deposit(text, text) to authenticated;


-- ── 5. _bulk_deal_close_internal (enriched pledger & merchant notifications) ──
create or replace function public._bulk_deal_close_internal(
  p_deal_id text, p_trigger text, p_outcome text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_deal public.bulk_deals%rowtype;
  v_paid_qty integer;
  v_unit_price numeric;
  v_tier jsonb;
  v_deposit_paid numeric;
  v_balance_due numeric;
  v_token_code text;
  m record;
begin
  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.closed_at is not null then return; end if; -- already closed

  -- Count pledges where deposit was PAID OR deal had no deposit requirement
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
      v_token_code := 'STRYT-D-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4));

      insert into public.bulk_deal_tokens (
        token_code, deal_id, holder_user_id, issuer_user_id, business_id,
        quantity, unit_price, item_label, deposit_paid, balance_due
      ) values (
        v_token_code,
        p_deal_id, m.user_id, v_deal.owner_user_id, v_deal.business_id,
        m.quantity, v_unit_price, v_deal.title, v_deposit_paid, v_balance_due
      )
      on conflict (deal_id, holder_user_id) do update
        set unit_price = excluded.unit_price,
            deposit_paid = excluded.deposit_paid,
            balance_due = excluded.balance_due
      returning token_code into v_token_code;

      begin
        insert into public.notifications (user_id, type, title, body, deep_link, metadata)
        values (
          m.user_id,
          'BULK_DEAL_UNLOCKED',
          'Claim pass ready — "' || left(v_deal.title, 60) || '"',
          'The campaign closed and hit its target — your claim pass is ready.',
          '/community/activity',
          jsonb_build_object(
            'dealId', p_deal_id,
            'dealTitle', v_deal.title,
            'tokenCode', v_token_code,
            'quantity', m.quantity,
            'unitPrice', v_unit_price,
            'depositAmount', v_deposit_paid,
            'balanceDue', v_balance_due,
            'targetId', v_deal.business_id,
            'targetType', 'BUSINESS',
            'statusPill', 'Claim Pass Ready',
            'tone', 'success',
            'actions', jsonb_build_array('VIEW_CLAIM_PASS', 'SHARE_DEAL')
          )
        );
      exception when others then null;
      end;
    end loop;

    -- Notify business owner of campaign success
    begin
      insert into public.notifications (user_id, type, title, body, deep_link, entity_type, entity_id, metadata)
      values (
        v_deal.owner_user_id,
        'BULK_DEAL_UNLOCKED',
        'Campaign target achieved! 🎉',
        '"' || left(v_deal.title, 60) || '" reached its target (' || v_paid_qty || ' units). Claim passes issued to pledgers.',
        '/business/' || v_deal.business_id || '/manage/bulk-deals/' || v_deal.id,
        'BUSINESS',
        v_deal.business_id,
        jsonb_build_object(
          'dealId', p_deal_id,
          'dealTitle', v_deal.title,
          'quantity', v_paid_qty,
          'progressCurrent', v_paid_qty,
          'progressTarget', v_deal.moq,
          'targetId', v_deal.business_id,
          'targetType', 'BUSINESS',
          'statusPill', 'Target Hit',
          'tone', 'success',
          'actions', jsonb_build_array('VIEW_DEAL')
        )
      );
    exception when others then null;
    end;

  elsif p_outcome = 'REFUNDED' then
    for m in select user_id from public.bulk_deal_pledges where deal_id = p_deal_id and deposit_status = 'PAID' loop
      begin
        insert into public.notifications (user_id, type, title, body, deep_link, metadata)
        values (
          m.user_id,
          'BULK_DEAL_REFUNDED',
          '"' || left(v_deal.title, 60) || '" didn''t reach its target',
          'The business will refund your deposit directly.',
          '/business/' || v_deal.business_id,
          jsonb_build_object(
            'dealId', p_deal_id,
            'dealTitle', v_deal.title,
            'targetId', v_deal.business_id,
            'targetType', 'BUSINESS',
            'statusPill', 'Campaign Closed',
            'tone', 'neutral',
            'actions', jsonb_build_array('VIEW_DEAL')
          )
        );
      exception when others then null;
      end;
    end loop;

    -- Notify business owner of refund requirement
    begin
      insert into public.notifications (user_id, type, title, body, deep_link, entity_type, entity_id, metadata)
      values (
        v_deal.owner_user_id,
        'BULK_DEAL_REFUNDED',
        'Campaign closed — target not met',
        '"' || left(v_deal.title, 60) || '" closed without reaching MOQ. Please ensure any collected deposits are refunded.',
        '/business/' || v_deal.business_id || '/manage/bulk-deals/' || v_deal.id,
        'BUSINESS',
        v_deal.business_id,
        jsonb_build_object(
          'dealId', p_deal_id,
          'dealTitle', v_deal.title,
          'progressCurrent', v_paid_qty,
          'progressTarget', v_deal.moq,
          'targetId', v_deal.business_id,
          'targetType', 'BUSINESS',
          'statusPill', 'Closed (Unmet)',
          'tone', 'neutral',
          'actions', jsonb_build_array('VIEW_DEAL')
        )
      );
    exception when others then null;
    end;
  end if;
end;
$$;


-- ── 6. Bulk Deal Extend (with enriched metadata) ──
create or replace function public.bulk_deal_extend(p_deal_id text, p_new_closes_at timestamptz)
returns public.bulk_deals
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledger record;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

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
    begin
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        v_pledger.user_id,
        'BULK_DEAL_EXTENDED',
        '"' || left(v_deal.title, 60) || '" got more time',
        'The business extended this campaign — it''s still collecting pledges.',
        '/business/' || v_deal.business_id,
        jsonb_build_object(
          'dealId', v_deal.id,
          'dealTitle', v_deal.title,
          'scheduledFor', p_new_closes_at,
          'dateLabel', to_char(p_new_closes_at, 'DD Mon YYYY'),
          'progressCurrent', v_deal.pledged_quantity,
          'progressTarget', v_deal.moq,
          'targetId', v_deal.business_id,
          'targetType', 'BUSINESS',
          'statusPill', 'Extended',
          'tone', 'warning',
          'actions', jsonb_build_array('VIEW_DEAL', 'SHARE_DEAL')
        )
      );
    exception when others then null;
    end;
  end loop;

  return v_deal;
end;
$$;

revoke execute on function public.bulk_deal_extend(text, timestamptz) from public, anon;
grant execute on function public.bulk_deal_extend(text, timestamptz) to authenticated;


-- ── 7. Bulk Deal Delete (with enriched metadata) ──
create or replace function public.bulk_deal_delete(p_deal_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
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
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        v_pledger,
        'BULK_DEAL_DEPOSIT_REJECTED',
        'Campaign cancelled',
        'The business removed "' || left(v_deal.title, 60) || '" — your paid deposit needs to be sorted out with them directly.',
        '/business/' || v_deal.business_id,
        jsonb_build_object(
          'dealId', v_deal.id,
          'dealTitle', v_deal.title,
          'targetId', v_deal.business_id,
          'targetType', 'BUSINESS',
          'statusPill', 'Cancelled',
          'tone', 'danger',
          'actions', jsonb_build_array('VIEW_DEAL')
        )
      );
    exception when others then null;
    end;
  end loop;

  delete from public.bulk_deals where id = p_deal_id;
end;
$$;

revoke execute on function public.bulk_deal_delete(text) from public, anon;
grant execute on function public.bulk_deal_delete(text) to authenticated;


-- ── 8. Group Buy Sync (ME_TOO & GROUP_BUY_UNLOCKED viral loop) ──
create or replace function public.sync_request_me_too()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  req_owner text;
  req_title text;
  req_is_group_buy boolean;
  req_group_target int;
  new_count int;
  v_joiner record;
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
        'A neighbor needs "' || coalesce(left(req_title, 60), 'your request') || '" too.',
        '/request/' || new.request_id,
        case when req_is_group_buy and req_group_target is not null
          then jsonb_build_object(
            'dealTitle', req_title,
            'progressCurrent', new_count,
            'progressTarget', req_group_target,
            'tone', 'brand',
            'actions', jsonb_build_array('VIEW_DEAL')
          )
          else null end
      );
    end if;

    if req_is_group_buy and req_group_target is not null and new_count = req_group_target then
      -- Notify request owner
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        req_owner, 'GROUP_BUY_UNLOCKED', 'Group buy unlocked!',
        req_group_target || ' neighbors joined "' || coalesce(left(req_title, 60), 'your request') || '" — bulk price unlocked.',
        '/request/' || new.request_id,
        jsonb_build_object(
          'dealTitle', req_title,
          'progressCurrent', new_count,
          'progressTarget', req_group_target,
          'statusPill', 'Unlocked',
          'tone', 'success',
          'actions', jsonb_build_array('VIEW_DEAL', 'SHARE_DEAL')
        )
      );

      -- Notify all me_too participants who helped unlock the group buy
      for v_joiner in
        select distinct user_id from public.me_too
        where request_id = new.request_id and user_id <> req_owner
      loop
        begin
          insert into public.notifications (user_id, type, title, body, deep_link, metadata)
          values (
            v_joiner.user_id, 'GROUP_BUY_UNLOCKED', 'Group buy unlocked!',
            'The group buy target of ' || req_group_target || ' was reached for "' || coalesce(left(req_title, 60), 'the request') || '" — bulk price unlocked.',
            '/request/' || new.request_id,
            jsonb_build_object(
              'dealTitle', req_title,
              'progressCurrent', new_count,
              'progressTarget', req_group_target,
              'statusPill', 'Unlocked',
              'tone', 'success',
              'actions', jsonb_build_array('VIEW_DEAL', 'SHARE_DEAL')
            )
          );
        exception when others then null;
        end;
      end loop;
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    update public.requests
       set me_too_count = greatest(0, coalesce(me_too_count, 0) - 1)
     where id = old.request_id;
    return old;
  end if;
  return null;
end;
$$;
