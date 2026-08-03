-- Performance pass — applied to production as four separate migrations:
--   index_unindexed_foreign_keys
--   drop_duplicate_indexes
--   rls_initplan_wrap_auth_calls
--   consolidate_multiple_permissive_policies
--
-- Recorded here as one file so the repo history matches the database. Every
-- statement is idempotent; re-running is a no-op.
--
-- Measured on the live DB, before -> after:
--   unindexed foreign keys                     31 -> 0
--   duplicate index groups                      4 -> 0
--   policies re-evaluating auth.uid() per row 188 -> 0
--   duplicate permissive policy groups         35 -> 0
--   total policies                            221 -> 185
--
-- The advisor reports 409 "multiple permissive policies". That count is
-- inflated roughly 6x: it emits one lint per (table, role, ACTION) pair, so a
-- single FOR ALL policy is counted separately against SELECT, INSERT, UPDATE
-- and DELETE. The real shape was 35 groups / 71 policies / 36 removable.
--
-- Access was verified unchanged in rolled-back transactions before each apply:
--   RLS init-plan pass  — 14 tables x {anon, authenticated}, 28/28 identical
--   policy consolidation — 20 tables x {anon, authenticated}, 40/40 identical
-- Plus a functional smoke test: owner UPDATE on own business (the path
-- 20260870 existed to unbreak), authenticated appointment reads, and anon
-- discovery reads all still work.
--
-- See docs/engineering/SCALING_RUNBOOK.md for the reasoning, and for the steps
-- deliberately NOT taken.

-- ── 1. Index every foreign key ──────────────────────────────────────────────
-- An unindexed FK means each join across it, and each ON DELETE CASCADE, is a
-- sequential scan. Invisible at 4 rows, crippling at 400k.
create index if not exists agreements_tracking_token_idx       on public.agreements (tracking_token);
create index if not exists appointment_deliveries_business_idx on public.appointment_deliveries (business_id);
create index if not exists appointments_rescheduled_from_idx   on public.appointments (rescheduled_from);
create index if not exists blocked_slots_target_owner_idx      on public.blocked_slots (target_owner_user_id);
create index if not exists business_login_attempts_by_idx      on public.business_login_attempts (attempted_by);
create index if not exists business_qna_asker_idx              on public.business_qna (asker_user_id);
create index if not exists categories_parent_idx               on public.categories (parent_id);
create index if not exists delivery_batches_business_idx       on public.delivery_batches (business_id);
create index if not exists emergency_contacts_contact_user_idx on public.emergency_contacts (contact_user_id);
create index if not exists gate_passes_issued_by_idx           on public.gate_passes (issued_by_user_id);
create index if not exists leads_from_user_idx                 on public.leads (from_user_id);
create index if not exists messages_sender_idx                 on public.messages (sender_id);
create index if not exists payments_payer_idx                  on public.payments (payer_user_id);
create index if not exists poll_votes_user_idx                 on public.poll_votes (user_id);
create index if not exists post_comments_author_idx            on public.post_comments (author_user_id);
create index if not exists post_likes_user_idx                 on public.post_likes (user_id);
create index if not exists pro_payments_user_idx               on public.pro_payments (user_id);
create index if not exists profile_deletion_requests_user_idx  on public.profile_deletion_requests (user_id);
create index if not exists qna_upvotes_user_idx                on public.qna_upvotes (user_id);
create index if not exists queue_tokens_customer_idx           on public.queue_tokens (customer_user_id);
create index if not exists reports_reporter_idx                on public.reports (reporter_user_id);
create index if not exists request_me_toos_user_idx            on public.request_me_toos (user_id);
create index if not exists requests_category_idx               on public.requests (category_id);
create index if not exists settlements_with_user_idx           on public.settlements (with_user_id);
create index if not exists settlements_agreement_idx           on public.settlements (agreement_id);
create index if not exists societies_admin_user_idx            on public.societies (admin_user_id);
create index if not exists story_views_viewer_idx              on public.story_views (viewer_user_id);
create index if not exists tracking_tokens_appointment_idx     on public.tracking_tokens (appointment_id);
create index if not exists user_saved_coupons_offer_idx        on public.user_saved_coupons (offer_id);
create index if not exists user_stamps_card_idx                on public.user_stamps (card_id);
create index if not exists users_society_idx                   on public.users (society_id);

