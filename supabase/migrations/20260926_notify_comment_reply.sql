-- ============================================================
-- 20260926 — Fix COMMUNITY_POSTS_GAP_LOG #13: replying to someone's comment
-- never notified them.
--
-- notify_on_post_comment (current definition: 20260840:714-737) notifies the
-- POST's author and nobody else. When nested replies arrived in 20260807
-- (post_comments.parent_id) the trigger was never revisited, so if B replies
-- to A's comment on C's post: C is told, and A — the person actually being
-- answered — hears nothing. Direct replies are the main conversational loop in
-- a neighbourhood thread, so this is the notification that matters most.
--
-- Care needed on who gets what, to avoid double-notifying one person:
--   · Replying to your own comment       → no reply notification.
--   · Commenting on your own post        → no owner notification (unchanged).
--   · Parent commenter IS the post owner → ONE notification, the reply one.
--     It's strictly more specific ("replied to your comment" vs "commented on
--     your post"), and both would otherwise land for the same event. That's
--     what `post_owner is distinct from v_parent_author` guards below —
--     distinct from (not <>) so a NULL parent, i.e. a top-level comment, still
--     notifies the owner.
-- ============================================================

create or replace function public.notify_on_post_comment()
returns trigger as $$
declare
  post_owner text;
  post_title text;
  v_parent_author text;
begin
  select author_user_id, title into post_owner, post_title
    from public.community_posts where id = new.post_id;

  if new.parent_id is not null then
    select author_user_id into v_parent_author
      from public.post_comments where id = new.parent_id;
  end if;

  -- 1) The person being replied to.
  if v_parent_author is not null and v_parent_author <> new.author_user_id then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      v_parent_author,
      'COMMUNITY_REPLY',
      'New reply to your comment',
      coalesce(new.author_name, 'Someone') || ' replied: "' || left(new.body, 60) || '"',
      '/community/' || new.post_id,
      jsonb_build_object('avatarUrl', new.author_avatar, 'actorName', new.author_name, 'tone', 'brand')
    );
  end if;

  -- 2) The post's author — unless they wrote this comment, or they already got
  --    the reply notification above as the parent commenter.
  if post_owner is not null
     and post_owner <> new.author_user_id
     and post_owner is distinct from v_parent_author then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      post_owner,
      'COMMUNITY_COMMENT',
      'New comment on your post',
      coalesce(new.author_name, 'Someone') || ' commented: "' || left(new.body, 60) || '"',
      '/community/' || new.post_id,
      jsonb_build_object('avatarUrl', new.author_avatar, 'actorName', new.author_name, 'tone', 'brand')
    );
  end if;

  return new;
end $$ language plpgsql security definer;
