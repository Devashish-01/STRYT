-- ============================================================
-- Notification metadata — personalized, "Apple-grade" notification content.
-- Run manually in Supabase SQL editor.
--
-- ── What this adds ───────────────────────────────────────────────────────
-- A single nullable `metadata jsonb` column on public.notifications. Every
-- notification-creating trigger function is re-pointed (CREATE OR REPLACE,
-- safe no-op if unchanged logic) to snapshot the real display data it
-- already has in scope at insert time — the DB row that fired the trigger
-- almost always carries a name/avatar/amount that was previously discarded
-- in favor of a plain "Someone did X" string.
--
-- This is purely additive:
--   • Old rows get metadata = null and render exactly as before (the client
--     falls back to plain title/body — see NotificationMetadata in
--     src/types/user.ts).
--   • No existing column, policy, or trigger TIMING changes — every function
--     below keeps the same signature, same trigger binding, same insert
--     shape plus one more column.
--   • push_on_notification_insert (20260731) is updated to forward metadata
--     to send-push so a photo can eventually show up in the OS banner too
--     (Web Push `image`, FCM big-picture) — additive on that side as well;
--     send-push already ignores unknown fields today, this just makes an
--     imageUrl one meaningful when present.
--
-- Shape (see NotificationMetadata, src/types/user.ts): avatarUrl, imageUrl,
-- actorName, amount, amountLabel, statusPill, tone, reason, emoji, category,
-- progressCurrent, progressTarget — all optional, snake_case keys in SQL
-- (jsonb_build_object) matching the camelCase TS keys 1:1 for a direct
-- Object.entries()-free mapping on the client.
-- ============================================================

alter table public.notifications add column if not exists metadata jsonb;
comment on column public.notifications.metadata is
  'Optional per-type enrichment snapshotted at creation time (avatar, amount, status pill, etc.) — see NotificationMetadata in src/types/user.ts. Null for rows created before this column or not yet enriched; client must render a plain fallback.';

-- ── PROPOSAL — who quoted, and (once accepted) not their concern; the price
--    itself is on the proposal row already ─────────────────────────────────
create or replace function public.notify_on_proposal()
returns trigger as $$
declare
  req_owner text;
  req_title text;
begin
  select requester_user_id, title
    into req_owner, req_title
    from public.requests
   where id = new.request_id;

  if req_owner is null or req_owner = new.responder_user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    req_owner,
    'PROPOSAL',
    coalesce(new.responder_name, 'Someone') || ' sent a quote',
    'On "' || coalesce(req_title, 'your request') || '"' || coalesce(' — ₹' || new.price::text, ''),
    '/request/' || new.request_id,
    jsonb_build_object(
      'avatarUrl', new.responder_avatar,
      'actorName', new.responder_name,
      'amount', new.price,
      'amountLabel', 'Quoted',
      'tone', 'brand'
    )
  );
  return new;
end $$ language plpgsql security definer;

-- (trigger binding unchanged — already after insert on public.proposals)

-- ── QUOTE_BROADCAST — same proposal row, broadcast to me-too joiners ───────
create or replace function public.notify_on_proposal_broadcast()
returns trigger as $$
declare
  req_owner text;
  req_title text;
begin
  select requester_user_id, title
    into req_owner, req_title
    from public.requests
   where id = new.request_id;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select mt.user_id,
         'QUOTE_BROADCAST',
         coalesce(new.responder_name, 'A provider') || ' sent a group quote',
         'On "' || coalesce(req_title, 'a request you joined') || '"' || coalesce(' — ₹' || new.price::text, ''),
         '/request/' || new.request_id,
         jsonb_build_object(
           'avatarUrl', new.responder_avatar,
           'actorName', new.responder_name,
           'amount', new.price,
           'amountLabel', 'Quoted',
           'tone', 'brand'
         )
    from public.request_me_toos mt
   where mt.request_id = new.request_id
     and mt.user_id <> coalesce(req_owner, '')
     and mt.user_id <> new.responder_user_id;

  return new;
end $$ language plpgsql security definer;

-- ── AGREEMENT — the deal amount, front and center ──────────────────────────
create or replace function public.notify_on_agreement()
returns trigger as $$
begin
  if new.status = 'ACTIVE' and (old.status is null or old.status <> 'ACTIVE') then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.requester_user_id,
      'AGREEMENT',
      'Agreement confirmed',
      '"' || coalesce(new.request_title, 'Your agreement') || '" is now active.',
      '/agreement/' || new.id,
      jsonb_build_object('amount', new.agreed_price, 'amountLabel', 'Deal value', 'statusPill', 'Active', 'tone', 'success')
    );
    if new.responder_user_id <> new.requester_user_id then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        new.responder_user_id,
        'AGREEMENT',
        'Agreement confirmed',
        '"' || coalesce(new.request_title, 'The agreement') || '" is active — good luck!',
        '/agreement/' || new.id,
        jsonb_build_object('amount', new.agreed_price, 'amountLabel', 'Deal value', 'statusPill', 'Active', 'tone', 'success')
      );
    end if;
  end if;
  return new;
end $$ language plpgsql security definer;

