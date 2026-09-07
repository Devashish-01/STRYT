-- ============================================================
-- 20260914 — Walk-in support for the live queue (flow-completeness audit,
-- workflow 15): Appointments already has appointment_create_walk_in, which
-- solves "no real customer account" by stamping customer_user_id = the
-- owner's own auth.uid() (satisfying the RLS insert check trivially). That
-- exact trick does NOT translate to queue_tokens: queue_tokens_one_active_per_biz
-- (20260802) is a unique index on (business_id, customer_user_id) WHERE
-- status IN ('WAITING','CALLED') — every walk-in sharing the owner's uid
-- would collide on the second one. Using NULL instead is both correct (a
-- NULL foreign key/unique column never collides with another NULL) and more
-- honest: a walk-in genuinely has no account. This is exactly why a new
-- SECURITY DEFINER RPC is needed rather than a plain client insert — RLS's
-- `customer_user_id = auth.uid()` check has no way to allow NULL.
--
-- customer_user_id was already nullable in the schema, but nothing ever
-- inserted a NULL there before, so two existing queue notification paths
-- had never been exercised against it and would have thrown on first
-- contact (notifications.user_id is NOT NULL):
--   - notify_on_queue_called (20260840) — bare insert, no guard. Calling a
--     walk-in forward in the queue would abort the whole status UPDATE.
--   - close_stale_queue_tokens (20260840) — the insert-select from `expired`
--     would fail on any NULL customer_user_id row, likely losing the
--     notification for every OTHER real customer expired in the same sweep
--     too (multi-row INSERT is atomic).
-- Both fixed here alongside the new RPC, not as a separate afterthought —
-- shipping walk-ins without this would have broken "call next" for them.
-- ============================================================

create or replace function public.queue_token_create_walk_in(
  p_business_id text, p_customer_name text, p_party_size text default '1 person'
) returns public.queue_tokens
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_token public.queue_tokens%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if nullif(trim(coalesce(p_customer_name, '')), '') is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if not public.has_business_scope(p_business_id, v_uid, 'queue') then raise exception 'NOT_TARGET_MANAGER'; end if;

  insert into public.queue_tokens (business_id, customer_user_id, customer_name, party_size, status, payment_status)
  values (p_business_id, null, left(trim(p_customer_name), 200), coalesce(nullif(trim(p_party_size), ''), '1 person'), 'WAITING', 'UNPAID')
  returning * into v_token;

  return v_token;
end
$$;

revoke execute on function public.queue_token_create_walk_in(text, text, text) from public, anon;
grant execute on function public.queue_token_create_walk_in(text, text, text) to authenticated;

-- ── Guard the two existing paths that would break on a NULL customer_user_id ──
create or replace function public.notify_on_queue_called()
returns trigger as $$
declare v_shop text; v_avatar text;
begin
  if new.status = 'CALLED' and old.status is distinct from 'CALLED' and new.customer_user_id is not null then
    select name, cover_image into v_shop, v_avatar from public.businesses where id = new.business_id;
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (new.customer_user_id, 'QUEUE_UPDATE', 'It''s your turn! 🔔',
            'Head in now — ' || coalesce(v_shop, 'the shop') || ' is ready for you.', '/queues',
            jsonb_build_object('avatarUrl', v_avatar, 'actorName', v_shop, 'statusPill', 'Called', 'tone', 'success'));
  end if;
  return new;
end $$ language plpgsql security definer;

create or replace function public.close_stale_queue_tokens()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  max_age     interval := interval '4 hours';
  inactivity  interval := interval '90 minutes';
  tz          text := 'Asia/Kolkata';
  today_start timestamptz := (date_trunc('day', now() at time zone tz) at time zone tz);
begin
  update public.queue_settings s
     set is_open = false, updated_at = now()
   where s.is_open = true
     and coalesce(s.last_activity_at, s.updated_at) < now() - inactivity
     and exists (
       select 1 from public.queue_tokens t
        where t.business_id = s.business_id
          and t.status in ('WAITING', 'CALLED')
     );

  with expired as (
    update public.queue_tokens t
       set status = 'EXPIRED',
           closed_reason = case
             when t.created_at < today_start        then 'DAY_ROLLOVER'
             when t.created_at < now() - max_age     then 'STALE'
             else 'SHOP_CLOSED' end
      from public.queue_settings s
     where t.business_id = s.business_id
       and t.status in ('WAITING', 'CALLED')
       and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
       and (
            t.created_at < today_start
         or t.created_at < now() - max_age
         or (s.is_open = false and not (t.status = 'CALLED' and t.arrived_at is not null))
       )
    returning t.id, t.customer_user_id, t.business_id, t.closed_reason
  )
  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select e.customer_user_id,
         'QUEUE_UPDATE',
         'Queue closed',
         coalesce(b.name, 'The shop') || ' closed its queue — you''ve been removed from the line.',
         '/queues',
         jsonb_build_object('avatarUrl', b.cover_image, 'actorName', b.name, 'statusPill', 'Closed', 'tone', 'neutral')
    from expired e
    left join public.businesses b on b.id = e.business_id
   where e.customer_user_id is not null;
exception
  when others then
    update public.queue_tokens t
       set status = 'EXPIRED',
           closed_reason = case
             when t.created_at < today_start    then 'DAY_ROLLOVER'
             when t.created_at < now() - max_age then 'STALE'
             else 'SHOP_CLOSED' end
      from public.queue_settings s
     where t.business_id = s.business_id
       and t.status in ('WAITING', 'CALLED')
       and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
       and (
            t.created_at < today_start
         or t.created_at < now() - max_age
         or (s.is_open = false and not (t.status = 'CALLED' and t.arrived_at is not null))
       );
end
$$;
