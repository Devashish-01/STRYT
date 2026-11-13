-- ============================================================
-- 20261016 — Things that expire actually expire (GAPS #45)
--
-- Several machines keep a status plus an expires_at / valid_until, and the move
-- to EXPIRED / ENDED was lazy (only when some client called a function) or
-- missing. Found while fixing it, and fixed here because they are the same
-- defect with a safety cost:
--   a. respond_location_share approved a request without setting expires_at
--      (no default, no trigger; only renew_location_share ever set it), and
--      get_shared_location treats NULL as "never expires". The notification says
--      "approved … for 24 hours"; in fact an exact-location grant stayed open
--      until the owner revoked it.
--   b. get_live_share returned lat / lng to recipients after the share had
--      ended or expired (it relabelled the status but still sent the position),
--      and update_live_share kept accepting positions on an expired share that
--      was still ACTIVE, so a recipient could follow the sharer past the 8 hours.
--   c. live_shares.status and location_share_grants.status had no CHECK.
--   d. The 'close-stale-queues' cron job scheduled by 20260803 is missing from
--      production (cron.job, read 2026-11-13); queues were closed only when a
--      client happened to call close_stale_queue_tokens.
-- Changes:
--   1. CHECKs: live_shares ACTIVE | ENDED; location_share_grants PENDING |
--      APPROVED | DENIED | REVOKED | EXPIRED (both tables are empty in prod).
--   2. respond_location_share: an approval lasts 24 hours (expires_at set);
--      APPROVED grants with no expiry are given one (updated_at + 24 h).
--   3. update_live_share refuses an expired share; get_live_share sends no
--      position unless the share is live.
--   4. expire_stale_rows() (cron every 5 min, 'expire-stale-rows'):
--        requests OPEN -> EXPIRED (close_expired_requests)
--        live_shares ACTIVE -> ENDED at expires_at; positions of ended shares cleared
--        location_share_grants APPROVED -> EXPIRED
--        group_buy_tokens / bulk_deal_tokens ISSUED -> EXPIRED (valid_until)
--        gate_passes ACTIVE -> EXPIRED (valid_until)
--   5. 'close-stale-queues' re-scheduled every 10 min, as 20260803 intended.
-- The app's own calls to close_expired_requests / close_stale_queue_tokens stay
-- valid (now redundant, harmless).
-- Rollback: supabase/rollbacks/20261016_expiry_sweeps.rollback.sql
-- Test:     supabase/tests/expiry_sweeps.test.sql
-- ============================================================

-- ── 1. The two unconstrained state columns get their states ────────────────
alter table public.live_shares drop constraint if exists live_shares_status_check;
alter table public.live_shares add constraint live_shares_status_check
  check (status in ('ACTIVE', 'ENDED'));
alter table public.location_share_grants drop constraint if exists location_share_grants_status_check;
alter table public.location_share_grants add constraint location_share_grants_status_check
  check (status in ('PENDING', 'APPROVED', 'DENIED', 'REVOKED', 'EXPIRED'));

-- ── 2. An approval lasts 24 hours, as the notification says ────────────────
create or replace function public.respond_location_share(p_requester text, p_approve boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_owner_name text;
  v_owner_avatar text;
begin
  if v_uid is null then return; end if;

  update public.location_share_grants
    set status = case when p_approve then 'APPROVED' else 'DENIED' end,
        expires_at = case when p_approve then now() + interval '24 hours' else null end,
        updated_at = now()
  where owner_user_id = v_uid and requester_user_id = p_requester;

  select name, avatar into v_owner_name, v_owner_avatar from public.users where id = v_uid;

  if p_approve then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        p_requester,
        'LOCATION_APPROVED',
        'Location shared',
        coalesce(v_owner_name, 'They') || ' approved your location request for 24 hours.',
        '/u/' || v_uid,
        jsonb_build_object(
          'avatarUrl', v_owner_avatar,
          'actorName', v_owner_name,
          'ownerUserId', v_uid,
          'statusPill', 'Approved (24h)',
          'tone', 'success',
          'actions', jsonb_build_array('VIEW_ON_MAP')
        )
      );
    exception when others then null;
    end;
  else
    begin
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        p_requester,
        'LOCATION_DENIED',
        'Location request declined',
        coalesce(v_owner_name, 'They') || ' didn''t approve your location request',
        '/u/' || v_uid,
        jsonb_build_object(
          'avatarUrl', v_owner_avatar,
          'actorName', v_owner_name,
          'ownerUserId', v_uid,
          'statusPill', 'Declined',
          'tone', 'neutral',
          'actions', jsonb_build_array()
        )
      );
    exception when others then null;
    end;
  end if;
end $function$;

