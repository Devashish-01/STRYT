-- Rollback for group_buy_unlock_null_owner_guard.sql
-- Restores sync_request_me_too() exactly as live before the fix: copied verbatim
-- by script from supabase/snapshots/2026-09-13_after_w6.sql, not retyped.
-- Re-opens the bug: an ownerless group buy reaching its target aborts "me too".

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
        select distinct user_id from public.request_me_toos
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
$function$
;

revoke all on function public.sync_request_me_too() from public, anon, authenticated;
grant execute on function public.sync_request_me_too() to authenticated, postgres, service_role;
