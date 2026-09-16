-- 20260982_moderation_tells_the_author
--
-- ADMIN_MODERATION MOD-1: an admin removing a post, a comment or a request left the author with no notice at all —
-- their content simply vanished, with nothing to read and nothing to appeal. Each moderation function now writes the
-- author a notification saying what was removed and quoting its title or first line, before the row goes.
--
-- ADMIN_MODERATION MOD-3: 20260978 audits post deletions but not comment deletions, so admin_delete_comment left no
-- entry in admin_actions. It now writes its own row (one per moderation action, not one per cascaded reply).
--
-- Rollback: supabase/rollbacks/20260982_moderation_tells_the_author.rollback.sql

create or replace function public.admin_delete_post(p_id text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_author text;
  v_label text;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'NOT_ALLOWED'; end if;

  -- Tell the author before the row goes, so the notification quotes what was removed (MOD-1).
  select author_user_id, coalesce(nullif(title, ''), left(coalesce(body, ''), 60), 'your post')
    into v_author, v_label
    from public.community_posts where id = p_id;
  if v_author is not null then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (v_author, 'SYSTEM', 'Your post was removed',
            'STRYT removed "' || v_label || '" because it broke the community rules. Contact support if you think that''s wrong.',
            '/support', jsonb_build_object('statusPill', 'Removed', 'tone', 'danger'));
  end if;

  delete from public.post_comments where post_id = p_id;
  delete from public.post_likes where post_id = p_id;
  delete from public.poll_votes where post_id = p_id;
  delete from public.community_posts where id = p_id;
end
$function$;

create or replace function public.admin_delete_comment(p_id text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_author text;
  v_label text;
  v_post text;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'NOT_ALLOWED'; end if;

  select author_user_id, left(coalesce(body, ''), 60), post_id
    into v_author, v_label, v_post
    from public.post_comments where id = p_id;
  if v_author is not null then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (v_author, 'SYSTEM', 'Your comment was removed',
            'STRYT removed your comment' || case when v_label <> '' then ' ("' || v_label || '")' else '' end ||
            ' because it broke the community rules. Contact support if you think that''s wrong.',
            coalesce('/community/' || v_post, '/support'),
            jsonb_build_object('statusPill', 'Removed', 'tone', 'danger'));
  end if;

  -- MOD-3: comment removals were the one moderation action 20260978 didn't audit. Logged here rather than by a
  -- trigger on post_comments, so deleting a post with fifty comments still records one action, not fifty-one.
  insert into public.admin_actions (admin_user_id, action, target_type, target_id, details)
  values (v_uid, 'DELETE', 'post_comments', p_id,
          jsonb_strip_nulls(jsonb_build_object('author_user_id', to_jsonb(v_author), 'post_id', to_jsonb(v_post),
                                               'body_excerpt', to_jsonb(v_label))));

  delete from public.comment_reactions where comment_id = p_id;
  -- Nested replies would otherwise be orphaned behind a removed parent.
  delete from public.post_comments where parent_id = p_id;
  delete from public.post_comments where id = p_id;
end
$function$;

create or replace function public.admin_cancel_request(p_id text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_author text;
  v_label text;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'NOT_ALLOWED'; end if;

  select requester_user_id, coalesce(nullif(title, ''), 'your request')
    into v_author, v_label
    from public.requests where id = p_id and status is distinct from 'CANCELLED';
  if v_author is not null then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (v_author, 'SYSTEM', 'Your request was closed',
            'STRYT closed "' || v_label || '" because it broke the community rules. Contact support if you think that''s wrong.',
            '/request/' || p_id, jsonb_build_object('statusPill', 'Closed', 'tone', 'danger'));
  end if;

  update public.requests set status = 'CANCELLED' where id = p_id;
end
$function$;
