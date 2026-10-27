# Instrumentation Guide

## Target: STRYT first-party sink (Supabase `public.events`)

Generated from `tracking-plan.yaml` v1.0.1 on 2026-10-27. Builds on the wiring described in `.telemetry/current-implementation.md`: one typed `track()` wrapper, a CHECK-constrained whitelist, RLS-pinned `user_id`, and PII scrubbing. All of that stays. The new parts:

- **A second writer.** `public.emit_event()` runs inside Postgres, called from triggers on the source tables, and records every state change in the same transaction as the write.
- **Group context.** `seller_type`, `seller_id` and `actor_role` become first-class columns.
- **Internal-user exclusion.** It happens once, in the database, for both writers.

There is no vendor SDK, API key or HTTP queue. The generic "frontend → backend endpoint → queue → worker" architecture collapses here because PostgREST plus RLS is the endpoint and the database is the destination. See Coverage Gaps.

## SDK Setup

### Dependencies
Nothing new. Already installed and used: `@supabase/supabase-js` (client writer) and `@capacitor/core` (platform detection). The DB side needs `pg_cron` (already used, see `20260803_queue_auto_close_and_cancel.sql`).

### Initialization
- **Client:** none. `track()` lazily uses `getSupabase()` (`src/lib/supabaseClient.ts`).
- **Database:** one migration, `supabase/migrations/20261009_analytics_v1.sql` (complete below), with its rollback `supabase/rollbacks/20261009_analytics_v1.rollback.sql`. After applying it, regenerate `src/types/database.types.ts` so the new `events` columns typecheck.

### Environment Variables
| Variable | Purpose | Required |
|----------|---------|----------|
| `VITE_SUPABASE_URL` | Existing. Sink endpoint | yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_ANON_KEY` | Existing. Guest and user inserts under RLS | yes |
| `__APP_VERSION__` (Vite define) | Existing. Fills `app_version` on client rows | yes |

No analytics-specific secret exists, by design. `emit_event` runs with database privileges and is not executable by `anon` or `authenticated`.

## Identity

### identify()

**Syntax:** there is no identify call. Identity is the `events.user_id` column, defaulted from `auth.uid()` and pinned by RLS for client rows, and set explicitly by `emit_event` for DB rows. User traits are never copied into events. They're read through a view at query time, so nothing personal leaves `public.users`.

**User Traits** (view `analytics.user_traits`, admin/SQL-console only):
| Trait | Type | PII | Notes |
|-------|------|-----|-------|
| `user_id` | string | no | Supabase Auth UUID as text |
| `created_at` | datetime | no | `users.created_at` |
| `area` | string | no | `users.area`, a coarse locality label. Never `lat`/`lng`/`unit_number`. |
| `society_id` | string | no | |
| `language` | string | no | `users.language` |
| `has_business` / `has_provider` | boolean | no | owns ≥1 business / provider |
| `first_deal_completed_at` | datetime | no | first `deal_completed` with `props.customer_id` = this user |
| `last_active_at` | datetime | no | `max(events.created_at)` as actor |
| `deals_completed_count`, `requests_created_count` | integer | no | computed in the view. Move them into a materialized view if the view gets slow. |

`is_team_member` from the plan is deferred. `business_team_members` has no `user_id` column (members are matched by phone), so it can't be joined without touching personal data. See Coverage Gaps.

**When to Call:** never. The view always shows current values. Snapshot traits refresh daily (see Architecture).

**Template Code:** the `analytics.user_traits` view in the migration below.

### group()

**Syntax:** there is no group call. Group membership travels on every event as two columns, `seller_type` + `seller_id`. Group traits come from the `analytics.seller_traits` view. A group "comes into existence" with the `seller_created` event (Release 2).

**Group Hierarchy:**
| Level | Mapping | ID Source | Parent |
|-------|---------|-----------|--------|
| `seller` (business) | `seller_type='business'`, `seller_id=businesses.id` | `b_*` | none (flat) |
| `seller` (provider) | `seller_type='provider'`, `seller_id=providers.id` | `p_*` | none (flat) |

**Group Traits** (view `analytics.seller_traits` + materialized `analytics.seller_snapshot`):
| Trait | Type | Notes |
|-------|------|-------|
| `seller_type`, `seller_id`, `category_id`, `status`, `is_verified`, `created_at` | live | straight from `businesses` / `providers` |
| `area` | live | businesses: `city`. Providers have no locality column, so null. |
| `pro_tier` | live | always null until Pro plans launch (`pro_until` exists, tier does not) |
| `catalog_item_count`, `views_30d`, `proposals_sent_30d`, `deals_completed_30d`, `median_response_minutes_30d` | daily | materialized view |
| `team_member_count` | daily | businesses only |

**When to Call:**
- **Creation:** `seller_created` fires from an insert trigger on `businesses` / `providers` (Release 2).
- **Trait change:** nothing to do. The live view reads the source row.
- **Scheduled:** `refresh materialized view concurrently analytics.seller_snapshot`, daily at 02:30 IST, via `pg_cron`.

**Template Code:** the `analytics.seller_traits` view and `analytics.seller_snapshot` in the migration below.

## Events

### track()

There are two writers with one contract. Which one an event uses is fixed by `source:` in the tracking plan. **Never both.**

| Writer | Signature | Used for |
|--------|-----------|----------|
| Client | `track(name, props)` or `track(name, props, seller)` | 11 `source: client` events |
| Database | `perform public.emit_event(name, props, seller_type, seller_id, actor_role)` | 17 `source: db` events |

**Constraints:**
- `name` must be in `events_name_known`. Anything else is rejected. Client failures are swallowed, and `emit_event` downgrades the error to a `WARNING`. A new event always means a migration.
- `props` must be flat, categorical and ≤ 2 KB: IDs, enums, booleans, counts, rupee amounts. Never names, phone numbers, addresses, coordinates or typed text. The client scrubs as a backstop. `emit_event` callers choose columns explicitly, so don't pass `to_jsonb(new)`.
- Client rows are forced to `source = 'client'` by RLS. Only `emit_event` can write `source = 'db'`.
- `emit_event` swallows its own errors. An analytics bug can never roll back a booking or a deal.

**Template Code: client** (`src/screens/business/BusinessDetail.tsx`, a seller-scoped event):
```ts
import { track } from "@/lib/analytics";

