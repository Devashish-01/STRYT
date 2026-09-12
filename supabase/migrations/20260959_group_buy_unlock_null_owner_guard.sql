-- sync_request_me_too(): don't let a group buy with no owner break "me too"
-- Migration 20260959. Found while verifying W5/W6 (docs/database/HANDOFF.md).
--
-- WHY: requests.requester_user_id is nullable. When a group buy reaches its
-- target, the function inserts a GROUP_BUY_UNLOCKED notification for the owner
-- with no null check, so for an ownerless request the insert violates
-- notifications.user_id NOT NULL and aborts the neighbour's "me too" tap. Its
-- participant loop also filtered `user_id <> req_owner`, which is NULL when the
-- owner is NULL, so no participant would be told either. Proven live-reachable
-- in a forced-rollback test on 2026-09-13; 0 ownerless requests existed then.
--
-- WHAT: the LIVE definition, copied verbatim by script from
-- supabase/snapshots/2026-09-13_after_w6.sql, with exactly two changes:
--   1. the owner's GROUP_BUY_UNLOCKED insert is wrapped in `if req_owner is not null`;
--   2. `user_id <> req_owner` becomes `user_id is distinct from req_owner`.
-- Counting, the ME_TOO notification, permissions and search_path are unchanged.
--
-- Staged in supabase/pending/ and proven there first (APPLY_LOG row 19).

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
      if req_owner is not null then
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
      end if;

      -- Notify all me_too participants who helped unlock the group buy
      for v_joiner in
        select distinct user_id from public.request_me_toos
        where request_id = new.request_id and user_id is distinct from req_owner
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
$function$
;

revoke all on function public.sync_request_me_too() from public, anon, authenticated;
grant execute on function public.sync_request_me_too() to authenticated, postgres, service_role;