revoke all on function public.respond_location_share(text, boolean) from public, anon;
grant execute on function public.respond_location_share(text, boolean) to authenticated;

-- grants approved before this fix never got an expiry
update public.location_share_grants
   set expires_at = updated_at + interval '24 hours'
 where status = 'APPROVED' and expires_at is null;

-- ── 3. A live share stops moving, and stops showing, when it ends ───────────
create or replace function public.update_live_share(p_lat double precision, p_lng double precision,
  p_accuracy double precision default null::double precision, p_heading double precision default null::double precision)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then return; end if;
  update public.live_shares
    set lat = p_lat, lng = p_lng, accuracy = p_accuracy, heading = p_heading, updated_at = now()
    where sharer_user_id = v_uid and status = 'ACTIVE' and expires_at > now();
end $function$;

revoke all on function public.update_live_share(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.update_live_share(double precision, double precision, double precision, double precision) to authenticated;

create or replace function public.get_live_share(p_share_id text)
returns table(id text, sharer_user_id text, sharer_name text, sharer_avatar text, status text, lat double precision,
  lng double precision, accuracy double precision, heading double precision, updated_at timestamp with time zone,
  started_at timestamp with time zone, ended_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- A position is only ever handed out while the share is live.
  return query
  select
    s.id,
    s.sharer_user_id,
    u.name as sharer_name,
    u.avatar as sharer_avatar,
    case when s.status = 'ACTIVE' and s.expires_at > now() then 'ACTIVE' else 'ENDED' end as status,
    case when s.status = 'ACTIVE' and s.expires_at > now() then s.lat end as lat,
    case when s.status = 'ACTIVE' and s.expires_at > now() then s.lng end as lng,
    case when s.status = 'ACTIVE' and s.expires_at > now() then s.accuracy end as accuracy,
    case when s.status = 'ACTIVE' and s.expires_at > now() then s.heading end as heading,
    s.updated_at,
    s.started_at,
    case when s.status = 'ACTIVE' and s.expires_at <= now() then s.expires_at else s.ended_at end as ended_at
  from public.live_shares s
  left join public.users u on u.id = s.sharer_user_id
  where s.id = p_share_id;
end $function$;

revoke all on function public.get_live_share(text) from public, anon;
grant execute on function public.get_live_share(text) to authenticated;

-- ── 4. One sweep for everything with an expiry ──────────────────────────────
create or replace function public.expire_stale_rows()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_requests int; v_shares int; v_cleared int; v_grants int; v_gb int; v_bd int; v_gp int;
begin
  update public.requests set status = 'EXPIRED'
   where status = 'OPEN' and expires_at is not null and expires_at < now();
  get diagnostics v_requests = row_count;

  update public.live_shares set status = 'ENDED', ended_at = expires_at,
         lat = null, lng = null, accuracy = null, heading = null
   where status = 'ACTIVE' and expires_at <= now();
  get diagnostics v_shares = row_count;

  -- a share stopped by hand (stop_live_share / last recipient revoked) keeps no position either
  update public.live_shares set lat = null, lng = null, accuracy = null, heading = null
   where status = 'ENDED' and (lat is not null or lng is not null);
  get diagnostics v_cleared = row_count;

  update public.location_share_grants set status = 'EXPIRED', updated_at = now()
   where status = 'APPROVED' and expires_at is not null and expires_at <= now();
  get diagnostics v_grants = row_count;

  update public.group_buy_tokens set status = 'EXPIRED'
   where status = 'ISSUED' and valid_until is not null and valid_until < now();
  get diagnostics v_gb = row_count;

  update public.bulk_deal_tokens set status = 'EXPIRED'
   where status = 'ISSUED' and valid_until is not null and valid_until < now();
  get diagnostics v_bd = row_count;

  update public.gate_passes set status = 'EXPIRED'
   where status = 'ACTIVE' and valid_until is not null and valid_until < now();
  get diagnostics v_gp = row_count;

  return jsonb_build_object('requests', v_requests, 'live_shares', v_shares, 'positions_cleared', v_cleared,
    'location_grants', v_grants, 'group_buy_tokens', v_gb, 'bulk_deal_tokens', v_bd, 'gate_passes', v_gp);
end
$function$;

revoke all on function public.expire_stale_rows() from public, anon, authenticated;

-- ── 5. Timers ───────────────────────────────────────────────────────────────
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('expire-stale-rows', 'close-stale-queues');
    perform cron.schedule('expire-stale-rows', '*/5 * * * *', 'select public.expire_stale_rows();');
    perform cron.schedule('close-stale-queues', '*/10 * * * *', 'select public.close_stale_queue_tokens();');
  end if;
end
$cron$;

notify pgrst, 'reload schema';