-- ── 2. Drop exact duplicate indexes ─────────────────────────────────────────
drop index if exists public.msgs_conv_idx;   -- = messages_conversation_idx
drop index if exists public.cp_author_idx;   -- = community_posts_author_user_idx
drop index if exists public.notif_user_idx;  -- = notifications_user_idx

-- poll_votes_pkey is UNIQUE PRIMARY on (post_id, user_id). The separate unique
-- on the same columns added nothing; the PK still enforces one vote per user.
do $$
begin
  if exists (select 1 from pg_constraint
             where conrelid='public.poll_votes'::regclass and conname='poll_votes_post_user_unique') then
    alter table public.poll_votes drop constraint poll_votes_post_user_unique;
  else
    execute 'drop index if exists public.poll_votes_post_user_unique';
  end if;
end $$;

-- ── 3. RLS init-plan ────────────────────────────────────────────────────────
-- auth.uid() was re-evaluated once PER ROW SCANNED. Wrapped in a scalar
-- subquery, Postgres hoists it into an InitPlan evaluated once per query. It is
-- STABLE, so this changes only WHEN it is evaluated, never the value.
--
-- The lookbehind is what makes this safe to re-run: an already-wrapped call
-- renders as "SELECT auth.uid()" and is skipped, so it cannot nest into
-- (select (select auth.uid())).
do $$
declare r record; ddl text;
begin
  for r in
    select schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check
    from pg_policies
    where schemaname='public'
      and (coalesce(qual,'') ~ '(?<!SELECT )auth\.(uid|role|jwt)\(\)'
        or coalesce(with_check,'') ~ '(?<!SELECT )auth\.(uid|role|jwt)\(\)')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    ddl := format('create policy %I on %I.%I as %s for %s to %s',
      r.policyname, r.schemaname, r.tablename,
      case when r.permissive='PERMISSIVE' then 'permissive' else 'restrictive' end,
      r.cmd, array_to_string(r.roles, ', '));
    if r.qual is not null then
      ddl := ddl || ' using ('
        || regexp_replace(r.qual, '(?<!SELECT )auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g') || ')';
    end if;
    if r.with_check is not null then
      ddl := ddl || ' with check ('
        || regexp_replace(r.with_check, '(?<!SELECT )auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g') || ')';
    end if;
    execute ddl;
  end loop;
end $$;

-- ── 4. Consolidate duplicate permissive policies ────────────────────────────
-- Postgres ORs every permissive policy for a (role, command), so one policy
-- with (A) OR (B) is identical to two policies A and B — that OR is exactly
-- what it already computes. Most of these were legacy naming drift:
-- read_notif + read_own_notifications, upd_users + update_users, and so on.
--
-- Grouped by IDENTICAL cmd on purpose. A FOR ALL policy may only merge with
-- another FOR ALL; merging one with a FOR SELECT would hand a read-only
-- predicate to INSERT/UPDATE/DELETE, which is a privilege escalation. That is
-- why this is not a blanket pass over everything the advisor flags.
--
-- The surviving policy keeps the first name alphabetically. A future migration
-- that re-creates a dropped sibling by name will re-introduce the duplicate.
do $$
declare g record; t text; using_expr text; check_expr text;
begin
  for g in
    select tablename, cmd, roles,
           (array_agg(policyname order by policyname))[1] as keep_name,
           array_agg(policyname order by policyname) as names,
           array_agg(qual) filter (where qual is not null) as quals,
           array_agg(with_check) filter (where with_check is not null) as checks
    from pg_policies
    where schemaname='public' and permissive='PERMISSIVE'
    group by tablename, cmd, roles
    having count(*) > 1
  loop
    using_expr := case when g.quals is null then null
                  else '(' || array_to_string(array(select '(' || x || ')' from unnest(g.quals) x), ' OR ') || ')' end;
    check_expr := case when g.checks is null then null
                  else '(' || array_to_string(array(select '(' || x || ')' from unnest(g.checks) x), ' OR ') || ')' end;
    foreach t in array g.names loop
      execute format('drop policy %I on public.%I', t, g.tablename);
    end loop;
    execute format('create policy %I on public.%I as permissive for %s to %s%s%s',
      g.keep_name, g.tablename, g.cmd, array_to_string(g.roles, ', '),
      coalesce(' using ' || using_expr, ''), coalesce(' with check ' || check_expr, ''));
  end loop;
end $$;