-- ── AGREEMENT (quote accepted) — accept_proposal / accept_proposal_counter ──
create or replace function public.accept_proposal(p_proposal_id text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
  v_agreement_id text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_proposal from public.proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_request from public.requests
  where id = v_proposal.request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if v_request.requester_user_id is distinct from v_uid then
    raise exception 'NOT_REQUEST_OWNER';
  end if;
  if v_request.status <> 'OPEN' or v_proposal.status <> 'SUBMITTED' then
    raise exception 'REQUEST_NOT_OPEN';
  end if;
  if v_proposal.price is null or v_proposal.price <= 0 then
    raise exception 'INVALID_PRICE';
  end if;

  if exists (select 1 from public.agreements a
             where a.request_id = v_request.id or a.proposal_id = p_proposal_id) then
    raise exception 'AGREEMENT_ALREADY_EXISTS';
  end if;

  update public.proposals set status = 'ACCEPTED'
  where id = p_proposal_id and status = 'SUBMITTED';
  if not found then raise exception 'PROPOSAL_ALREADY_DECIDED'; end if;

  insert into public.agreements (
    request_id, request_title, proposal_id, requester_user_id, responder_user_id,
    agreed_price, terms, requester_confirmed, responder_confirmed, payment_mode, status
  ) values (
    v_request.id, v_request.title, p_proposal_id,
    v_request.requester_user_id, v_proposal.responder_user_id,
    v_proposal.price, coalesce(v_proposal.message, ''), false, false, 'OFFLINE', 'PENDING'
  ) returning id into v_agreement_id;

  update public.requests set status = 'IN_PROGRESS'
  where id = v_request.id and status = 'OPEN';
  if not found then raise exception 'REQUEST_ALREADY_DECIDED'; end if;

  update public.proposals set status = 'REJECTED'
  where request_id = v_request.id and id <> p_proposal_id and status = 'SUBMITTED';

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    v_proposal.responder_user_id, 'AGREEMENT', 'Your quote was accepted! 🎉',
    'Confirm within 10 minutes to lock in "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
    '/agreement/' || v_agreement_id,
    jsonb_build_object('amount', v_proposal.price, 'amountLabel', 'Accepted at', 'statusPill', 'Confirm now', 'tone', 'success')
  );

  return v_agreement_id;
end
$$;

create or replace function public.accept_proposal_counter(
  p_proposal_id text, p_counter_id text
) returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
  v_counter public.proposal_counters%rowtype;
  v_agreement_id text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_proposal from public.proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_request from public.requests
  where id = v_proposal.request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if v_request.requester_user_id is distinct from v_uid then
    raise exception 'NOT_REQUEST_OWNER';
  end if;
  if v_request.status <> 'OPEN' or v_proposal.status <> 'SUBMITTED' then
    raise exception 'REQUEST_NOT_OPEN';
  end if;

  select * into v_counter
  from public.proposal_counters c
  where c.proposal_id = p_proposal_id
  order by c.created_at desc, c.id desc
  limit 1 for update;

  if not found or v_counter.id is distinct from p_counter_id then
    raise exception 'COUNTER_NOT_LATEST';
  end if;
  if v_counter.by_user_id is distinct from v_proposal.responder_user_id then
    raise exception 'COUNTER_NOT_OFFERED_BY_RESPONDER';
  end if;
  if v_counter.amount is null or v_counter.amount <= 0 then
    raise exception 'INVALID_PRICE';
  end if;

  if exists (select 1 from public.agreements a
             where a.request_id = v_request.id or a.proposal_id = p_proposal_id) then
    raise exception 'AGREEMENT_ALREADY_EXISTS';
  end if;

  update public.proposals set status = 'ACCEPTED'
  where id = p_proposal_id and status = 'SUBMITTED';
  if not found then raise exception 'PROPOSAL_ALREADY_DECIDED'; end if;

  insert into public.agreements (
    request_id, request_title, proposal_id, requester_user_id, responder_user_id,
    agreed_price, terms, requester_confirmed, responder_confirmed, payment_mode, status
  ) values (
    v_request.id, v_request.title, p_proposal_id,
    v_request.requester_user_id, v_proposal.responder_user_id,
    v_counter.amount::integer, coalesce(v_proposal.message, ''),
    false, false, 'OFFLINE', 'PENDING'
  ) returning id into v_agreement_id;

  update public.requests set status = 'IN_PROGRESS'
  where id = v_request.id and status = 'OPEN';
  if not found then raise exception 'REQUEST_ALREADY_DECIDED'; end if;

  update public.proposals set status = 'REJECTED'
  where request_id = v_request.id and id <> p_proposal_id and status = 'SUBMITTED';

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    v_proposal.responder_user_id, 'AGREEMENT', 'Your quote was accepted! 🎉',
    'Confirm within 10 minutes to lock in "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
    '/agreement/' || v_agreement_id,
    jsonb_build_object('amount', v_counter.amount, 'amountLabel', 'Accepted at', 'statusPill', 'Confirm now', 'tone', 'success')
  );

  return v_agreement_id;
end
$$;

-- ── NEARBY_REQUEST — category + urgency + a preview photo if the poster added one ──
create or replace function public.notify_on_request()
returns trigger as $$
declare
  delta double precision;
  v_meta jsonb;
