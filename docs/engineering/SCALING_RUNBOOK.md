# Scaling Runbook

**Created:** 2026-08-03
**Project:** `gnswxlfmcwyhmzlfipql` · Postgres 17.6 · region `ap-northeast-1`
**Measured, not guessed:** every number below came from the live database.

Ordered by **impact ÷ risk**. Steps 1–3 are safe and worth doing this week.
Step 4 needs judgement. Step 5 is a migration and your call. Steps 6+ are
triggered by load you don't have yet — don't pre-build them.

| # | Step | Impact | Risk | When |
|---|------|--------|------|------|
| 0 | Baseline measurement | — | none | first |
| 1 | Index 31 foreign keys | high | low | now |
| 2 | Drop 4 duplicate indexes | low | low | now |
| 3 | RLS init-plan: 188 policies | **highest** | low-med | now |
| 4 | Consolidate 409 permissive policies | high | medium | after 3 |
| 5 | Move region to Mumbai | **highest real-world** | high | your call |
| 6 | Push notifications → queue | high | medium | ~10k users |
| 7 | Live location off Postgres | high | medium | ~10k users |
| 8 | Caching + read replicas | high | medium | ~50k users |

---

## Step 0 — Measure before you change anything

Without a baseline you can't tell whether any of this worked.

```sql
-- Enable once. Supabase ships the extension; this just starts collection.
create extension if not exists pg_stat_statements;

-- Baseline: save this output somewhere before Step 1.
select substr(query, 1, 90) as query,
       calls,
       round(mean_exec_time::numeric, 2) as avg_ms,
       round(total_exec_time::numeric, 2) as total_ms
from pg_stat_statements
order by total_exec_time desc
limit 25;
```

Re-run after each step. `pg_stat_statements_reset()` between runs if you want
clean numbers.

**Also grab, from the Supabase dashboard:** current p95 API latency and CPU. You
want a before/after on real traffic, not just SQL timings.

---

## Step 1 — Index the 31 unindexed foreign keys

**Why it matters:** an unindexed FK means every join across it, and every
`ON DELETE CASCADE`, does a sequential scan. It's invisible at 4 rows and
crippling at 400k. Deleting one business would scan every child table.

The exact 31, from the live schema:

```sql
create index if not exists agreements_tracking_token_idx           on public.agreements (tracking_token);
create index if not exists appointment_deliveries_business_idx     on public.appointment_deliveries (business_id);
create index if not exists appointments_rescheduled_from_idx       on public.appointments (rescheduled_from);
create index if not exists blocked_slots_target_owner_idx          on public.blocked_slots (target_owner_user_id);
create index if not exists business_login_attempts_by_idx          on public.business_login_attempts (attempted_by);
create index if not exists business_qna_asker_idx                  on public.business_qna (asker_user_id);
create index if not exists categories_parent_idx                   on public.categories (parent_id);
create index if not exists delivery_batches_business_idx           on public.delivery_batches (business_id);
create index if not exists emergency_contacts_contact_user_idx     on public.emergency_contacts (contact_user_id);
create index if not exists gate_passes_issued_by_idx               on public.gate_passes (issued_by_user_id);
create index if not exists leads_from_user_idx                     on public.leads (from_user_id);
create index if not exists messages_sender_idx                     on public.messages (sender_id);
create index if not exists payments_payer_idx                      on public.payments (payer_user_id);
create index if not exists poll_votes_user_idx                     on public.poll_votes (user_id);
create index if not exists post_comments_author_idx                on public.post_comments (author_user_id);
create index if not exists post_likes_user_idx                     on public.post_likes (user_id);
create index if not exists pro_payments_user_idx                   on public.pro_payments (user_id);
create index if not exists profile_deletion_requests_user_idx      on public.profile_deletion_requests (user_id);
create index if not exists qna_upvotes_user_idx                    on public.qna_upvotes (user_id);
create index if not exists queue_tokens_customer_idx               on public.queue_tokens (customer_user_id);
create index if not exists reports_reporter_idx                    on public.reports (reporter_user_id);
create index if not exists request_me_toos_user_idx                on public.request_me_toos (user_id);
create index if not exists requests_category_idx                   on public.requests (category_id);
create index if not exists settlements_with_user_idx               on public.settlements (with_user_id);
create index if not exists settlements_agreement_idx               on public.settlements (agreement_id);
create index if not exists societies_admin_user_idx                on public.societies (admin_user_id);
create index if not exists story_views_viewer_idx                  on public.story_views (viewer_user_id);
create index if not exists tracking_tokens_appointment_idx         on public.tracking_tokens (appointment_id);
create index if not exists user_saved_coupons_offer_idx            on public.user_saved_coupons (offer_id);
create index if not exists user_stamps_card_idx                    on public.user_stamps (card_id);
create index if not exists users_society_idx                       on public.users (society_id);
```

