-- Migration 20260971 — stories: only owners write them; visibility enforced by the database.
--
-- WHY (tested on production 2026-09-15, forced rollback)
--   1. del_stories let ANY signed-in user delete every business and provider story
--      (a random user deleted 2 of 5).
--   2. "Allow insert access to stories for authenticated" had a WITH CHECK starting
--      `auth.role() = 'authenticated' OR …`, so any signed-in user could post a story as
--      any business or provider (the probe only failed on a missing author_name).
--      The FOR ALL policy "Allow update/delete for owners of stories" also allowed that
--      insert, since it only checked user_id = auth.uid().
--   3. "Allow read access to stories for all" was USING (true OR …): close-friends stories
--      and hidden-from lists were enforced only in the app, so anyone could read them.
--
-- WHAT
--   Replace the four policies with owner-checked ones. An "owner" is: the user for a
--   user story; anyone who can manage the business (owner or active team member,
--   can_manage_business) for a business story; the provider's user for a provider story.
--   Matches the app: StoryCompose posts user stories with user_id = owner_id = the user,
--   and seller stories with owner_id = the business/provider id and user_id = the poster.
--   Reading: everyone stories (minus hidden_user_ids), close-friends stories to
--   allowed_user_ids, and every story to its owner. Expired stories stay readable, as
--   before, because highlights reuse them.

drop policy if exists "Allow insert access to stories for authenticated" on public.stories;
drop policy if exists "Allow read access to stories for all" on public.stories;
drop policy if exists "Allow update/delete for owners of stories" on public.stories;
drop policy if exists del_stories on public.stories;

create policy stories_select on public.stories
  for select to public
  using (
    (visibility = 'everyone' and not coalesce((select auth.uid())::text = any (hidden_user_ids), false))
    or (visibility = 'close_friends' and coalesce((select auth.uid())::text = any (allowed_user_ids), false))
    or (user_id is not null and user_id = (select auth.uid())::text)
    or ((select auth.uid()) is not null and owner_type = 'business' and public.can_manage_business(owner_id))
  );

create policy stories_insert_own on public.stories
  for insert to authenticated
  with check (
    user_id = (select auth.uid())::text
    and (
      (owner_type = 'user' and owner_id = (select auth.uid())::text)
      or (owner_type = 'business' and public.can_manage_business(owner_id))
      or (owner_type = 'provider' and exists (
            select 1 from public.providers p where p.id = owner_id and p.user_id = (select auth.uid())::text))
    )
  );

create policy stories_update_own on public.stories
  for update to authenticated
  using (
    (owner_type = 'user' and user_id = (select auth.uid())::text)
    or (owner_type = 'business' and public.can_manage_business(owner_id))
    or (owner_type = 'provider' and exists (
          select 1 from public.providers p where p.id = owner_id and p.user_id = (select auth.uid())::text))
  )
  with check (
    (owner_type = 'user' and user_id = (select auth.uid())::text)
    or (owner_type = 'business' and public.can_manage_business(owner_id))
    or (owner_type = 'provider' and exists (
          select 1 from public.providers p where p.id = owner_id and p.user_id = (select auth.uid())::text))
  );

create policy stories_delete_own on public.stories
  for delete to authenticated
  using (
    (owner_type = 'user' and user_id = (select auth.uid())::text)
    or (owner_type = 'business' and public.can_manage_business(owner_id))
    or (owner_type = 'provider' and exists (
          select 1 from public.providers p where p.id = owner_id and p.user_id = (select auth.uid())::text))
  );

notify pgrst, 'reload schema';
