-- ============================================================
-- 20260933 — BUSINESS_ONBOARDING #23: nothing told an admin that a business
-- had been submitted for review.
--
-- A new business is inserted with status 'PENDING' and is invisible in
-- discovery until an admin approves it. The admin console has a queue, but it
-- is a screen somebody has to remember to open — there was no signal at all
-- that anything was waiting in it. The onboarding screen promises "~24 hours",
-- a promise nothing in the system was set up to keep.
--
-- Fires on the transition INTO 'PENDING', not merely on INSERT, so a
-- resubmission after a rejection (businessService.submitForReview sets PENDING
-- again) notifies too — that's the same "something needs a decision" event, and
-- a rejected owner who fixed their listing is exactly who a silent queue
-- strands longest.
--
-- Deliberately no notification when a business is created ACTIVE by some other
-- path: nothing needs deciding.
-- ============================================================

create or replace function public.notify_admins_business_pending()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_admin record;
begin
  -- Only the edge into PENDING. On INSERT, OLD is unassigned — referencing it
  -- raises — so TG_OP is checked rather than coalescing the two records.
  if new.status is distinct from 'PENDING' then return new; end if;
  if TG_OP = 'UPDATE' and old.status is not distinct from 'PENDING' then return new; end if;

  for v_admin in
    select id from public.users where 'admin' = any(roles)
  loop
    insert into public.notifications (user_id, type, title, body, deep_link, entity_type, entity_id)
    values (
      v_admin.id,
      'ADMIN_REVIEW_QUEUE',
      'Business awaiting review',
      coalesce(new.name, 'A business') ||
        coalesce(' · ' || nullif(new.city, ''), '') ||
        ' is waiting for approval.',
      '/admin',
      'BUSINESS',
      new.id
    );
  end loop;

  return new;
end
$$;

drop trigger if exists trg_notify_admins_business_pending on public.businesses;
create trigger trg_notify_admins_business_pending
  after insert or update of status on public.businesses
  for each row
  execute function public.notify_admins_business_pending();
