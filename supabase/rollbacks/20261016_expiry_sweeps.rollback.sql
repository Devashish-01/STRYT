-- Rollback for 20261016_expiry_sweeps.sql — restores the definitions live before it (read 2026-11-13).
-- Not reversed: the expires_at given to APPROVED grants that had none (data; harmless to keep).

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('expire-stale-rows', 'close-stale-queues');
  end if;
end
$cron$;
drop function if exists public.expire_stale_rows();

alter table public.live_shares drop constraint if exists live_shares_status_check;
alter table public.location_share_grants drop constraint if exists location_share_grants_status_check;

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
    where sharer_user_id = v_uid and status = 'ACTIVE';
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
end $function$;

revoke all on function public.get_live_share(text) from public, anon;
grant execute on function public.get_live_share(text) to authenticated;

notify pgrst, 'reload schema';
