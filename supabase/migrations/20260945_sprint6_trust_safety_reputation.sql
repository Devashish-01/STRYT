-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT 6: TRUST, SAFETY, REPUTATION & GOOGLE PLAY HARDENING
-- Migration: 20260945_sprint6_trust_safety_reputation.sql
-- Covers:
--  1. Rating aggregate recomputation trigger (CRAT-1)
--  2. Ratings RLS UPDATE policy (CRAT-2)
--  3. Rating notifications for businesses and solo providers (CRAT-5)
--  4. Reply to rating RPC expansion & removal (RMGR-3, RMGR-4, RMGR-7)
--  5. Location share grant re-request after expiry (LOC-4)
--  6. Live share auto-expiry & zero-recipient guard (LOC-1, ECON-2, LOC-3)
--  7. Self-vouch & self-endorsement DB guard (VOUCH-4)
--  8. Provider UPI QR code URL column (MONEY-2)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) RATINGS AGGREGATE RECOMPUTATION TRIGGER (CRAT-1) ────────────────────
-- Automatically recomputes rating_avg and rating_count on businesses, providers,
-- and users whenever a review is inserted, updated, or deleted.

create or replace function public.recompute_rating_aggregates() returns trigger as $$
declare
  v_type text := coalesce(new.ratee_type, old.ratee_type);
  v_id text := coalesce(new.ratee_id, old.ratee_id);
  v_avg numeric(3,2);
  v_count int;
begin
  select coalesce(round(avg(rating), 2), 0), count(*)
  into v_avg, v_count
  from public.ratings
  where ratee_type = v_type and ratee_id = v_id;

  if v_type = 'BUSINESS' then
    update public.businesses
    set rating_avg = v_avg, rating_count = v_count
    where id = v_id;
  elsif v_type = 'PROVIDER' then
    update public.providers
    set rating_avg = v_avg, rating_count = v_count
    where id = v_id;
  elsif v_type = 'USER' then
    update public.users
    set rating_avg = v_avg, rating_count = v_count
    where id = v_id;
  end if;

  return coalesce(new, old);
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_recompute_ratings on public.ratings;
create trigger trg_recompute_ratings
  after insert or update or delete on public.ratings
  for each row execute function public.recompute_rating_aggregates();


-- ── 2) RATINGS RLS UPDATE POLICY (CRAT-2) ──────────────────────────────────
-- Allows authenticated users to update their own existing reviews.

do $$ begin
  create policy upd_ratings on public.ratings
    for update using (rater_user_id = auth.uid()::text)
    with check (rater_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;


-- ── 3) RATING NOTIFICATIONS FOR BUSINESSES & PROVIDERS (CRAT-5) ─────────────
-- Alerts business owners and solo service providers when customers leave a review.

create or replace function public.notify_on_rating() returns trigger as $$
declare
  v_target_user text;
  v_deep_link text;
  v_name text;
begin
  if new.rater_user_id is null then
    return new;
  end if;

  select name into v_name from public.users where id = new.rater_user_id;

  if new.ratee_type = 'BUSINESS' then
    select owner_user_id into v_target_user from public.businesses where id = new.ratee_id;
    v_deep_link := '/business/' || new.ratee_id || '/manage/reviews';
  elsif new.ratee_type = 'PROVIDER' then
    select user_id into v_target_user from public.providers where id = new.ratee_id;
    v_deep_link := '/provider/' || new.ratee_id || '/manage/reviews';
  elsif new.ratee_type = 'USER' then
    v_target_user := new.ratee_id;
    v_deep_link := coalesce('/agreement/' || new.agreement_id, '/u/' || new.ratee_id);
  end if;

  if v_target_user is not null and v_target_user != new.rater_user_id then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (
        v_target_user,
        'RATING',
        'New customer review',
        coalesce(v_name, 'A customer') || ' gave ' ||
          case when new.rating >= 4 then '⭐ ' else '' end || new.rating || '/5' ||
          case when new.comment is not null and length(trim(new.comment)) > 0
               then ' — "' || left(new.comment, 80) || '"' else '' end,
        v_deep_link
      );
    exception when others then null;
    end;
  end if;

  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_on_rating on public.ratings;
create trigger trg_notify_on_rating
  after insert on public.ratings
  for each row execute function public.notify_on_rating();


