-- ============================================================
-- Flow 5 (Stories) — quick reactions + save to highlights.
-- Run manually in Supabase SQL editor.
--
-- Reactions piggyback on story_views (one row per viewer per story already
-- exists from recordStoryView) rather than a new table — reacting just fills
-- in the `reaction` column on that same row.
--
-- Highlights let a story survive past its normal expiry: is_highlighted
-- stories are additionally included regardless of expires_at. myStory()
-- (the "do I have a live story right now" check) is intentionally left
-- untouched — it must stay strictly time-bound so highlights don't make an
-- expired story look like an active one on the StoriesBar ring.
-- ============================================================

alter table if exists public.story_views
  add column if not exists reaction text;

alter table if exists public.stories
  add column if not exists is_highlighted boolean not null default false;

comment on column public.story_views.reaction is
  'One of a small emoji set (❤️ 😂 😮 👏 🔥) — nullable, latest reaction per viewer per story.';
comment on column public.stories.is_highlighted is
  'When true, the story is served past its expires_at — powers "save to highlights".';

create or replace function public.notify_on_story_reaction()
returns trigger as $$
declare
  story_owner text;
  story_owner_name text;
begin
  if new.reaction is null then
    return new;
  end if;
  if TG_OP = 'UPDATE' and old.reaction is not distinct from new.reaction then
    return new;
  end if;

  select user_id, author_name into story_owner, story_owner_name
    from public.stories where id = new.story_id;

  if story_owner is null or story_owner = new.viewer_user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    story_owner,
    'STORY_REACTION',
    'Someone reacted to your story',
    new.reaction || ' reacted to your story',
    null
  );
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_story_reaction on public.story_views;
create trigger trg_notify_story_reaction
  after insert or update on public.story_views
  for each row execute function public.notify_on_story_reaction();