useEffect(() => {
  if (b?.id) track("seller_viewed", { is_guest: isGuest, entry_source: entrySource }, { type: "business", id: b.id });
}, [b?.id, isGuest, entrySource]);
```

**Template Code: client** (`src/services/core/authService.ts:143`, an event with no group):
```ts
track("otp_sent", { is_native: isNativePlatform(), is_resend: opts.resend === true });
```

**Template Code: database** (the north star, `deal_completed`, from queue tokens):
```sql
perform public.emit_event(
  'deal_completed',
  jsonb_build_object(
    'deal_type', 'queue',
    'deal_id', new.id::text,
    'customer_id', new.customer_user_id,
    'deal_value', new.payment_amount,
    'minutes_to_complete', public.analytics_minutes_since(new.created_at),
    'is_repeat_customer', exists (
      select 1 from public.queue_tokens q
      where q.customer_user_id = new.customer_user_id and q.business_id = new.business_id
        and q.status = 'SERVED' and q.id <> new.id)),
  'business', new.business_id,
  public.analytics_actor_role('business', new.business_id));
```

**Moving an event from client to database** (for example `deal_completed`): in the same release, delete `track("deal_completed")` at `src/services/engagement/requestService.ts:566`. The trigger now covers that path, plus the appointment and queue paths the client never covered.

### Group-Level Attribution

Every event whose plan entry says `group_level: seller` must carry both `seller_type` and `seller_id`. A CHECK constraint guarantees they are set or null together. Where the seller comes from:

| Situation | `seller_type` / `seller_id` source |
|-----------|-------------------------------------|
| Customer acts on a seller (booking, view, call) | the target: `appointments.target_type/target_id`, `queue_tokens.business_id`, the profile being viewed |
| Seller answers a request | `proposals.responder_type/responder_entity_id`, when `responder_type` is business or provider (individuals answering as themselves have no seller) |
| Agreement lifecycle | `agreements.responder_type/responder_entity_id` |
| Delivery | `appointment_deliveries.business_id` |
| Rating | `ratings.ratee_type/ratee_id` when the ratee is a business or provider |

`actor_role` records *who* acted. `analytics_actor_role(seller_type, seller_id)` derives it inside triggers:

| Value | Meaning |
|-------|---------|
| `system` | no `auth.uid()` (cron sweep, timeout) |
| `seller` | the owner of that business or provider |
| `staff` | has `has_business_access` but is not the owner |
| `customer` | anyone else |

The client sets it statically: `staff` for `delivery_declined`, `customer` otherwise.

The plan has one group level, and per-event attribution is explicit (columns, not inferred), so there is no multi-level rollup to configure. "Deals per seller" is `group by seller_id`, and "deals per area" joins `analytics.seller_traits`.

## Complete Tracking Module

Three files. They're complete, so copy them as-is.

### 1. `supabase/migrations/20261009_analytics_v1.sql` (Release 1)

```sql
-- 20261009_analytics_v1
--
-- Product analytics v1 — implements .telemetry/tracking-plan.yaml v1.0.0, Release 1:
--   * events gains group context (seller_type, seller_id), actor_role, source, platform;
--   * public.emit_event() — the database writer. Every state change is recorded here, in the same transaction as
--     the write, so nothing is lost to an offline device, an ad blocker, or a staff-side action the client never saw;
--   * internal-user exclusion in one place (a BEFORE INSERT trigger), for both writers;
--   * the whitelist becomes the 28 plan events + the 7 retired delivery names, kept for one release so old native
--     builds keep landing (they are rewritten below and again in Release 3);
--   * triggers for the events that move from client to database, plus analytics views.
--
-- Rollback: supabase/rollbacks/20261009_analytics_v1.rollback.sql

begin;

-- ── 1. Envelope columns ─────────────────────────────────────────────────────────────────────────────
alter table public.events
  add column if not exists source      text not null default 'client',
  add column if not exists platform    text,
  add column if not exists seller_type text,
  add column if not exists seller_id   text,
  add column if not exists actor_role  text;

alter table public.events
  add constraint events_source_known   check (source in ('client', 'db')),
  add constraint events_platform_known check (platform is null or platform in ('web', 'android', 'ios', 'server')),
  add constraint events_seller_known   check (seller_type is null or seller_type in ('business', 'provider')),
  add constraint events_seller_pair    check ((seller_type is null) = (seller_id is null)),
  add constraint events_actor_known    check (actor_role is null or actor_role in ('customer', 'seller', 'staff', 'system'));

create index if not exists events_seller_name_created_idx
  on public.events (seller_id, name, created_at desc) where seller_id is not null;

-- ── 2. Client inserts may only write client rows ────────────────────────────────────────────────────
drop policy if exists events_insert_guest on public.events;
create policy events_insert_guest on public.events
  for insert to anon
  with check (user_id is null and source = 'client' and actor_role is distinct from 'system');

drop policy if exists events_insert_own on public.events;
create policy events_insert_own on public.events
  for insert to authenticated
  with check (user_id = (select auth.uid())::text and source = 'client' and actor_role is distinct from 'system');

-- ── 3. Whitelist: 28 plan events + 7 legacy delivery names (drop the legacy ones in Release 3) ─────
alter table public.events drop constraint if exists events_name_known;
alter table public.events add constraint events_name_known check (name in (
  -- client
  'otp_sent', 'otp_verified', 'otp_failed', 'signup_completed', 'request_viewed', 'search_performed',
  'seller_viewed', 'seller_contacted', 'notification_opened', 'share_link_opened', 'delivery_declined',
  -- db
  'seller_created', 'seller_verified', 'request_created', 'proposal_created', 'proposal_accepted',
  'agreement_cancelled', 'booking_created', 'booking_cancelled', 'deal_completed', 'dispute_opened',
  'review_left', 'delivery_status_changed', 'delivery_cash_collected', 'delivery_cash_settled',
  'team_member_added', 'conversation_started', 'community_post_created',
  -- legacy, Release 3 removes
  'delivery_packed', 'delivery_assigned', 'delivery_picked_up', 'delivery_started', 'delivery_arrived',
  'delivery_delivered', 'delivery_failed'
));