begin
  if new.lat is null or new.lng is null then
    return new;
  end if;
  delta := coalesce(new.radius_km, 5) / 111.0;

  v_meta := jsonb_build_object(
    'category', new.category_name,
    'imageUrl', new.photos[1],
    'amount', new.budget_max,
    'amountLabel', case when new.budget_min is not null and new.budget_max is not null
                        and new.budget_min <> new.budget_max
                     then '₹' || new.budget_min::text || '–' || new.budget_max::text
                     else 'Budget' end,
    'statusPill', case when coalesce(new.is_urgent, false) then 'Urgent' else null end,
    'tone', case when coalesce(new.is_urgent, false) then 'warning' else 'info' end
  );

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select u.id, 'NEARBY_REQUEST',
         'New request near you',
         coalesce(new.category_name, 'Someone') || ' needs help: "' || left(coalesce(new.title, new.description, 'a request'), 60) || '"',
         '/request/' || new.id,
         v_meta
    from public.users u
   where u.id <> new.requester_user_id
     and u.lat is not null and u.lng is not null
     and u.lat between new.lat - delta and new.lat + delta
     and u.lng between new.lng - delta and new.lng + delta
   limit 200;

  if new.category_id is not null then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    select b.owner_user_id, 'NEARBY_REQUEST',
           'New ' || coalesce(new.category_name, 'request') || ' request',
           left(coalesce(new.title, new.description, 'A customer nearby needs help'), 80),
           '/business/' || b.id || '/manage/requests',
           v_meta
      from public.businesses b
     where b.category_id = new.category_id
       and b.status = 'ACTIVE'
       and coalesce(b.owner_user_id, '') <> new.requester_user_id
       and b.lat is not null and b.lng is not null
       and b.lat between new.lat - delta and new.lat + delta
       and b.lng between new.lng - delta and new.lng + delta
     limit 200;

    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    select p.user_id, 'NEARBY_REQUEST',
           'New ' || coalesce(new.category_name, 'request') || ' request',
           left(coalesce(new.title, new.description, 'A customer nearby needs help'), 80),
           '/provider/' || p.id || '/manage/find-work',
           v_meta
      from public.providers p
     where p.category_id = new.category_id
       and p.status = 'ACTIVE'
       and coalesce(p.user_id, '') <> new.requester_user_id
       and p.lat is not null and p.lng is not null
       and p.lat between new.lat - delta and new.lat + delta
       and p.lng between new.lng - delta and new.lng + delta
     limit 200;
  end if;

  return new;
end $$ language plpgsql security definer set search_path = public;

-- ── ME_TOO / GROUP_BUY_UNLOCKED — progress toward the group-buy target ─────
create or replace function public.sync_request_me_too()
returns trigger as $$
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
end $$ language plpgsql security definer;

-- ── APPOINTMENT — status/payment changes with counterpart photo + amount ──
create or replace function public.notify_on_appointment_status()
returns trigger as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'ACCEPTED' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking confirmed ✓',
              coalesce(new.target_name, 'The shop') || ' confirmed your ' || coalesce(new.time_label, 'appointment') || '.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Confirmed', 'tone', 'success'));
    elsif new.status = 'REJECTED' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking declined',
              coalesce(new.target_name, 'The shop') || ' couldn''t take your ' || coalesce(new.time_label, 'booking') || '. Try another slot.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Declined', 'tone', 'danger'));
    elsif new.status = 'NO_SHOW' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Marked as no-show',
              coalesce(new.target_name, 'The shop') || ' marked you as a no-show for your ' || coalesce(new.time_label, 'appointment') || '.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'No-show', 'tone', 'warning'));
    elsif new.status = 'CANCELLED' and new.cancelled_by = 'SYSTEM' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking auto-cancelled',
              coalesce(new.target_name, 'The shop') || ' didn''t respond in time, so your ' || coalesce(new.time_label, 'appointment') || ' was auto-cancelled.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Cancelled', 'tone', 'danger'));
    elsif new.status = 'CANCELLED' and coalesce(new.cancelled_by, '') <> 'CUSTOMER' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking cancelled',
              coalesce(new.target_name, 'The shop') || ' cancelled your ' || coalesce(new.time_label, 'appointment') || '.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Cancelled', 'tone', 'danger'));
    elsif new.status = 'CANCELLED' and new.cancelled_by = 'CUSTOMER' and new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.target_owner_user_id, 'APPOINTMENT', 'Booking cancelled by customer',
              coalesce(new.customer_name, 'A customer') || ' cancelled their ' || coalesce(new.time_label, 'appointment') || '.',
              case when new.target_type = 'PROVIDER'
                   then '/provider/' || new.target_id || '/manage/jobs'
                   else '/business/' || new.target_id || '/manage/appointments' end,
              jsonb_build_object('avatarUrl', new.customer_avatar, 'actorName', new.customer_name, 'statusPill', 'Cancelled', 'tone', 'neutral'));
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status then
    if new.payment_status = 'PAID' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Payment confirmed ✓',
              coalesce(new.target_name, 'The shop') || ' confirmed your payment.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'amount', new.payment_amount, 'amountLabel', 'Paid', 'statusPill', 'Paid', 'tone', 'success'));
    elsif new.payment_status = 'PENDING_CONFIRM' and new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.target_owner_user_id, 'APPOINTMENT', 'Payment claim to verify',
              coalesce(new.customer_name, 'A customer') || ' says they paid'
                || coalesce(' ₹' || new.payment_amount::text, '') || ' — confirm or reject in your console.',
              case when new.target_type = 'PROVIDER'
                   then '/provider/' || new.target_id || '/manage/jobs'
                   else '/business/' || new.target_id || '/manage/appointments' end,
              jsonb_build_object('avatarUrl', new.customer_avatar, 'actorName', new.customer_name, 'amount', new.payment_amount, 'amountLabel', 'Claimed', 'statusPill', 'Verify', 'tone', 'warning'));
    elsif new.payment_status = 'REJECTED' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Payment not verified',
              coalesce(new.target_name, 'The shop') || ' couldn''t verify your payment. Please retry.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Rejected', 'tone', 'danger'));
    end if;
  end if;

  return new;
