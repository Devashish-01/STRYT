-- ============================================================
-- One active queue token per customer per business.
-- Run manually in Supabase SQL editor.
--
-- Nothing today stops a customer from joining the same shop's queue twice —
-- the "Join queue" button hid itself only via in-memory React state
-- (useCommerceSlice.queuesJoined), which is wiped on every reload / new
-- session / second device, so a reload + tap created a duplicate WAITING
-- token. Duplicates also corrupt position + ETA math in businessService
-- (a customer's own older token counts as "someone ahead" of their newer one).
--
-- A partial UNIQUE index is the real enforcement point: it lets a customer
-- have any number of SERVED/LEFT history rows for a shop, but at most one
-- live token (WAITING or CALLED) per business at a time. Re-joining after
-- being served or after leaving still works because those rows are excluded.
-- ============================================================

-- Collapse any pre-existing duplicates to a single live token per
-- (business, customer) so the unique index can be created without error.
-- Keep the most recent live token; mark the older ones LEFT.
with ranked as (
  select id,
         row_number() over (
           partition by business_id, customer_user_id
           order by created_at desc
         ) as rn
    from public.queue_tokens
   where status in ('WAITING', 'CALLED')
)
update public.queue_tokens t
   set status = 'LEFT'
  from ranked r
 where t.id = r.id
   and r.rn > 1;

create unique index if not exists queue_tokens_one_active_per_biz
  on public.queue_tokens (business_id, customer_user_id)
  where status in ('WAITING', 'CALLED');