-- ── 4) OWNER REPLY TO RATINGS RPC (RMGR-3, RMGR-4, RMGR-7) ─────────────────
-- Allows business owners, authorized managers, and solo providers to post or remove replies.

create or replace function public.reply_to_rating(p_rating_id text, p_reply text)
 returns ratings
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_ratee_type text;
  v_ratee_id text;
  v_owner text;
  v_is_authorized boolean := false;
  v_clean_reply text := trim(coalesce(p_reply, ''));
  v_rating public.ratings%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select ratee_type, ratee_id into v_ratee_type, v_ratee_id
  from public.ratings where id = p_rating_id;
  if not found then raise exception 'RATING_NOT_FOUND'; end if;

  if v_ratee_type = 'BUSINESS' then
    select owner_user_id into v_owner from public.businesses where id = v_ratee_id;
    if v_owner = v_uid then
      v_is_authorized := true;
    else
      -- Check team permissions
      select exists (
        select 1 from public.team_members
        where business_id = v_ratee_id::uuid
          and user_id = v_uid::uuid
          and status = 'ACTIVE'
          and (role in ('owner', 'manager') or 'support' = any(scopes) or 'leads' = any(scopes))
      ) into v_is_authorized;
    end if;
  elsif v_ratee_type = 'PROVIDER' then
    select user_id into v_owner from public.providers where id = v_ratee_id;
    if v_owner = v_uid then
      v_is_authorized := true;
    end if;
  else
    raise exception 'NOT_REPLYABLE';
  end if;

  if not v_is_authorized then
    raise exception 'FORBIDDEN';
  end if;

  if length(v_clean_reply) = 0 then
    -- Clear existing reply
    update public.ratings
    set owner_reply = null, owner_reply_at = null
    where id = p_rating_id
    returning * into v_rating;
  else
    if length(v_clean_reply) < 2 then raise exception 'REPLY_TOO_SHORT'; end if;
    update public.ratings
    set owner_reply = left(v_clean_reply, 2000), owner_reply_at = now()
    where id = p_rating_id
    returning * into v_rating;
  end if;

  return v_rating;
end
$function$;

revoke execute on function public.reply_to_rating(text, text) from public, anon;
grant execute on function public.reply_to_rating(text, text) to authenticated;


-- ── 5) LOCATION SHARE GRANT RE-REQUEST AFTER EXPIRY (LOC-4) ────────────────
-- Fixes conflict clause so expired APPROVED grants can be re-requested as PENDING.

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
    set status = case
          when location_share_grants.status = 'APPROVED'
               and (location_share_grants.expires_at is null or location_share_grants.expires_at > now())
          then 'APPROVED'
          else 'PENDING'
        end,
        requested_at = now(),
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

revoke execute on function public.request_location_share(text) from public, anon;
grant execute on function public.request_location_share(text) to authenticated;


-- ── 6) LIVE SHARE AUTO-EXPIRY & ZERO-RECIPIENT GUARD (LOC-1, ECON-2, LOC-3) ─

alter table public.live_shares
  add column if not exists expires_at timestamptz not null default (now() + interval '8 hours');

create or replace function public.start_live_share(p_lat double precision, p_lng double precision)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid   text := auth.uid()::text;
  v_share text;
  v_name  text;
  v_pa    text;
  v_pb    text;
  v_conv  text;
  v_msg   text;
  r       record;