**Do it now, while the tables are small** — these build instantly today and take
locks later. If you ever run this against large tables, use
`CREATE INDEX CONCURRENTLY`, which **cannot run inside a transaction** (so not
via `apply_migration` — run it as a standalone statement).

**Verify:**

```sql
-- Should return zero rows afterwards.
select c.conrelid::regclass::text, string_agg(a.attname, ',')
from pg_constraint c
join lateral unnest(c.conkey) with ordinality k(attnum, ord) on true
join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
join pg_namespace n on n.oid=c.connamespace
where c.contype='f' and n.nspname='public'
group by c.oid, c.conrelid
having not exists (
  select 1 from pg_index i where i.indrelid=c.conrelid
    and (i.indkey::int2[])[0:array_length(c.conkey,1)-1] = c.conkey
);
```

**Rollback:** `drop index <name>;` — indexes are free to remove.

---

## Step 2 — Drop the 4 duplicate indexes

Every duplicate is paid for on **every insert, update and delete**, forever, for
nothing.

```sql
drop index if exists public.msgs_conv_idx;                  -- = messages_conversation_idx
drop index if exists public.cp_author_idx;                  -- = community_posts_author_user_idx
drop index if exists public.notif_user_idx;                 -- = notifications_user_idx
```

**The fourth needs a decision, not a drop.** On `poll_votes`,
`poll_votes_post_user_unique` and `poll_votes_pkey` cover the same columns.
Dropping the wrong one loses either the primary key or the uniqueness guarantee
that stops double-voting. Inspect both first:

```sql
select indexrelid::regclass::text, indisunique, indisprimary, pg_get_indexdef(indexrelid)
from pg_index where indrelid='public.poll_votes'::regclass;
```

Keep the primary key; drop the redundant unique **only** if it's identical in
columns and order.

---

## Step 3 — RLS init-plan (the big one)

**188 policies across 75 tables.** This is the single highest-leverage change
available to you.

### What's wrong

A policy like:

```sql
using (user_id = auth.uid()::text)
```

re-evaluates `auth.uid()` **once per row scanned**. On 500k rows that's 500k
function calls per query. Wrapped in a scalar subquery:

```sql
using (user_id = (select auth.uid())::text)
```

Postgres hoists it into an **InitPlan** — evaluated once, then compared against
every row. `auth.uid()` is `STABLE`, so this is **semantically identical**; it
only changes when the planner evaluates it.

### How to do it safely

Don't hand-edit 188 policies. Generate the DDL from the catalog, review it, then
apply:

```sql
-- Produces the CREATE POLICY statements with the fix applied.
-- REVIEW THE OUTPUT before running any of it.
select format(
  'drop policy if exists %I on %I.%I; create policy %I on %I.%I as %s for %s to %s%s%s;',
  policyname, schemaname, tablename,
  policyname, schemaname, tablename,
  case when permissive='PERMISSIVE' then 'permissive' else 'restrictive' end,
  cmd,
  array_to_string(roles, ', '),
  case when qual is null then ''
       else ' using (' || regexp_replace(qual, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g') || ')' end,
  case when with_check is null then ''
       else ' with check (' || regexp_replace(with_check, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g') || ')' end
) as ddl
from pg_policies
where schemaname='public'
  and (coalesce(qual,'') ~ 'auth\.(uid|role|jwt)\(\)'
    or coalesce(with_check,'') ~ 'auth\.(uid|role|jwt)\(\)')
order by tablename, policyname;
```

### Rules for this step

1. **Do it in batches by table**, not all 188 at once. A bad rewrite on one
   table is recoverable; on 75 it isn't.
2. **Never widen a policy.** The regex only wraps a function call. If any
   generated statement looks different in any other way, stop.
3. **Test in a rolled-back transaction first** — the same method used for
   `delete_business` and `cancel_delivery`. For each table, confirm as `anon`
   and as an authenticated user that the same rows are visible before and after.
4. **The regex is not idempotent-safe** — running it twice would produce
   `(select (select auth.uid()))`. Harmless but ugly; regenerate from a clean
   read each time.