end $$ language plpgsql security definer set search_path = public;

-- ── APPOINTMENT (new booking request / reschedule) — owner sees who's asking ──
-- Preserves the reschedule branch added in 20260810. Also fixes the SAME
-- '/manage/leads' 404 bug that 20260838 fixed in notify_on_appointment_status
-- — that migration's own header says "BOTH owner-facing deep links pointed at
-- .../manage/leads", but only touched the status-change function; this
-- creation-time function still pointed there (confirmed: no
-- /provider/:id/manage/leads route exists in App.tsx, only /manage/jobs and
-- /manage/inbox) — every "new booking request" push to a provider has been
-- 404ing on tap this whole time. Fixed alongside the metadata addition.
create or replace function public.notify_on_appointment_created()
returns trigger as $$
declare v_link text;
begin
  v_link := case when new.target_type = 'PROVIDER'
                 then '/provider/' || new.target_id || '/manage/jobs'
                 else '/business/' || new.target_id || '/manage/appointments' end;

  if new.rescheduled_from is not null then
    if new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        new.target_owner_user_id, 'APPOINTMENT', 'Booking rescheduled',
        coalesce(new.customer_name, 'A customer') || ' moved their booking to ' || coalesce(new.time_label, 'a new slot')
          || coalesce(' — ' || new.package_name, ''),
        v_link,
        jsonb_build_object('avatarUrl', new.customer_avatar, 'actorName', new.customer_name, 'amount', new.package_price, 'amountLabel', 'Package', 'statusPill', 'Rescheduled', 'tone', 'brand')
      );
    end if;
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.customer_user_id, 'APPOINTMENT', 'Reschedule submitted',
      'Your new request for ' || coalesce(new.time_label, 'a slot') || ' with ' || coalesce(new.target_name, 'the shop')
        || ' is pending confirmation.',
      '/appointments',
      jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Pending', 'tone', 'warning')
    );
  elsif new.target_owner_user_id is not null then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.target_owner_user_id, 'APPOINTMENT', 'New booking request',
      coalesce(new.customer_name, 'A customer') || ' requested ' || coalesce(new.time_label, 'a slot')
        || coalesce(' — ' || new.package_name, ''),
      v_link,
      jsonb_build_object('avatarUrl', new.customer_avatar, 'actorName', new.customer_name, 'amount', new.package_price, 'amountLabel', 'Package', 'statusPill', 'New', 'tone', 'brand')
    );
  end if;
  return new;
end $$ language plpgsql security definer;

-- ── QUEUE_UPDATE — "it's your turn" from the shop, and the two closure paths ──
create or replace function public.notify_on_queue_called()
returns trigger as $$
declare v_shop text; v_avatar text;
begin
  if new.status = 'CALLED' and old.status is distinct from 'CALLED' then
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
    left join public.businesses b on b.id = e.business_id;
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
end $$;

create or replace function public.expire_tokens_on_queue_close()
returns trigger as $$
begin
  if old.is_open = true and new.is_open = false then
    begin
      with expired as (
        update public.queue_tokens t
           set status = 'EXPIRED', closed_reason = 'SHOP_CLOSED'
         where t.business_id = new.business_id
           and t.status in ('WAITING', 'CALLED')
           and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
           and not (t.status = 'CALLED' and t.arrived_at is not null)
        returning t.id, t.customer_user_id, t.business_id
      )
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      select e.customer_user_id, 'QUEUE_UPDATE', 'Queue closed',
             coalesce(b.name, 'The shop') || ' closed its queue — you''ve been removed from the line.',
             '/queues',
             jsonb_build_object('avatarUrl', b.cover_image, 'actorName', b.name, 'statusPill', 'Closed', 'tone', 'neutral')
        from expired e
        left join public.businesses b on b.id = e.business_id;
    exception when others then
      update public.queue_tokens t
         set status = 'EXPIRED', closed_reason = 'SHOP_CLOSED'
       where t.business_id = new.business_id
         and t.status in ('WAITING', 'CALLED')
         and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
         and not (t.status = 'CALLED' and t.arrived_at is not null);
    end;
  end if;
  return new;
end $$ language plpgsql security definer;

create or replace function public.on_queue_token_update()
returns trigger as $$
declare
  v_owner text;
