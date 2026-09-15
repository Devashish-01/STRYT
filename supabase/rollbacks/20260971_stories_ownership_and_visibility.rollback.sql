-- Rollback for 20260971_stories_ownership_and_visibility.sql
--
-- Policy text copied by script from pg_policies on production (2026-09-15), not retyped.
-- ⚠ Re-opens: anyone deletes business stories, anyone posts as any business, close-friends stories readable by all.

drop policy if exists stories_select on public.stories;
drop policy if exists stories_insert_own on public.stories;
drop policy if exists stories_update_own on public.stories;
drop policy if exists stories_delete_own on public.stories;

CREATE POLICY "Allow insert access to stories for authenticated" ON public.stories AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((( SELECT auth.role() AS role) = 'authenticated'::text) OR ((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((owner_type = ANY (ARRAY['business'::text, 'provider'::text])) OR ((owner_type = 'user'::text) AND (user_id = (( SELECT auth.uid() AS uid))::text))))));

CREATE POLICY "Allow read access to stories for all" ON public.stories AS PERMISSIVE FOR SELECT TO public
  USING ((true OR (expires_at > now())));

CREATE POLICY "Allow update/delete for owners of stories" ON public.stories AS PERMISSIVE FOR ALL TO public
  USING (((( SELECT auth.uid() AS uid))::text = user_id))
  WITH CHECK (((( SELECT auth.uid() AS uid))::text = user_id));

CREATE POLICY del_stories ON public.stories AS PERMISSIVE FOR DELETE TO public
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((owner_type = ANY (ARRAY['business'::text, 'provider'::text])) OR ((owner_type = 'user'::text) AND (user_id = (( SELECT auth.uid() AS uid))::text)))));

notify pgrst, 'reload schema';