begin
  if v_uid is null then return null; end if;

  -- LOC-3: Reject Null Island coordinates
  if (p_lat = 0 and p_lng = 0) or p_lat is null or p_lng is null then
    raise exception 'INVALID_COORDINATES';
  end if;

  -- ECON-2: Guard against broadcasting to zero contacts
  if not exists (select 1 from public.emergency_contacts where owner_user_id = v_uid) then
    raise exception 'NO_EMERGENCY_CONTACTS';
  end if;

  -- LOC-1: Expire old sessions that exceeded their time window
  update public.live_shares
    set status = 'ENDED', ended_at = now()
    where sharer_user_id = v_uid and status = 'ACTIVE' and expires_at <= now();

  -- Resume an active unexpired session if one exists
  select id into v_share from public.live_shares
    where sharer_user_id = v_uid and status = 'ACTIVE' and expires_at > now();

  if v_share is not null then
    update public.live_shares
      set lat = p_lat, lng = p_lng, updated_at = now()
      where id = v_share;
    return v_share;
  end if;

  insert into public.live_shares (sharer_user_id, lat, lng, expires_at)
    values (v_uid, p_lat, p_lng, now() + interval '8 hours')
    returning id into v_share;

  select name into v_name from public.users where id = v_uid;

  for r in
    select contact_user_id from public.emergency_contacts where owner_user_id = v_uid
  loop
    v_pa := least(v_uid, r.contact_user_id);
    v_pb := greatest(v_uid, r.contact_user_id);
    select id into v_conv from public.conversations
      where participant_a = v_pa and participant_b = v_pb and subject_id is null
      limit 1;
    if v_conv is null then
      insert into public.conversations (participant_a, participant_b)
        values (v_pa, v_pb) returning id into v_conv;
    end if;

    insert into public.messages (conversation_id, sender_id, body, kind, meta)
      values (v_conv, v_uid, '📍 Live location', 'LIVE_LOCATION',
              jsonb_build_object('share_id', v_share, 'status', 'ACTIVE'))
      returning id into v_msg;

    update public.conversations set
      last_message_at = now(),
      last_message_preview = '📍 Live location',
      has_unread_a = (v_pa <> v_uid),
      has_unread_b = (v_pb <> v_uid)
      where id = v_conv;

    insert into public.live_share_recipients (share_id, recipient_user_id, conversation_id, message_id)
      values (v_share, r.contact_user_id, v_conv, v_msg);

    insert into public.notifications (user_id, type, title, body, deep_link)
      values (r.contact_user_id, 'LIVE_LOCATION',
              coalesce(v_name, 'Someone') || ' is sharing live location',
              'Tap to follow their location on the map',
              '/chat/' || v_conv);
  end loop;

  return v_share;
end $$;

-- Update get_live_share to reflect expired sessions as ENDED
drop function if exists public.get_live_share(text);
create or replace function public.get_live_share(p_share_id text)
returns table (
  id             text,
  sharer_user_id text,
  sharer_name    text,
  sharer_avatar  text,
  status         text,
  lat            double precision,
  lng            double precision,
  accuracy       double precision,
  heading        double precision,
  updated_at     timestamptz,
  started_at     timestamptz,
  ended_at       timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_is_recipient boolean := false;
  v_is_sharer    boolean := false;
begin
  if v_uid is null then return; end if;

  select exists (
    select 1 from public.live_shares s
    where s.id = p_share_id and s.sharer_user_id = v_uid
  ) into v_is_sharer;

  if not v_is_sharer then
    select exists (
      select 1 from public.live_share_recipients r
      where r.share_id = p_share_id and r.recipient_user_id = v_uid
    ) into v_is_recipient;
  end if;

  if not v_is_sharer and not v_is_recipient then
    return;
  end if;

  return query
  select
    s.id,
    s.sharer_user_id,
    u.name as sharer_name,
    u.avatar as sharer_avatar,
    case
      when s.status = 'ACTIVE' and s.expires_at <= now() then 'ENDED'
      else s.status
    end as status,
    s.lat,
    s.lng,
    s.accuracy,
    s.heading,
    s.updated_at,
    s.started_at,
    case
      when s.status = 'ACTIVE' and s.expires_at <= now() then s.expires_at
      else s.ended_at
    end as ended_at
  from public.live_shares s
  left join public.users u on u.id = s.sharer_user_id
  where s.id = p_share_id;
end $$;


-- ── 7) SELF-VOUCH & SELF-ENDORSEMENT DB GUARD (VOUCH-4) ────────────────────

create or replace function public.check_self_vouch() returns trigger as $$
begin
  if exists (
    select 1 from public.providers
    where id = new.provider_id and user_id = new.from_user_id
  ) then
    raise exception 'CANNOT_VOUCH_FOR_SELF';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_self_vouch on public.vouches;
create trigger trg_prevent_self_vouch
  before insert or update on public.vouches
  for each row execute function public.check_self_vouch();

drop trigger if exists trg_prevent_self_endorsement on public.endorsements;
create trigger trg_prevent_self_endorsement
  before insert or update on public.endorsements
  for each row execute function public.check_self_vouch();


-- ── 8) PROVIDER UPI QR CODE URL (MONEY-2) ──────────────────────────────────
-- Persist custom UPI payment QR code URL in Postgres rather than localStorage.

alter table public.providers
  add column if not exists upi_qr_url text;