begin
  if (new.status in ('CALLED', 'SERVED') and new.status is distinct from old.status)
     or (new.arrived_at is not null and old.arrived_at is null) then
    update public.queue_settings set last_activity_at = now() where business_id = new.business_id;
  end if;

  if new.status = 'LEFT' and old.status in ('CALLED', 'SERVED') then
    begin
      select b.owner_user_id into v_owner from public.businesses b where b.id = new.business_id;
      if v_owner is not null then
        insert into public.notifications (user_id, type, title, body, deep_link, metadata)
        values (v_owner, 'QUEUE_UPDATE', 'Customer left the queue',
                coalesce(new.customer_name, 'A customer') || ' left before paying.',
                '/business/' || new.business_id || '/manage/queue',
                jsonb_build_object('actorName', new.customer_name, 'statusPill', 'Left', 'tone', 'neutral'));
      end if;
    exception when others then null;
    end;
  end if;
  return new;
end $$ language plpgsql security definer;

-- ── VERIFICATION_DECIDED — the reviewer's reason as a structured field ─────
create or replace function public.notify_verification_decision_business()
returns trigger as $$
begin
  if new.is_verified = true and old.is_verified is distinct from true then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (new.owner_user_id, 'VERIFICATION_DECIDED', 'You are verified!', new.name || ' is now a verified business.', '/business/' || new.id || '/manage/verify',
            jsonb_build_object('avatarUrl', new.cover_image, 'actorName', new.name, 'statusPill', 'Verified', 'tone', 'success'));
  elsif new.verification_status = 'REJECTED' and old.verification_status is distinct from 'REJECTED' then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.owner_user_id, 'VERIFICATION_DECIDED', 'Verification needs another look',
      case when new.verification_reason is not null and new.verification_reason <> ''
        then 'Reason: ' || new.verification_reason || ' — resubmit from Settings.'
        else 'Your documents for ' || new.name || ' were not approved — resubmit from Settings.'
      end,
      '/business/' || new.id || '/manage/verify',
      jsonb_build_object('avatarUrl', new.cover_image, 'actorName', new.name, 'reason', new.verification_reason, 'statusPill', 'Needs changes', 'tone', 'danger')
    );
  end if;
  return new;
end $$ language plpgsql security definer;

create or replace function public.notify_verification_decision_provider()
returns trigger as $$
begin
  if new.is_verified = true and old.is_verified is distinct from true then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (new.user_id, 'VERIFICATION_DECIDED', 'You are verified!', new.display_name || ' is now a verified provider.', '/provider/' || new.id || '/manage/verify',
            jsonb_build_object('avatarUrl', new.avatar, 'actorName', new.display_name, 'statusPill', 'Verified', 'tone', 'success'));
  elsif new.verification_status = 'REJECTED' and old.verification_status is distinct from 'REJECTED' then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.user_id, 'VERIFICATION_DECIDED', 'Verification needs another look',
      case when new.verification_reason is not null and new.verification_reason <> ''
        then 'Reason: ' || new.verification_reason || ' — resubmit from Settings.'
        else 'Your documents for ' || new.display_name || ' were not approved — resubmit from Settings.'
      end,
      '/provider/' || new.id || '/manage/verify',
      jsonb_build_object('avatarUrl', new.avatar, 'actorName', new.display_name, 'reason', new.verification_reason, 'statusPill', 'Needs changes', 'tone', 'danger')
    );
  end if;
  return new;
end $$ language plpgsql security definer;

-- ── COMMUNITY_COMMENT / REPORT_RESOLVED ────────────────────────────────────
create or replace function public.notify_on_post_comment()
returns trigger as $$
declare
  post_owner text;
  post_title text;
begin
  select author_user_id, title into post_owner, post_title
    from public.community_posts where id = new.post_id;

  if post_owner is null or post_owner = new.author_user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    post_owner,
    'COMMUNITY_COMMENT',
    'New comment on your post',
    coalesce(new.author_name, 'Someone') || ' commented: "' || left(new.body, 60) || '"',
    '/community/' || new.post_id,
    jsonb_build_object('avatarUrl', new.author_avatar, 'actorName', new.author_name, 'tone', 'brand')
  );
  return new;
end $$ language plpgsql security definer;

create or replace function public.notify_on_report_resolved()
returns trigger as $$
declare
  deep_link text;
begin
  if new.status not in ('DISMISSED', 'ACTION_TAKEN') then
    return new;
  end if;
  if old.status = new.status then
    return new;
  end if;
  if new.reporter_user_id is null then
    return new;
  end if;

  deep_link := case new.target_type
    when 'POST' then '/community/' || new.target_id
    when 'BUSINESS' then '/business/' || new.target_id
    when 'PROVIDER' then '/provider/' || new.target_id
    when 'REQUEST' then '/request/' || new.target_id
    else null
  end;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    new.reporter_user_id,
    'REPORT_RESOLVED',
    'Your report was reviewed',
    'Your report on "' || coalesce(new.target_name, 'a listing') || '" has been reviewed by our team.',
    deep_link,
    jsonb_build_object(
      'statusPill', case new.status when 'ACTION_TAKEN' then 'Action taken' else 'Reviewed' end,
      'tone', case new.status when 'ACTION_TAKEN' then 'success' else 'neutral' end
    )
  );
  return new;
end $$ language plpgsql security definer;

-- ── STORY_REACTION — the story's own cover photo + the reacting emoji ──────
create or replace function public.notify_on_story_reaction()
returns trigger as $$
declare
  story_owner text;
  story_image text;
