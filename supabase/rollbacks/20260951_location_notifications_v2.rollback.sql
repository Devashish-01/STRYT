-- ============================================================
-- Rollback for 20260951_location_notifications_v2.sql
-- Restores all replaced objects to their exact production catalog definitions
-- from supabase/snapshots/2026-09-13_after_20260958.sql.
-- ============================================================

-- ── Restore request_location_share ─────────────────────────
CREATE OR REPLACE FUNCTION public.request_location_share(p_owner text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
GRANT EXECUTE ON FUNCTION public.request_location_share(p_owner text) TO authenticated, postgres, service_role;

-- ── Restore respond_location_share ─────────────────────────
CREATE OR REPLACE FUNCTION public.respond_location_share(p_requester text, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  select name, avatar into v_owner_name, v_owner_avatar from public.users where id = v_uid;

  if p_approve then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      p_requester, 'LOCATION_APPROVED',
      'Location shared',
      'Your location request was approved',
      '/u/' || v_uid,
      jsonb_build_object('avatarUrl', v_owner_avatar, 'actorName', v_owner_name, 'statusPill', 'Approved', 'tone', 'success')
    );
  else
    begin
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        p_requester, 'LOCATION_DENIED',
        'Location request declined',
        coalesce(v_owner_name, 'They') || ' didn''t approve your location request',
        '/u/' || v_uid,
        jsonb_build_object('avatarUrl', v_owner_avatar, 'actorName', v_owner_name, 'statusPill', 'Declined', 'tone', 'neutral')
      );
    exception when others then null;
    end;
  end if;
end $function$
;
GRANT EXECUTE ON FUNCTION public.respond_location_share(p_requester text, p_approve boolean) TO authenticated, postgres, service_role;

-- ── Restore revoke_location_share ─────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_location_share(p_requester text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_owner_name text;
  v_owner_avatar text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  update public.location_share_grants
    set status = 'REVOKED', updated_at = now()
  where owner_user_id = v_uid and requester_user_id = p_requester;

  select name, avatar into v_owner_name, v_owner_avatar from public.users where id = v_uid;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      p_requester, 'LOCATION_REVOKED',
      'Location access ended',
      coalesce(v_owner_name, 'Someone') || ' stopped sharing their exact location with you',
      '/u/' || v_uid,
      jsonb_build_object('avatarUrl', v_owner_avatar, 'actorName', v_owner_name, 'statusPill', 'Ended', 'tone', 'neutral')
    );
  exception when others then null;
  end;
end $function$
;
GRANT EXECUTE ON FUNCTION public.revoke_location_share(p_requester text) TO authenticated, postgres, service_role;

-- ── Restore start_live_share ─────────────────────────
CREATE OR REPLACE FUNCTION public.start_live_share(p_lat double precision, p_lng double precision)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
GRANT EXECUTE ON FUNCTION public.start_live_share(p_lat double precision, p_lng double precision) TO authenticated, postgres, service_role;

notify pgrst, 'reload schema';
