-- Feedback #5 — "delete business from user profile button is not there".
--
-- It genuinely wasn't: zero matches app-wide for any delete-business path.
--
-- This is NOT implemented as a hard delete, and that is the whole design
-- decision. A business is referenced by appointments, deliveries, catalogue
-- items, queue tokens, reviews, loyalty cards and access grants — most with
-- `on delete cascade`. A DELETE FROM businesses would therefore silently
-- destroy OTHER PEOPLE'S booking and payment history to satisfy one owner's
-- tap. Customers would lose records of money they'd already spent.
--
-- So: soft delete.
--   · status -> 'DELETED' (new enum value, added in the previous migration).
--     Every discovery path already filters `status = 'ACTIVE'`, so the shop
--     disappears from search, the map and nearby feeds with NO query changes —
--     which is exactly why this rides on status rather than on deleted_at
--     alone: there is no filter left un-updated by accident.
--   · deleted_at records when, for support and for any future purge job.
--   · Nothing is destroyed. Existing appointments keep resolving.
--
-- Owner-only, and deliberately refuses while real work is outstanding — a shop
-- with someone's confirmed booking on the calendar is not the owner's alone to
-- vanish. They must see those out first.
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as
-- `delete_business`.

alter table public.businesses
  add column if not exists deleted_at timestamptz;

create or replace function public.delete_business(p_business_id text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid     text := auth.uid()::text;
  v_owner   text;
  v_status  text;
  v_live    int;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select owner_user_id, status::text into v_owner, v_status
    from public.businesses where id = p_business_id for update;
  if v_owner is null then raise exception 'BUSINESS_NOT_FOUND'; end if;

  -- Owner only. A FULL delegate manages the shop; they do not get to end it.
  if v_owner is distinct from v_uid then
    raise exception 'Only the business owner can delete this business.';
  end if;

  if v_status = 'DELETED' then
    raise exception 'This business is already deleted.';
  end if;

  -- Outstanding commitments to other people block the delete.
  -- The live statuses are PENDING and ACCEPTED — appointments_status_check is
  -- ('PENDING','ACCEPTED','REJECTED','COMPLETED','CANCELLED','NO_SHOW'). There
  -- is no 'CONFIRMED'; guarding on that name (as this first did) silently
  -- matched nothing and would have let an owner delete a shop with accepted
  -- bookings on the calendar — the precise thing this check exists to stop.
  select count(*) into v_live
    from public.appointments a
   where a.target_type = 'BUSINESS'
     and a.target_id = p_business_id
     and a.status in ('PENDING','ACCEPTED')
     and a.scheduled_for >= now();
  if v_live > 0 then
    raise exception 'You have % upcoming booking(s). Cancel or complete them before deleting.', v_live;
  end if;

  update public.businesses
     set status = 'DELETED', deleted_at = now()
   where id = p_business_id;

  -- Revoke every team/delegate grant: the console is gone, so the access to it
  -- must be too. Leaving ACTIVE rows behind would keep the business in those
  -- users' account switchers pointing at a dead console.
  update public.business_access_sessions
     set status = 'REVOKED', decided_at = now()
   where business_id = p_business_id
     and status in ('PENDING','ACTIVE');
end $function$;

revoke all on function public.delete_business(text) from public, anon;
grant execute on function public.delete_business(text) to authenticated;