-- ── 4. Internal-user exclusion (internal_user_policy: by_role) ─────────────────────────────────────
create or replace function public.events_drop_internal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.user_id is not null and exists (
    select 1 from public.users u
    where u.id = new.user_id and u.roles && array['admin', 'super_admin']::text[]
  ) then
    return null;   -- silently skip the row
  end if;
  return new;
end
$function$;
revoke all on function public.events_drop_internal() from public, anon, authenticated;

drop trigger if exists events_drop_internal on public.events;
create trigger events_drop_internal before insert on public.events
  for each row execute function public.events_drop_internal();

-- ── 5. Helpers ──────────────────────────────────────────────────────────────────────────────────────
create or replace function public.analytics_actor_role(p_seller_type text, p_seller_id text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when auth.uid() is null then 'system'
    when p_seller_type = 'business' and exists (
      select 1 from public.businesses b where b.id = p_seller_id and b.owner_user_id = (select auth.uid())::text) then 'seller'
    when p_seller_type = 'provider' and exists (
      select 1 from public.providers p where p.id = p_seller_id and p.user_id = (select auth.uid())::text) then 'seller'
    when p_seller_type = 'business' and public.has_business_access(p_seller_id, (select auth.uid())::text) then 'staff'
    else 'customer'
  end
$function$;
revoke all on function public.analytics_actor_role(text, text) from public, anon, authenticated;

create or replace function public.analytics_minutes_since(p_from timestamptz)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select greatest(0, floor(extract(epoch from (now() - p_from)) / 60))::integer
$function$;
revoke all on function public.analytics_minutes_since(timestamptz) from public, anon, authenticated;

-- ── 6. The database writer ──────────────────────────────────────────────────────────────────────────
-- Callers pass only IDs, enums, counts and amounts — never to_jsonb(new). Errors are downgraded to a
-- WARNING: an analytics bug must never roll back the booking or deal that triggered it.
create or replace function public.emit_event(
  p_name        text,
  p_props       jsonb default '{}'::jsonb,
  p_seller_type text  default null,
  p_seller_id   text  default null,
  p_actor_role  text  default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := (select auth.uid())::text;
begin
  insert into public.events (name, props, user_id, source, platform, seller_type, seller_id, actor_role)
  values (
    p_name,
    coalesce(p_props, '{}'::jsonb),
    v_uid,
    'db',
    'server',
    case when p_seller_id is not null then p_seller_type end,
    case when p_seller_type is not null then p_seller_id end,
    coalesce(p_actor_role, case when v_uid is null then 'system' else 'customer' end)
  );
exception when others then
  raise warning 'emit_event(%) dropped: %', p_name, sqlerrm;
end
$function$;
revoke all on function public.emit_event(text, jsonb, text, text, text) from public, anon, authenticated;

-- ── 7. Triggers — Release 1 (events moving from client to db) ──────────────────────────────────────

-- requests: request_created
create or replace function public.analytics_requests_ai()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.emit_event('request_created', jsonb_build_object(
    'request_id', new.id,
    'category_id', new.category_id,
    'is_bulk', new.bulk_price_per_unit is not null),
    null, null, 'customer');
  return null;
end
$function$;
revoke all on function public.analytics_requests_ai() from public, anon, authenticated;
drop trigger if exists analytics_requests_ai on public.requests;
create trigger analytics_requests_ai after insert on public.requests
  for each row execute function public.analytics_requests_ai();

-- proposals: proposal_created
create or replace function public.analytics_proposals_ai()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text := case when new.responder_type in ('business', 'provider') then new.responder_type end;
  v_id   text := case when new.responder_type in ('business', 'provider') then new.responder_entity_id end;
begin
  perform public.emit_event('proposal_created', jsonb_build_object(
    'proposal_id', new.id,
    'request_id', new.request_id,
    'is_first_proposal', not exists (
      select 1 from public.proposals p where p.request_id = new.request_id and p.id <> new.id),
    'minutes_since_request', public.analytics_minutes_since((select r.created_at from public.requests r where r.id = new.request_id)),
    'price', new.price),
    v_type, v_id, coalesce(public.analytics_actor_role(v_type, v_id), 'seller'));
  return null;
end
$function$;
revoke all on function public.analytics_proposals_ai() from public, anon, authenticated;
drop trigger if exists analytics_proposals_ai on public.proposals;
create trigger analytics_proposals_ai after insert on public.proposals
  for each row execute function public.analytics_proposals_ai();

-- agreements: proposal_accepted (insert), deal_completed / dispute_opened (status change)
create or replace function public.analytics_agreements_aiu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text := case when new.responder_type in ('business', 'provider') then new.responder_type end;
  v_id   text := case when new.responder_type in ('business', 'provider') then new.responder_entity_id end;
  v_req  public.requests%rowtype;
begin
  select * into v_req from public.requests r where r.id = new.request_id;

  if tg_op = 'INSERT' then
    -- Both accept_proposal and accept_proposal_counter create the agreement, so one trigger covers both paths.
    perform public.emit_event('proposal_accepted', jsonb_build_object(
      'proposal_id', new.proposal_id,
      'request_id', new.request_id,
      'agreement_id', new.id,
      -- accept_proposal_counter writes the counter amount as agreed_price; accept_proposal writes the proposal price.
      'is_via_counter', new.agreed_price is distinct from (select p.price from public.proposals p where p.id = new.proposal_id),
      'proposal_count', (select count(*) from public.proposals p where p.request_id = new.request_id)),
      v_type, v_id, 'customer');
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'COMPLETED' then
    perform public.emit_event('deal_completed', jsonb_build_object(
      'deal_type', 'request',
      'deal_id', new.id,
      'customer_id', new.requester_user_id,
      'category_id', v_req.category_id,
      'fulfillment_type', v_req.fulfillment_type,
      'deal_value', coalesce(new.payment_amount, new.agreed_price),
      'minutes_to_complete', public.analytics_minutes_since(v_req.created_at),
      'is_repeat_customer', exists (
        select 1 from public.agreements a
        where a.requester_user_id = new.requester_user_id
          and coalesce(a.responder_entity_id, a.responder_user_id) = coalesce(new.responder_entity_id, new.responder_user_id)
          and a.status = 'COMPLETED' and a.id <> new.id)),
      v_type, v_id, public.analytics_actor_role(v_type, v_id));
  elsif new.status = 'DISPUTED' then
    perform public.emit_event('dispute_opened', jsonb_build_object(
      'agreement_id', new.id,
      'disputed_from_status', old.status::text),
      v_type, v_id, public.analytics_actor_role(v_type, v_id));
  -- Release 2 adds: elsif new.status = 'CANCELLED' then agreement_cancelled
  end if;
  return null;
end
$function$;
revoke all on function public.analytics_agreements_aiu() from public, anon, authenticated;
drop trigger if exists analytics_agreements_aiu on public.agreements;
create trigger analytics_agreements_aiu after insert or update of status on public.agreements
  for each row execute function public.analytics_agreements_aiu();

-- appointments: booking_created (insert), deal_completed (status → COMPLETED)
create or replace function public.analytics_appointments_aiu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text := lower(new.target_type);   -- BUSINESS / PROVIDER → business / provider
begin
  if tg_op = 'INSERT' then
    perform public.emit_event('booking_created', jsonb_build_object(
      'booking_id', new.id,
      'booking_type', 'appointment',
      'fulfillment_type', new.fulfillment_type),
      v_type, new.target_id, public.analytics_actor_role(v_type, new.target_id));
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'COMPLETED' then
    perform public.emit_event('deal_completed', jsonb_build_object(
      'deal_type', 'appointment',
      'deal_id', new.id,
      'customer_id', new.customer_user_id,
      'category_id', case v_type
        when 'business' then (select b.category_id from public.businesses b where b.id = new.target_id)
        else (select p.category_id from public.providers p where p.id = new.target_id) end,
      'fulfillment_type', new.fulfillment_type,
      'deal_value', coalesce(new.payment_amount, new.package_price)::integer,
      'minutes_to_complete', public.analytics_minutes_since(new.created_at),
      'is_repeat_customer', exists (
        select 1 from public.appointments a
        where a.customer_user_id = new.customer_user_id and a.target_id = new.target_id
          and a.status = 'COMPLETED' and a.id <> new.id)),
      v_type, new.target_id, public.analytics_actor_role(v_type, new.target_id));
  -- Release 2 adds: elsif new.status in ('REJECTED', 'CANCELLED', 'NO_SHOW') then booking_cancelled
  end if;
  return null;
end
$function$;
revoke all on function public.analytics_appointments_aiu() from public, anon, authenticated;
drop trigger if exists analytics_appointments_aiu on public.appointments;
create trigger analytics_appointments_aiu after insert or update of status on public.appointments
  for each row execute function public.analytics_appointments_aiu();

-- queue_tokens: booking_created (insert), deal_completed (status → SERVED)
create or replace function public.analytics_queue_tokens_aiu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    perform public.emit_event('booking_created', jsonb_build_object(
      'booking_id', new.id::text,
      'booking_type', 'queue'),
      'business', new.business_id, public.analytics_actor_role('business', new.business_id));
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'SERVED' then
    perform public.emit_event('deal_completed', jsonb_build_object(
      'deal_type', 'queue',
      'deal_id', new.id::text,
      'customer_id', new.customer_user_id,          -- null for a walk-in guest
      'category_id', (select b.category_id from public.businesses b where b.id = new.business_id),
      'deal_value', new.payment_amount,
      'minutes_to_complete', public.analytics_minutes_since(new.created_at),
      'is_repeat_customer', exists (
        select 1 from public.queue_tokens q
        where q.customer_user_id = new.customer_user_id and q.business_id = new.business_id
          and q.status = 'SERVED' and q.id <> new.id)),
      'business', new.business_id, public.analytics_actor_role('business', new.business_id));
  -- Release 2 adds: elsif new.status = 'LEFT' then booking_cancelled (outcome 'left')
  end if;
  return null;
end
$function$;
revoke all on function public.analytics_queue_tokens_aiu() from public, anon, authenticated;
drop trigger if exists analytics_queue_tokens_aiu on public.queue_tokens;
create trigger analytics_queue_tokens_aiu after insert or update of status on public.queue_tokens
  for each row execute function public.analytics_queue_tokens_aiu();

-- Remaining Release 1 db events follow the same shape. See "Trigger map" below:
--   review_left (ratings insert), delivery_status_changed (appointment_deliveries status/live_status +
--   the order-ready RPC), delivery_cash_collected / delivery_cash_settled (inside their RPCs).

-- Indexes behind is_repeat_customer — one probe per completed deal.
create index if not exists agreements_repeat_idx   on public.agreements   (requester_user_id, responder_entity_id) where status = 'COMPLETED';
create index if not exists appointments_repeat_idx on public.appointments (customer_user_id, target_id)          where status = 'COMPLETED';
create index if not exists queue_tokens_repeat_idx on public.queue_tokens (customer_user_id, business_id)        where status = 'SERVED';

-- ── 8. Rewrite history to the v1 shape ──────────────────────────────────────────────────────────────
update public.events set
  props = case name
    when 'delivery_packed'    then jsonb_build_object('status', 'packed')
    when 'delivery_assigned'  then jsonb_strip_nulls(jsonb_build_object('status', 'assigned', 'assignment_type', props->>'kind', 'stop_count', (props->>'stops')::int))
    when 'delivery_picked_up' then jsonb_build_object('status', 'picked_up')
    when 'delivery_started'   then jsonb_build_object('status', 'on_the_way', 'is_legacy_ambiguous', true)  -- was LEAVING or ON_THE_WAY
    when 'delivery_arrived'   then jsonb_build_object('status', 'arrived')
    when 'delivery_delivered' then jsonb_build_object('status', 'delivered')
    when 'delivery_failed'    then jsonb_build_object('status', 'failed', 'failure_reason', props->>'reason')
  end,
  name = 'delivery_status_changed'
where name in ('delivery_packed', 'delivery_assigned', 'delivery_picked_up', 'delivery_started',
               'delivery_arrived', 'delivery_delivered', 'delivery_failed');

update public.events set props = (props - 'native' - 'resend' - 'auto' - 'code' - 'provider' - 'guest' - 'kind' - 'valid'
                                        - 'interests' - 'skipped_location')
  || jsonb_strip_nulls(jsonb_build_object(
       'is_native',           props->'native',
       'is_resend',           props->'resend',
       'is_auto_verified',    props->'auto',
       'error_code',          props->'code',
       'provider_error_code', props->'provider',
       'is_guest',            props->'guest',
       'assignment_type',     case when name = 'delivery_declined' then props->'kind' end,
       'link_type',           case when name = 'share_link_opened' then props->'kind' end,
       'is_valid',            props->'valid',
       'interest_count',      props->'interests',
       'has_location',        case when props ? 'skipped_location' then to_jsonb(not (props->>'skipped_location')::boolean) end))
where name in ('otp_sent', 'otp_verified', 'otp_failed', 'request_viewed', 'delivery_declined', 'share_link_opened', 'signup_completed');

-- Historical rows keep source = 'client' (column default) and platform = null: the old wrapper never recorded it.

-- ── 9. Trait views (admin / SQL console only) ───────────────────────────────────────────────────────
create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

create or replace view analytics.user_traits as
select
  u.id                                                     as user_id,
  u.created_at,
  u.area,
  u.society_id,
  u.language,
  exists (select 1 from public.businesses b where b.owner_user_id = u.id) as has_business,
  exists (select 1 from public.providers  p where p.user_id = u.id)       as has_provider,
  -- deal_completed.user_id is whoever marked it done (often staff), so the customer comes from props.customer_id.
  (select min(e.created_at) from public.events e
    where e.name = 'deal_completed' and e.props->>'customer_id' = u.id) as first_deal_completed_at,
  (select count(*) from public.events e
    where e.name = 'deal_completed' and e.props->>'customer_id' = u.id) as deals_completed_count,
  (select count(*) from public.requests r where r.requester_user_id = u.id) as requests_created_count,
  (select max(e.created_at) from public.events e where e.user_id = u.id)  as last_active_at
from public.users u;

create or replace view analytics.seller_traits as
select 'business'::text as seller_type, b.id as seller_id, b.category_id, b.status::text as status,
       coalesce(b.is_verified, false) as is_verified, b.city as area, b.created_at,
       null::text as pro_tier
from public.businesses b
union all
select 'provider', p.id, p.category_id, p.status::text, coalesce(p.is_verified, false), null, p.created_at, null
from public.providers p;

create materialized view if not exists analytics.seller_snapshot as
select
  s.seller_type,
  s.seller_id,
  (select count(*) from public.catalog_items c
    where (s.seller_type = 'business' and c.business_id = s.seller_id)
       or (s.seller_type = 'provider' and c.provider_id = s.seller_id))                     as catalog_item_count,
  case when s.seller_type = 'business' then
    (select count(*) from public.business_team_members m where m.business_id = s.seller_id) end as team_member_count,
  case s.seller_type
    when 'business' then (select count(*) from public.business_view_logs v
                           where v.business_id = s.seller_id and v.viewed_at > now() - interval '30 days')
    else (select count(*) from public.provider_view_logs v
           where v.provider_id = s.seller_id and v.viewed_at > now() - interval '30 days') end  as views_30d,
  (select count(*) from public.events e where e.seller_id = s.seller_id and e.name = 'proposal_created'
     and e.created_at > now() - interval '30 days')                                        as proposals_sent_30d,
  (select count(*) from public.events e where e.seller_id = s.seller_id and e.name = 'deal_completed'
     and e.created_at > now() - interval '30 days')                                        as deals_completed_30d,
  (select percentile_cont(0.5) within group (order by (e.props->>'minutes_since_request')::numeric)
     from public.events e where e.seller_id = s.seller_id and e.name = 'proposal_created'
      and e.created_at > now() - interval '30 days')                                       as median_response_minutes_30d,
  now()                                                                                    as refreshed_at
from analytics.seller_traits s;

create unique index if not exists seller_snapshot_pk on analytics.seller_snapshot (seller_type, seller_id);

do $$
begin
  perform cron.schedule('refresh-seller-snapshot', '0 21 * * *',   -- 21:00 UTC = 02:30 IST
    'refresh materialized view concurrently analytics.seller_snapshot;');
exception when others then null;
end $$;

notify pgrst, 'reload schema';

commit;

-- Verify:
--   insert as a normal user via the app, then: select name, source, seller_type, actor_role from public.events order by created_at desc limit 20;
--   update public.queue_tokens set status = 'SERVED' where id = '<test token>';   -- one deal_completed row, source = 'db'
--   select * from analytics.seller_snapshot limit 5;
```

### 2. `supabase/rollbacks/20261009_analytics_v1.rollback.sql`

```sql
begin;

do $$ begin perform cron.unschedule('refresh-seller-snapshot'); exception when others then null; end $$;
drop materialized view if exists analytics.seller_snapshot;
drop view if exists analytics.seller_traits;
drop view if exists analytics.user_traits;
drop schema if exists analytics;

drop trigger if exists analytics_requests_ai      on public.requests;
drop trigger if exists analytics_proposals_ai     on public.proposals;
drop trigger if exists analytics_agreements_aiu   on public.agreements;
drop trigger if exists analytics_appointments_aiu on public.appointments;
drop trigger if exists analytics_queue_tokens_aiu on public.queue_tokens;
drop trigger if exists events_drop_internal       on public.events;

drop function if exists public.analytics_requests_ai();
drop function if exists public.analytics_proposals_ai();
drop function if exists public.analytics_agreements_aiu();
drop function if exists public.analytics_appointments_aiu();
drop function if exists public.analytics_queue_tokens_aiu();
drop function if exists public.emit_event(text, jsonb, text, text, text);
drop function if exists public.analytics_actor_role(text, text);
drop function if exists public.analytics_minutes_since(timestamptz);
drop function if exists public.events_drop_internal();

drop index if exists public.agreements_repeat_idx;
drop index if exists public.appointments_repeat_idx;
drop index if exists public.queue_tokens_repeat_idx;
drop index if exists public.events_seller_name_created_idx;

-- Restore the 20260996 policies. The 20261003 whitelist is restored by re-running its constraint block.
drop policy if exists events_insert_guest on public.events;
create policy events_insert_guest on public.events for insert to anon with check (user_id is null);
drop policy if exists events_insert_own on public.events;
create policy events_insert_own on public.events for insert to authenticated with check (user_id = (select auth.uid())::text);

alter table public.events
  drop constraint if exists events_source_known,
  drop constraint if exists events_platform_known,
  drop constraint if exists events_seller_known,
  drop constraint if exists events_seller_pair,
  drop constraint if exists events_actor_known,
  drop column if exists source,
  drop column if exists platform,
  drop column if exists seller_type,
  drop column if exists seller_id,
  drop column if exists actor_role;

-- Note: the history rewrite in step 8 is not reversed (legacy names are gone). Restore from backup if needed.

notify pgrst, 'reload schema';
commit;
```

### 3. `src/lib/analytics.ts` (full replacement)

```ts
// Product analytics — the client half of tracking plan v1.0.0 (.telemetry/tracking-plan.yaml).
//
// Division of labour, on purpose:
//   * this module reports only what the client knows — sign-in attempts, views, searches, taps, the guest funnel;
//   * every state change (request, proposal, booking, deal, delivery, review…) is emitted inside Postgres by
//     public.emit_event(), in the same transaction as the write. See supabase/migrations/20261009_analytics_v1.sql.
//     Never add a client track() for one of those — it would double count.
//
// Design rules, unchanged from the first version:
//   • NEVER throws and never awaits into a user flow. An analytics failure must be invisible.
//   • Works signed-out. The events_insert_guest policy allows it.
//   • Sends nothing personal. Props are typed to IDs, enums, booleans and counts, and still go through scrubPii.
//   • Drops rather than queues forever. A failed send is lost on purpose.
// Admin and super_admin rows are dropped by a trigger on the table, so there is no role check here.

import { Capacitor } from "@capacitor/core";
import { getSupabase } from "./supabaseClient";
import { scrubValue } from "./scrubPii";
import type { Json } from "@/types/database.types";

declare const __APP_VERSION__: string;

export type SellerRef = { type: "business" | "provider"; id: string };

type RequestEntry = "feed" | "notification" | "share_link" | "map" | "profile" | "direct";
type SellerEntry = "search" | "map" | "feed" | "category" | "notification" | "share_link" | "direct";

/** Client events and their props. Names must match events_name_known (20261009). */
export interface ClientEvents {
  otp_sent: { is_native: boolean; is_resend: boolean };
  otp_verified: { is_native: boolean; is_auto_verified: boolean };
  otp_failed: { step: "send" | "verify" | "bridge" | "session"; error_code: string; provider_error_code?: string; is_native?: boolean };
  signup_completed: { interest_count: number; has_location: boolean };
  request_viewed: { request_id: string; is_guest: boolean; is_viewer_seller: boolean; entry_source?: RequestEntry };
  search_performed: { surface: "search" | "map" | "category"; has_query: boolean; category_id?: string; result_count: number; is_guest: boolean };
  notification_opened: { notification_type: string; is_push: boolean };
  share_link_opened: { link_type: "tracking"; is_valid: boolean };
  seller_viewed: { is_guest: boolean; entry_source?: SellerEntry };
  seller_contacted: { contact_method: "call" | "directions" };
  delivery_declined: { assignment_type: "single" | "run"; delivery_id?: string };
}

export type ClientEventName = keyof ClientEvents;

/** Events attributed to a seller must say which one — the compiler enforces the third argument. */
type SellerScoped = "seller_viewed" | "seller_contacted" | "delivery_declined";
type TrackArgs<N extends ClientEventName> = N extends SellerScoped
  ? [props: ClientEvents[N], seller: SellerRef]
  : [props: ClientEvents[N]];

/** Who acts, when it is not the customer. Riders decline deliveries. */
const ACTOR_ROLE: Partial<Record<ClientEventName, "staff">> = { delivery_declined: "staff" };

const MAX_PER_SESSION = 500;
let sent = 0;

/**
 * One id per app session, so a guest's journey can be followed from first screen to signup without
 * knowing who they are. sessionStorage, not localStorage: it must not become a durable identifier.
 * Rotated on sign-out (resetAnalyticsSession) so two people on one phone are never stitched together.
 */
const SESSION_KEY = "stryt_analytics_session";
function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = `s_${crypto.randomUUID().replace(/-/g, "")}`;
    sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Private mode, blocked storage, SSR — an event without a session id is still worth having.
    return "s_unknown";
  }
}

