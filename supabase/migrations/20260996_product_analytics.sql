-- 20260996_product_analytics
--
-- STRYT has Sentry (crashes) and client_errors (caught failures), but no product analytics at all:
-- no funnel, no time-to-first-response, no retention, no referral attribution. Deciding when to open a
-- second neighbourhood, or whether the first one is alive, is currently guesswork.
--
-- Two pieces, deliberately split by where the truth lives:
--
--   public.events        — things only the client knows: a guest browsing before signing up, a shared
--                          link being opened, a listing being viewed. These cannot be derived from the
--                          database, so the client has to report them.
--
--   marketplace_health() — liquidity, computed from requests/proposals/agreements directly. Deriving
--                          these from client events would be strictly worse: events can be dropped by
--                          an offline device, blocked by an ad blocker or replayed, while the rows are
--                          authoritative. Anything that CAN be counted from real tables is.
--
-- Guest events are the point of the funnel, so `anon` can insert. That is an abuse surface, and it is
-- bounded rather than trusted:
--   * `name` is constrained to a fixed whitelist, so an attacker can inflate the count of a known event
--     but cannot write arbitrary rows or invent event types;
--   * `props` is capped at 2 KB, so the table cannot be used as free storage;
--   * `user_id` defaults to auth.uid() and the policies pin it — a guest may only write a guest row
--     (user_id null) and a signed-in user may only write their own. Neither can forge the other;
--   * reads are admin-only.
-- Inflated counts of known events are a data-quality problem we can spot and discount. Arbitrary writes
-- would be a security problem, and those are what this prevents.
--
-- PII: nothing personal belongs in `props`. The client puts every value through scrubPii (the same
-- function behind the client_errors sink and Sentry's beforeSend) before sending. Under the DPDP Act
-- purpose-limited collection is the requirement, not an aspiration, so the whitelist above is also the
-- statement of what is collected and why.
--
-- Rollback: supabase/rollbacks/20260996_product_analytics.rollback.sql

begin;

-- ── The event sink ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.events (
  id          text primary key default ('ev_' || replace(gen_random_uuid()::text, '-', '')),
  user_id     text default (auth.uid())::text,   -- null for a guest; never sent by the client
  session_id  text,                              -- random per app session; ties a guest journey together
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  app_version text,
  created_at  timestamptz not null default now(),

  -- The whitelist IS the collection notice. Adding an event means a migration and a decision.
  constraint events_name_known check (name in (
    'signup_completed',      -- account created and onboarding finished
    'request_created',       -- someone posted an ask
    'request_viewed',        -- an ask was opened (the only way to measure reach)
    'proposal_created',      -- a seller answered
    'proposal_accepted',     -- the asker picked one
    'booking_created',       -- an appointment or queue join
    'deal_completed',        -- the real-world thing actually happened
    'dispute_opened',        -- trust breaking down
    'review_left',           -- trust being built
    'share_link_opened'      -- a STRYT link travelled through WhatsApp and came back
  )),
  constraint events_props_small check (pg_column_size(props) <= 2048)
);

-- (name, created_at) answers "how many of X this week"; (user_id, created_at) answers retention and
-- per-person funnels; created_at alone backs the sweep in marketplace_health().
create index if not exists events_name_created_idx on public.events (name, created_at desc);
create index if not exists events_user_created_idx on public.events (user_id, created_at desc);
create index if not exists events_created_idx      on public.events (created_at desc);

alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;
grant insert on table public.events to anon, authenticated;

-- A guest may write only a guest row.
create policy events_insert_guest on public.events
  for insert to anon
  with check (user_id is null);

-- A signed-in user may write only their own row (the default already sets it; this pins it).
create policy events_insert_own on public.events
  for insert to authenticated
  with check (user_id = (select auth.uid())::text);

-- Reading the stream is an admin action. Everyone else uses the aggregate below.
grant select on table public.events to authenticated;
create policy events_admin_read on public.events
  for select to authenticated
  using (exists (
    select 1 from public.users a
    where a.id = (select auth.uid())::text
      and (a.roles @> array['admin'] or a.roles @> array['super_admin'])
  ));

-- ── Marketplace health, from the authoritative tables ────────────────────────────────────────────────
-- The numbers that decide whether a neighbourhood is alive. Not MAU: a request that nobody answers is
-- the failure mode that kills a local marketplace, and it is invisible in a signup count.
create or replace function public.marketplace_health(p_days integer default 30)
returns jsonb
language sql
security definer
set search_path to 'public'
stable
as $function$
  with
  admin_check as (
    select 1 from public.users a
    where a.id = (select auth.uid())::text
      and (a.roles @> array['admin'] or a.roles @> array['super_admin'])
  ),
  win as (select now() - make_interval(days => greatest(p_days, 1)) as since),
  r as (
    select q.id, q.created_at,
           (select min(p.created_at) from public.proposals p where p.request_id = q.id) as first_proposal_at,
           (select count(*) from public.proposals p where p.request_id = q.id) as proposal_count
    from public.requests q, win
    where q.created_at >= win.since
  )
  select case when not exists (select 1 from admin_check) then
    jsonb_build_object('error', 'ADMIN_REQUIRED')
  else
    jsonb_build_object(
      'window_days', greatest(p_days, 1),
      'requests', (select count(*) from r),
      -- Liquidity: the share of asks that got at least one answer. The single most important number.
      'requests_answered', (select count(*) from r where proposal_count > 0),
      'answer_rate', (select round(
          case when count(*) = 0 then 0
               else count(*) filter (where proposal_count > 0)::numeric * 100 / count(*) end, 1) from r),
      -- Perceived value: how long someone waits before the first reply.
      'median_minutes_to_first_proposal', (
        select round((percentile_cont(0.5) within group (
          order by extract(epoch from (first_proposal_at - created_at)) / 60))::numeric, 1)
        from r where first_proposal_at is not null),
      -- Competition: more answers per ask means a healthier supply side.
      'median_proposals_per_answered_request', (
        select percentile_cont(0.5) within group (order by proposal_count)
        from r where proposal_count > 0),
      'agreements', (select count(*) from public.agreements a, win where a.created_at >= win.since),
      'deals_completed', (select count(*) from public.agreements a, win
                          where a.created_at >= win.since and a.status = 'COMPLETED'),
      'disputes', (select count(*) from public.agreements a, win
                   where a.created_at >= win.since and a.status = 'DISPUTED'),
      'active_sellers', (
        select count(distinct p.responder_user_id) from public.proposals p, win
        where p.created_at >= win.since),
      'generated_at', now()
    )
  end
$function$;

revoke all on function public.marketplace_health(integer) from public, anon, authenticated;
grant execute on function public.marketplace_health(integer) to authenticated;

notify pgrst, 'reload schema';

commit;

-- Verify:
--   select to_regclass('public.events');                       -- public.events
--   select polname from pg_policy where polrelid = 'public.events'::regclass;
--   select public.marketplace_health(30);                      -- ADMIN_REQUIRED unless caller is admin