begin
  if new.reaction is null then
    return new;
  end if;
  if TG_OP = 'UPDATE' and old.reaction is not distinct from new.reaction then
    return new;
  end if;

  select user_id, image_url into story_owner, story_image
    from public.stories where id = new.story_id;

  if story_owner is null or story_owner = new.viewer_user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    story_owner,
    'STORY_REACTION',
    'Someone reacted to your story',
    new.reaction || ' reacted to your story',
    null,
    jsonb_build_object('imageUrl', story_image, 'emoji', new.reaction, 'tone', 'brand')
  );
  return new;
end $$ language plpgsql security definer;

-- ── SAVED_SEARCH_MATCH — the new listing's own cover photo ─────────────────
create or replace function public.notify_saved_search_matches_business()
returns trigger as $$
declare
  s record;
begin
  if new.status is distinct from 'ACTIVE' then
    return new;
  end if;

  for s in
    select * from public.saved_searches
    where new.name ilike '%' || query || '%'
       or coalesce(new.sub_category, '') ilike '%' || query || '%'
       or coalesce(new.category_name, '') ilike '%' || query || '%'
  loop
    if s.lat is not null and s.lng is not null and new.lat is not null and new.lng is not null
       and public.haversine_km(s.lat, s.lng, new.lat, new.lng) > s.radius_km then
      continue;
    end if;

    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      s.user_id,
      'SAVED_SEARCH_MATCH',
      'New match for "' || s.query || '"',
      new.name || ' just joined nearby',
      '/business/' || new.id,
      jsonb_build_object('imageUrl', new.cover_image, 'actorName', new.name, 'category', new.category_name, 'tone', 'brand')
    );
  end loop;
  return new;
end $$ language plpgsql security definer;

create or replace function public.notify_saved_search_matches_provider()
returns trigger as $$
declare
  s record;
begin
  if new.status is distinct from 'ACTIVE' then
    return new;
  end if;

  for s in
    select * from public.saved_searches
    where new.display_name ilike '%' || query || '%'
       or coalesce(new.sub_category, '') ilike '%' || query || '%'
       or coalesce(new.category_name, '') ilike '%' || query || '%'
  loop
    if s.lat is not null and s.lng is not null and new.lat is not null and new.lng is not null
       and public.haversine_km(s.lat, s.lng, new.lat, new.lng) > s.radius_km then
      continue;
    end if;

    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      s.user_id,
      'SAVED_SEARCH_MATCH',
      'New match for "' || s.query || '"',
      new.display_name || ' just joined nearby',
      '/provider/' || new.id,
      jsonb_build_object('avatarUrl', new.avatar, 'actorName', new.display_name, 'category', new.category_name, 'tone', 'brand')
    );
  end loop;
  return new;
end $$ language plpgsql security definer;

-- ── LOCATION_REQUEST / LOCATION_APPROVED — the requester's own avatar ──────
create or replace function public.request_location_share(p_owner text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid  text := auth.uid()::text;
  v_name text;
  v_avatar text;
begin
  if v_uid is null or v_uid = p_owner then return; end if;

  insert into public.location_share_grants (owner_user_id, requester_user_id, status)
  values (p_owner, v_uid, 'PENDING')
  on conflict (owner_user_id, requester_user_id) do update
    set status = case when location_share_grants.status = 'APPROVED' then 'APPROVED' else 'PENDING' end,
        updated_at = now();

  select name, avatar into v_name, v_avatar from public.users where id = v_uid;
  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    p_owner, 'LOCATION_REQUEST',
    'Location request',
    coalesce(v_name, 'Someone') || ' wants to see your exact location',
    '/settings',
    jsonb_build_object('avatarUrl', v_avatar, 'actorName', v_name, 'statusPill', 'Pending', 'tone', 'warning')
  );
end $$;

create or replace function public.respond_location_share(p_requester text, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_owner_name text;
  v_owner_avatar text;
begin
  if v_uid is null then return; end if;

  update public.location_share_grants
    set status = case when p_approve then 'APPROVED' else 'DENIED' end,
        updated_at = now()
  where owner_user_id = v_uid and requester_user_id = p_requester;

  if p_approve then
    select name, avatar into v_owner_name, v_owner_avatar from public.users where id = v_uid;
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      p_requester, 'LOCATION_APPROVED',
      'Location shared',
      'Your location request was approved',
      '/u/' || v_uid,
      jsonb_build_object('avatarUrl', v_owner_avatar, 'actorName', v_owner_name, 'statusPill', 'Approved', 'tone', 'success')
    );
  end if;
end $$;