function platform(): "web" | "android" | "ios" {
  try {
    const p = Capacitor.getPlatform();
    return p === "android" || p === "ios" ? p : "web";
  } catch {
    return "web";
  }
}

/**
 * Record one client event. Fire-and-forget by design: call it, do not await it, and never branch on it.
 */
export function track<N extends ClientEventName>(name: N, ...args: TrackArgs<N>): void {
  try {
    if (sent >= MAX_PER_SESSION) return;
    sent++;
    const [props, seller] = args as [ClientEvents[N], SellerRef | undefined];
    void send(name, props, seller);
  } catch {
    /* analytics must never throw */
  }
}

/** Call on sign-out: the next person on this device starts a fresh, unlinked session. */
export function resetAnalyticsSession(): void {
  try {
    sent = 0;
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable — nothing to reset */
  }
}

async function send(name: ClientEventName, props: object, seller: SellerRef | undefined): Promise<void> {
  try {
    const sb = getSupabase();

    // scrubPii is a backstop, not a licence: the typed props above are the real guarantee.
    const safe = scrubValue(props) as Json;

    // user_id is stamped server-side from the JWT (column default) and pinned by RLS — deliberately absent.
    // source must be 'client'; RLS rejects anything else.
    await sb.from("events").insert({
      name,
      props: safe,
      session_id: sessionId(),
      app_version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : null,
      source: "client",
      platform: platform(),
      seller_type: seller?.type ?? null,
      seller_id: seller?.id ?? null,
      actor_role: ACTOR_ROLE[name] ?? "customer",
    });
  } catch {
    /* offline, blocked, pre-migration, RLS — all fine, the event is simply lost */
  }
}
```

### Wiring changes (Release 1)

| File | Change |
|------|--------|
| `src/services/core/authService.ts` `logout()` (line 284) | Call `resetAnalyticsSession()` first, before `sb.auth.signOut()`. |
| `src/services/core/authService.ts:143, 148, 171, 182, 193, 204` | Rename props: `native`→`is_native`, `resend`→`is_resend`, `auto`→`is_auto_verified`, `code`→`error_code`, `provider`→`provider_error_code`. |
| `src/screens/auth/UserOnboard.tsx:60` | `{ interest_count: interests.length, has_location: !!place }` |
| `src/screens/requests/RequestDetail.tsx:45` | `{ request_id: id, is_guest: isGuest, is_viewer_seller: <owns business/provider> }` |
| `src/screens/TrackingPage.tsx:90` | `{ link_type: "tracking", is_valid: !error && !!row }` |
| `src/services/engagement/deliveryService.ts:572, 700` | `delivery_declined` gains its seller: `{ assignment_type }, { type: "business", id: businessId }` |
| **Delete** `requestService.ts:317, 415, 463, 566, 631, 682`, `appointmentService.ts:392`, `deliveryService.ts:354, 362, 474, 731, 739, 762, 805, 817` | Now emitted by the database. |
| `src/services/engagement/deliveryOps.service.test.ts` | Update the `track` expectations for the deleted delivery calls. |
| `src/lib/deliveryOperationsMigration.test.ts:140` | It reads `analytics.ts` to check the delivery names, so update it to the new client name list. |

Release 1 deletes the delivery `track()` calls, but the `delivery_status_changed`, `review_left` and cash triggers must be in the same migration. Write them from the trigger map below before shipping.

### Trigger map (every db event)

| Event | Release | Table / hook | Fires when | Seller |
|-------|---------|--------------|-----------|--------|
| `request_created` | 1 | `requests` AFTER INSERT | always | — |
| `proposal_created` | 1 | `proposals` AFTER INSERT | always | responder |
| `proposal_accepted` | 1 | `agreements` AFTER INSERT | always | responder |
| `deal_completed` | 1 | `agreements` / `appointments` / `queue_tokens` AFTER UPDATE OF status | → COMPLETED / COMPLETED / SERVED | responder / target / business |
| `dispute_opened` | 1 | `agreements` AFTER UPDATE OF status | → DISPUTED | responder |
| `booking_created` | 1 | `appointments`, `queue_tokens` AFTER INSERT | always | target / business |
| `review_left` | 1 | `ratings` AFTER INSERT | always. `has_comment = comment <> ''`, `has_tip = tip > 0` | ratee when business/provider |
| `delivery_status_changed` | 1 | `appointment_deliveries` AFTER INSERT / UPDATE OF status, live_status, plus the order-ready RPC for `packed` | each distinct transition | `business_id` |
| `delivery_cash_collected` / `delivery_cash_settled` | 1 | inside the collect / settle RPCs, after their write succeeds | always | business |
| `agreement_cancelled` | 2 | `agreements` | → CANCELLED. `cancel_reason = 'confirmation_timeout'` when `actor_role = 'system'` | responder |
| `booking_cancelled` | 2 | `appointments` / `queue_tokens` | → REJECTED, CANCELLED, NO_SHOW / LEFT | target / business |
| `seller_created` | 2 | `businesses`, `providers` AFTER INSERT | always | itself |
| `seller_verified` | 2 | `businesses`, `providers` AFTER UPDATE OF verification_status | → VERIFIED | itself |
| `team_member_added` | 2 | `business_team_members` AFTER INSERT | always | business |
| `conversation_started` | 2 | `conversations` AFTER INSERT | always | subject seller when applicable |
| `community_post_created` | 2 | `community_posts` AFTER INSERT | always | author when business/provider |

## Architecture

### Client vs Server
- **Client** (browser, Capacitor WebView): 11 events through `track()`, inserted via PostgREST under the user's JWT or `anon`. RLS forces `source = 'client'` and pins `user_id`.
- **Database:** 17 events through `emit_event()`, called by `AFTER` row triggers (or from within RPCs where there is no clean row transition). They're written in the same transaction as the business write, so if the write rolls back, the event never existed.
- **Edge Functions:** none needed.

### Queues and Batching
None, and none needed. Client inserts are single-row and fire-and-forget. Volume is bounded by the 500/session cap and the "high" events (`request_viewed`, `search_performed`, `seller_viewed`). Database events are one extra `insert` per business write. The rider offline outbox (`riderQueue.ts`) still delays the underlying RPCs, but the event now gets the real server time of the write instead of a client-side guess.

### Shutdown / Flush
Nothing to flush: no buffer exists. A client insert in flight at page unload can be lost. That's accepted. Database events cannot be lost this way.

### Error Handling
- **Client:** try/catch in `track()` and `send()` swallows everything.
- **Database:** `emit_event` catches everything, including CHECK violations, and raises a `WARNING` (visible in Postgres logs), so the triggering write always succeeds. Triggers return `null` (AFTER triggers ignore it) and never raise.
- **Exclusion:** `events_drop_internal` returns `null` for admin rows. That's a silent skip, not an error.

## Verification

### Confirming Delivery
In the Supabase SQL editor (admin):
```sql
select created_at, name, source, platform, actor_role, seller_type, seller_id, props
from public.events order by created_at desc limit 50;