### Highest-value tables first

`society_members` (7 policies), `businesses` (6), `conversations` (6),
`notifications` (6), `queue_tokens` (6), `providers` (5), `post_likes` (5).

`businesses`, `notifications` and `conversations` are your hot read paths — do
those three and you've captured most of the win.

**Verify:** re-run the counting query from Step 0's advisor, and confirm
`auth_rls_initplan` drops from 187 toward 0.

---

## Step 4 — Consolidate the 409 permissive policies

For each role + action, Postgres evaluates **every** permissive policy and ORs
the results. Ten policies on a table means ten predicates per row.

This one needs judgement, not a script: merging policies changes who can see
what if you get a boolean wrong. Two rules:

- Merge only policies with the **same role and same command**.
- Combine with `OR`, and prove equivalence per table in a rolled-back
  transaction before applying.

Do this **after** Step 3, and only for the hot tables. It is not worth touching
a table nobody queries.

---

## Step 5 — Move the database to Mumbai

**The biggest real-world win available, and it isn't a code change.**

Your DB is in `ap-northeast-1` (Tokyo). Your users are in India — Pune defaults,
`countrycodes=in`, UPI, Kirana and Chemist categories. Tokyo↔India is roughly
**120–180 ms round trip, on every single query.** Mumbai (`ap-south-1`) is
~10–30 ms.

**Supabase cannot change a project's region in place.** This is a create-and-
migrate, with downtime. Plan it; don't improvise it.

1. Create a new project in `ap-south-1`.
2. `pg_dump` the old, `pg_restore` into the new — schema, data, **and** roles.
3. **Auth users are the hard part.** `auth.users` must come across with password
   hashes and identities intact or everyone is locked out. Confirm Supabase's
   current supported path for this before you start — this is the step that
   decides whether the migration is safe.
4. Recreate: Vault secrets (`functions_url`, `service_role_key`), all 9 edge
   functions, Storage buckets and objects, cron jobs, and the `pg_net` config.
5. Update `VITE_SUPABASE_URL` / anon key in Vercel **and** in the Android build.
6. Update OAuth redirect URLs (Google sign-in **will** break otherwise).
7. Repoint `capacitor.config.ts`'s `updateUrl` at the new project's edge function.
8. Keep the old project running, read-only, until you've verified the new one.

**Do this before launch, not after.** Migrating 11 users is a Saturday.
Migrating 50,000 is an incident.

---

## Steps 6–8 — Triggered by load, not by the calendar

Don't build these now. Build them when a number tells you to.

### 6. Push notifications → a real queue *(~10k users)*

Today: an `AFTER INSERT` trigger on `notifications` fires `net.http_post`
**per row**. One HTTP request per notification, originating inside Postgres,
with the queue table living in your primary database.

Fine at 10/minute. A fire at 1000/second.

**Trigger to watch:** `pg_net` queue depth, or notification insert latency
climbing.
**Fix:** write to a queue table (or `pgmq`), have a worker batch-read and call
`send-push` with many recipients per invocation.

### 7. Live location off the primary database *(~10k users)*

`update_delivery_position` / `update_delivery_batch_position` write GPS to
Postgres on **every background fix**. A few dozen active riders posting every
few seconds is a sustained high-frequency write stream into your OLTP primary —
WAL growth, page churn, vacuum pressure.

**Trigger to watch:** WAL volume, or autovacuum falling behind on
`appointment_deliveries` / `delivery_batches`.
**Fix:** current position in Redis; snapshot to Postgres on status change and
every N seconds.

### 8. Caching + read replicas *(~50k users)*

Discovery is your hottest read path. Add a read replica and route discovery
reads to it; cache by (rounded coords, radius, filter) with a short TTL.

You already banked part of this: the map redesign made search **one query per
tap** instead of one per pan.

---

## What NOT to do

**Don't rewrite the API layer in FastAPI to fix performance.** The evidence says
the bottleneck is inside Postgres — 656 findings, none about the API tier.
PostgREST is a compiled binary turning HTTP into SQL; Python in front of the
same database adds a hop. And bypassing RLS to go fast means reimplementing
every authorisation rule by hand, which is exactly the bug class that produced
the team-access escalation.

Instagram reached 100M+ users on Postgres **and Python**. They didn't switch
frameworks — they sharded, cached, and moved fan-out off the primary.

**Decide what to measure now. Decide the architecture when the data tells you.**