-- ── BUSINESS_ACCESS — who's asking / who logged in, and which business ────
create or replace function public.decide_business_session(
  p_session_id uuid, p_approve boolean
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_session public.business_access_sessions%rowtype;
  v_hours integer;
  v_business_name text;
  v_business_cover text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select s.* into v_session
  from public.business_access_sessions s
  join public.businesses b on b.id = s.business_id
  where s.id = p_session_id and b.owner_user_id = v_uid
  for update of s;

  if not found then raise exception 'NOT_ALLOWED'; end if;
  if v_session.status <> 'PENDING' then raise exception 'ALREADY_DECIDED'; end if;

  if v_session.expires_at is not null and v_session.expires_at <= now() then
    update public.business_access_sessions
    set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
    where id = p_session_id and status = 'PENDING';
    return;
  end if;

  select least(greatest(coalesce(c.session_hours, 8), 1), 720), b.name, b.cover_image
  into v_hours, v_business_name, v_business_cover
  from public.businesses b
  left join public.business_login_credentials c on c.business_id = b.id
  where b.id = v_session.business_id;

  update public.business_access_sessions
  set status = case when p_approve then 'ACTIVE' else 'DENIED' end,
      decided_at = now(),
      expires_at = case when p_approve
        then now() + make_interval(hours => v_hours)
        else null end
  where id = p_session_id and status = 'PENDING';

  if not found then raise exception 'ALREADY_DECIDED'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      v_session.grantee_user_id, 'BUSINESS_ACCESS',
      case when p_approve then 'Access approved' else 'Access denied' end,
      case when p_approve
        then 'You can now manage ' || coalesce(v_business_name, 'the business') || '.'
        else 'Your request to manage ' || coalesce(v_business_name, 'the business') || ' was declined.' end,
      case when p_approve
        then '/business/' || v_session.business_id || '/manage'
        else '/account/business-access' end,
      jsonb_build_object('avatarUrl', v_business_cover, 'actorName', v_business_name,
        'statusPill', case when p_approve then 'Approved' else 'Denied' end,
        'tone', case when p_approve then 'success' else 'danger' end)
    );
  exception when others then null;
  end;
end
$$;

create or replace function public.grant_business_access(
  p_business_id text, p_identifier text
) returns table (session_id uuid, grantee_name text)
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_identifier text := trim(coalesce(p_identifier, ''));
  v_digits text := regexp_replace(v_identifier, '\D', '', 'g');
  v_target text;
  v_name text;
  v_business_name text;
  v_business_cover text;
  v_session_id uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select b.name, b.cover_image into v_business_name, v_business_cover
  from public.businesses b
  where b.id = p_business_id and b.owner_user_id = v_uid;
  if v_business_name is null then raise exception 'NOT_ALLOWED'; end if;
  if v_identifier = '' then raise exception 'IDENTIFIER_REQUIRED'; end if;

  if v_identifier ~ '@.*\.' then
    select u.id, coalesce(nullif(trim(u.alias), ''), u.name, 'User')
    into v_target, v_name
    from public.users u
    where lower(u.email) = lower(v_identifier)
    order by u.id limit 1;
  elsif regexp_replace(v_identifier, '[\s\-+]', '', 'g') ~ '^\d{6,}$' then
    select u.id, coalesce(nullif(trim(u.alias), ''), u.name, 'User')
    into v_target, v_name
    from public.users u
    where right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10)
          = right(v_digits, 10)
    order by u.id limit 1;
  else
    select u.id, coalesce(nullif(trim(u.alias), ''), u.name, 'User')
    into v_target, v_name
    from public.users u
    where lower(u.alias) = lower(ltrim(v_identifier, '@'))
    order by u.id limit 1;
  end if;

  if v_target is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_target = v_uid then raise exception 'OWNER_ALREADY_HAS_ACCESS'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id || ':' || v_target, 0));

  update public.business_access_sessions
  set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
  where business_id = p_business_id and grantee_user_id = v_target
    and status in ('PENDING', 'ACTIVE')
    and expires_at is not null and expires_at <= now();

  select s.id into v_session_id
  from public.business_access_sessions s
  where s.business_id = p_business_id
    and s.grantee_user_id = v_target
    and s.status in ('PENDING', 'ACTIVE')
  order by s.requested_at desc, s.id desc
  limit 1 for update;

  if v_session_id is null then
    insert into public.business_access_sessions
      (business_id, grantee_user_id, status, decided_at, expires_at)
    values (p_business_id, v_target, 'ACTIVE', now(), null)
    returning id into v_session_id;
  else
    update public.business_access_sessions
    set status = 'ACTIVE', decided_at = now(), expires_at = null
    where id = v_session_id;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (v_target, 'BUSINESS_ACCESS', 'Access granted',
      'You can now manage ' || coalesce(v_business_name, 'a business') || '.',
      '/business/' || p_business_id || '/manage',
      jsonb_build_object('avatarUrl', v_business_cover, 'actorName', v_business_name, 'statusPill', 'Granted', 'tone', 'success'));
  exception when others then null;
  end;

  return query select v_session_id, coalesce(v_name, 'User');
end
$$;

