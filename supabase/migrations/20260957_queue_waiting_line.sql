-- 20260957 — queue_waiting_line(): public queue positions without exposing tokens
--
-- Stage 1 of 3 closing the queue_tokens read hole
-- (docs/database/DRIFT_BASELINE_2026-09-11.md → Security).
--
-- WHY: the live policy queue_tokens_select_all is USING ((true OR …)), so
-- anyone — anon included — can read every token, including customer_name,
-- customer_user_id, payment_amount and payment_reference. It can't simply be
-- tightened yet: the app reads other customers' WAITING rows in two places —
--   * businessService.queue()    public business page "N ahead · ~X min" (guests too)
--   * businessService.myQueues() a customer's position in each of their queues
-- and BusinessDetail live-updates from every change to a business's tokens.
--
-- WHAT (additive only — nothing existing changes):
--   1. queue_waiting_line(p_business_ids) returns only the waiting line:
--      business_id, line_position, party_size, plus my_token_id — the token id
--      on the CALLER'S OWN rows only (null on everyone else's, always null for
--      anon). No names, no other customers' ids, no payment data.
--   2. queue_settings.line_changed_at is bumped whenever a business's line
--      changes, so the public page can live-update from queue_settings (already
--      public-read and in the realtime publication) instead of from tokens.
--
-- NEXT: Stage 2 — the app switches queue(), myQueues() and BusinessDetail over.
--       Stage 3 — tighten queue_tokens SELECT to participants and revoke anon,
--       ONLY once the Stage 2 app update is live; older installs still read
--       tokens directly and would show an empty line.

-- 1 · The waiting line, positions only ─────────────────────────────────────
create or replace function public.queue_waiting_line(p_business_ids text[])
returns table (business_id text, line_position integer, party_size text, my_token_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select t.business_id,
         (row_number() over (partition by t.business_id order by t.created_at, t.id))::integer,
         t.party_size,
         case when t.customer_user_id = (select auth.uid())::text then t.id end
    from public.queue_tokens t
   where t.status = 'WAITING'
     and t.business_id = any (p_business_ids)
     -- Bounded so one call can't sweep every queue; a customer is in a handful
     -- of queues at most and the business page asks for exactly one.
     and cardinality(p_business_ids) between 1 and 50
   order by t.business_id, t.created_at, t.id;
$$;

-- Guests read the line on the public business page, so anon is deliberate.
revoke all on function public.queue_waiting_line(text[]) from public, anon, authenticated;
grant execute on function public.queue_waiting_line(text[]) to anon, authenticated;

-- 2 · Announce line changes on queue_settings ──────────────────────────────
alter table public.queue_settings add column if not exists line_changed_at timestamptz;

create or replace function public.bump_queue_line_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id text;
begin
  if tg_op = 'DELETE' then
    v_business_id := old.business_id;
  else
    v_business_id := new.business_id;
  end if;

  -- now() is fixed for the transaction, so a bulk change (e.g.
  -- close_stale_queue_tokens) announces each business's line once, not per row.
  update public.queue_settings
     set line_changed_at = now()
   where business_id = v_business_id
     and line_changed_at is distinct from now();

  -- A token moving between businesses isn't expected, but announce both lines.
  if tg_op = 'UPDATE' and old.business_id is distinct from new.business_id then
    update public.queue_settings
       set line_changed_at = now()
     where business_id = old.business_id
       and line_changed_at is distinct from now();
  end if;

  return null;
end $$;

-- Fired only by the trigger; nobody calls it directly.
revoke all on function public.bump_queue_line_changed() from public, anon, authenticated;

-- Payment updates don't move the line, so they don't announce anything.
drop trigger if exists trg_queue_line_changed on public.queue_tokens;
create trigger trg_queue_line_changed
  after insert or delete or update of status, party_size, business_id on public.queue_tokens
  for each row execute function public.bump_queue_line_changed();