-- Double counting check after cutover: moved events must be source = 'db' only (old native builds excepted).
select name, source, count(*) from public.events
where created_at > now() - interval '1 day' group by 1, 2 order by 1, 2;
```
`emit_event` failures show in Postgres logs as `WARNING: emit_event(<name>) dropped: …` (Supabase dashboard → Logs → Postgres, or `query_logs`).

### Expected Latency
- **Client:** under 1 second (one PostgREST round trip).
- **Database:** zero lag. The row commits with the business write.
- **Snapshot traits:** up to 24 hours (daily refresh).

### Success vs Failure
- **Client:** `insert` returns 201. 401/403 means an RLS rejection, usually a wrong `source` or a forged `user_id`. 400 with `events_name_known` means an unlisted name. All are swallowed in the app, so check the browser network tab during development.
- **Database:** success is a row with `source = 'db'`. A failure leaves no row and one `WARNING` log line.

### Development Testing
- Point `.env.development.local` / `dev:staging` at the staging project (`.env.staging`). Apply the migration there first with `npm run check-migrations` and `npm run lint:migrations` (the lint enforces `search_path` pinning and `REVOKE … FROM public, anon` on every new function).
- `npm run check-policy-grants` verifies that guest browsing still works after the policy changes.
- Unit tests keep mocking the module: `vi.mock("@/lib/analytics", () => ({ track: vi.fn(), resetAnalyticsSession: vi.fn() }))`.
- If staging shares the production database, add an `env` column before testing. If it has its own project, nothing is needed.

## Rollout Strategy (phased)

1. **Development / staging:** apply `20261009_analytics_v1.sql` to staging. Exercise one of each event (request, proposal, accept, booking, queue serve, delivery run, review) and confirm exactly one row each with the right `source`, `seller_id` and `actor_role`. Run the double-counting query.
2. **Release 1 (production):** the migration plus an app release with the new `analytics.ts`, the prop renames, the deleted `track()` calls and the logout reset. Ship the web build and Capgo OTA together. Old APK/IPA builds without OTA keep sending old-shape client rows, which the legacy whitelist still accepts.
3. **Release 2:** migration `20261010_analytics_v1_r2.sql` (`create or replace` the agreement, appointment and queue trigger functions with their Release 2 branches, plus the new P1/P2 triggers) and an app release adding `search_performed`, `seller_viewed`, `seller_contacted` and `notification_opened`.
4. **Release 3 (about 2 weeks after Release 2):** drop the 7 legacy delivery names from `events_name_known`, re-run the step 8 rewrite for rows that arrived in the meantime, and delete client rows of moved events from builds older than Release 1, or leave them filtered by `source`.
5. **Monitoring, first week of each release:** run the per-name, per-source counts daily, watch for `emit_event` warnings in the Postgres logs, and compare `deal_completed` (db) against `marketplace_health()->'deals_completed'`. The request-channel counts should match exactly.

## SDK-Specific Constraints

- **Whitelist first.** An event name not in `events_name_known` is silently lost on both writers. Every new event means a migration plus a `ClientEvents` entry (client) or a trigger (db).
- **Applied migrations are immutable** (`lint-migrations` Rule 4, `APPLY_LOG.md`). Change behavior with a new migration and `create or replace`, never by editing `20261009`.
- **Every new function needs** `set search_path to 'public'` (Rule 1) and `revoke all … from public, anon, authenticated` (Rule 2). Trigger functions included.
- **Never call `emit_event` from the client.** It isn't granted to `authenticated`, deliberately.
- **No `to_jsonb(new)` in triggers.** Source rows carry names, phone numbers, coordinates and addresses. Build props column by column.
- **`auth.uid()` inside triggers** is the caller's JWT user, even under `SECURITY DEFINER`. Cron and sweeps see null, which becomes `actor_role = 'system'`.
- **`update of status` triggers** fire only when `status` is in the UPDATE's SET list. RPCs that change status through another path (for example, a full-row update) are still caught, because the column is listed.
- **Snapshot views read `events`.** `deals_completed_30d` and the response medians only count rows from after Release 1. For backfill, compute from source tables.

## Coverage Gaps

- **No reference file covers this target.** The skill's references are for vendor SDKs and a generic HTTP + queue architecture. STRYT's sink is Postgres itself, so the queue, worker, batching and API-key parts of that architecture don't apply. These patterns come from the existing STRYT code (`analytics.ts`, `20260996`, `lint-migrations.mjs`) rather than a reference.
- **`is_team_member` (user trait) is deferred.** `business_team_members` has no `user_id`. Named grants resolve by phone or alias inside the access RPCs, so a non-PII join needs a `user_id` column on that table first.
- **Seller `area`.** Businesses use `city`. Providers have no locality column, so their area is null.
- **`is_asap` on `booking_created`** is not stored on `appointments` (it's an RPC parameter), so the trigger cannot see it. Either persist it or drop the property in the next plan revision.
- **`entry_source` and `is_viewer_seller`** need the screens to know how the user arrived and whether they hold a seller hat. Both are optional or derived. Wire them where the router state already has them.
- **Delivery `packed` and cash events** happen inside RPCs whose internals weren't inspected for this guide (`20261003`–`20261005`). The trigger map names the hook, and the implementation step must read those RPCs before writing the calls.