create or replace function public.business_login_attempt(p_login_id text, p_password text)
returns table (status text, business_id text, session_id uuid, business_name text)
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_uid text := auth.uid()::text;
  v_login_key text := lower(trim(coalesce(p_login_id, '')));
  v_attempt public.business_login_attempts%rowtype;
  v_credential public.business_login_credentials%rowtype;
  v_owner text;
  v_name text;
  v_cover text;
  v_grantee text;
  v_existing public.business_access_sessions%rowtype;
  v_status text;
  v_expires timestamptz;
  v_id uuid;
  v_hash text;
  v_password_matches boolean;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_dummy_hash constant text := '$2a$10$CXSUxhkNpnbyeflgDI/sMei3m6s9krMAI2wx72jT.YBXr.Agkk6H2';
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  if v_login_key = '' then
    return query select 'INVALID_CREDENTIALS'::text, null::text, null::uuid,
      'Invalid login id or password'::text;
    return;
  end if;

  select * into v_attempt
  from public.business_login_attempts
  where login_id = v_login_key and attempted_by = v_uid
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return query select 'LOCKED'::text, null::text, null::uuid,
      ('Too many failed attempts. Try again in ' ||
       greatest(1, ceil(extract(epoch from (v_attempt.locked_until - now())) / 60)::integer) ||
       ' minute(s).')::text;
    return;
  end if;

  select * into v_credential
  from public.business_login_credentials c
  where lower(trim(c.login_id)) = v_login_key and c.is_enabled = true;

  v_hash := coalesce(nullif(v_credential.password_hash, ''), v_dummy_hash);
  v_password_matches := crypt(coalesce(p_password, ''), v_hash) = v_hash;

  if v_credential.business_id is null or p_password is null or not v_password_matches then
    insert into public.business_login_attempts
      (login_id, attempted_by, fail_count, last_attempt_at, locked_until)
    values (v_login_key, v_uid, 1, now(), null)
    on conflict (login_id, attempted_by) do update
    set fail_count = case
          when business_login_attempts.last_attempt_at <= now() - v_window
            or business_login_attempts.locked_until is not null
          then 1 else business_login_attempts.fail_count + 1 end,
        last_attempt_at = now(),
        locked_until = case
          when (case
            when business_login_attempts.last_attempt_at <= now() - v_window
              or business_login_attempts.locked_until is not null
            then 1 else business_login_attempts.fail_count + 1 end) >= v_max_attempts
          then now() + v_window else null end
    returning * into v_attempt;

    if v_attempt.locked_until is not null then
      return query select 'LOCKED'::text, null::text, null::uuid,
        'Too many failed attempts. Try again in 15 minutes.'::text;
    else
      return query select 'INVALID_CREDENTIALS'::text, null::text, null::uuid,
        'Invalid login id or password'::text;
    end if;
    return;
  end if;

  delete from public.business_login_attempts
  where login_id = v_login_key and attempted_by = v_uid;

  select b.owner_user_id, b.name, b.cover_image into v_owner, v_name, v_cover
  from public.businesses b where b.id = v_credential.business_id;
  if v_owner = v_uid then raise exception 'OWNER_ALREADY_HAS_ACCESS'; end if;

  select coalesce(nullif(trim(u.alias), ''), u.name, 'Someone') into v_grantee
  from public.users u where u.id = v_uid;

  perform pg_advisory_xact_lock(
    hashtextextended(v_credential.business_id || ':' || v_uid, 0)
  );

  update public.business_access_sessions
  set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
  where business_id = v_credential.business_id and grantee_user_id = v_uid
    and status in ('PENDING', 'ACTIVE')
    and expires_at is not null and expires_at <= now();

  select * into v_existing
  from public.business_access_sessions s
  where s.business_id = v_credential.business_id
    and s.grantee_user_id = v_uid
    and s.status in ('PENDING', 'ACTIVE')
  order by s.requested_at desc, s.id desc
  limit 1 for update;

  if v_existing.id is not null then
    return query select v_existing.status, v_existing.business_id, v_existing.id, v_name;
    return;
  end if;

  if v_credential.require_approval then
    v_status := 'PENDING';
    v_expires := now() + interval '30 seconds';
  else
    v_status := 'ACTIVE';
    v_expires := now() + make_interval(
      hours => least(greatest(coalesce(v_credential.session_hours, 8), 1), 720)
    );
  end if;

  insert into public.business_access_sessions
    (business_id, grantee_user_id, status, decided_at, expires_at)
  values (
    v_credential.business_id, v_uid, v_status,
    case when v_status = 'ACTIVE' then now() else null end,
    v_expires
  ) returning id into v_id;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      v_owner, 'BUSINESS_ACCESS',
      case when v_status = 'PENDING' then 'Access request' else 'Business login' end,
      v_grantee || case when v_status = 'PENDING'
        then ' wants to manage ' || coalesce(v_name, 'your business') || '. Approve within 30 seconds.'
        else ' logged in to manage ' || coalesce(v_name, 'your business') || '.' end,
      '/account/business-access',
      jsonb_build_object('avatarUrl', v_cover, 'actorName', v_grantee,
        'statusPill', case when v_status = 'PENDING' then 'Pending' else 'Active' end,
        'tone', case when v_status = 'PENDING' then 'warning' else 'info' end)
    );
  exception when others then null;
  end;

  return query select v_status, v_credential.business_id, v_id, v_name;
end
$$;

-- ── push_on_notification_insert — forward metadata to send-push so a photo
--    can eventually surface in the OS-level push banner too ────────────────
create or replace function public.push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'functions_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_url = '' or v_key is null or v_key = '' then
    return new;
  end if;

  perform net.http_post(
    url     := v_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey',        v_key
    ),
    body    := jsonb_build_object(
      'userId',   new.user_id,
      'title',    new.title,
      'body',     new.body,
      'deepLink', coalesce(new.deep_link, '/'),
      'type',     new.type,
      'imageUrl', coalesce(new.metadata->>'imageUrl', new.metadata->>'avatarUrl')
    )
  );

  return new;
exception
  when others then
    return new;
end $$;

-- (trigger binding unchanged — already after insert on public.notifications)
