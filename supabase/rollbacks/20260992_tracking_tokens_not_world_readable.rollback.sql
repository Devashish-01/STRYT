-- Rollback for 20260992_tracking_tokens_not_world_readable
--
-- Restores public.tracking_tokens to its exact pre-migration state as read from the live catalog on
-- 2026-09-20 (pg_policy + information_schema.role_table_grants), not from memory.
--
-- WARNING: applying this re-opens the P0 it closed — tt_read is FOR SELECT TO PUBLIC USING (true), which
-- lets any holder of the publishable key enumerate every live tracking token and replay it through
-- get_tracking(). Only run this if 20260992 is shown to break a real flow, and close the hole another
-- way in the same session.

begin;

grant delete, insert, references, select, trigger, truncate, update
  on table public.tracking_tokens to anon;
grant delete, insert, references, select, trigger, truncate, update
  on table public.tracking_tokens to authenticated;

create policy tt_read on public.tracking_tokens
  as permissive for select to public
  using (true);

create policy tt_insert on public.tracking_tokens
  as permissive for insert to public
  with check (
    ((select auth.uid())::text in (
      select agreements.requester_user_id
        from agreements
       where agreements.id = tracking_tokens.agreement_id
      union
      select agreements.responder_user_id
        from agreements
       where agreements.id = tracking_tokens.agreement_id
    ))
  );

commit;
