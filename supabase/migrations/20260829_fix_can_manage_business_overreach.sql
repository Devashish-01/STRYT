-- ============================================================
-- 20260829 — Close the can_manage_business() over-grant
--
-- can_manage_business(business_id) returns true for the owner OR ANY
-- ACTIVE business_access_sessions row, regardless of granted scope. It
-- predates the scoping model (20260841_business_team_scopes.sql /
-- has_business_scope()) and was never narrowed when scopes were
-- introduced. It's still OR'd into RLS on appointments, queue_tokens,
-- business_qna, catalog_items, business_portfolio_items, business_packages,
-- blocked_slots, offers, and businesses — none of it present in any prior
-- migration file (untracked drift, applied directly against the DB).
--
-- Confirmed live and currently exploitable: an ACTIVE grant scoped to
-- 'queue' only (session c55ef0ae-1e5d-44ab-8244-5b67583fe335, business
-- b_d0b35361947a4ebb99abfb69b3fedc6e) can right now read every appointment
-- (customer name/phone/address/payment info) and edit Q&A/catalog/
-- portfolio on that business — none of which 'queue' scope should permit.
--
-- Fix: replace each can_manage_business() branch with the correctly-scoped
-- has_business_scope(business_id, uid, '<scope>') (which already grants
-- the owner full access too), drop the branch entirely where a scope
-- check was already present alongside it (can_manage_business was purely
-- redundant there), or fall back to owner-only where none of the five
-- existing scopes (appointments/queue/catalog/leads/delivery) is a clean
-- fit for a foundational, owner-level setting.
--
-- Not touched: queue_tokens_select_all's qual is `true OR (...)` — already
-- unconditionally public regardless of can_manage_business, a separate,
-- apparently deliberate "public queue display" design predating this fix.
-- Changing its dead can_manage_business branch would have zero effect.
-- ============================================================

-- appointments — SELECT: was the primary leak (customer name/phone/
-- address/payment info readable by any scope, not just 'appointments').
drop policy if exists appt_select on public.appointments;
create policy appt_select on public.appointments for select
  using (
    (select auth.uid())::text = customer_user_id
    or (select auth.uid())::text = target_owner_user_id
    or (target_type = 'BUSINESS' and has_business_scope(target_id, (select auth.uid())::text, 'appointments'))
  );

-- appointments — UPDATE: the correct has_business_scope branch already
-- existed alongside the over-broad one; just drop the redundant branch.
drop policy if exists appt_update on public.appointments;
create policy appt_update on public.appointments for update
  using (
    (select auth.uid())::text = customer_user_id
    or (select auth.uid())::text = target_owner_user_id
    or (target_type = 'BUSINESS' and has_business_scope(target_id, (select auth.uid())::text, 'appointments'))
  )
  with check (
    (select auth.uid())::text = customer_user_id
    or (select auth.uid())::text = target_owner_user_id
    or (target_type = 'BUSINESS' and has_business_scope(target_id, (select auth.uid())::text, 'appointments'))
  );

-- blocked_slots — blocking time slots is calendar/availability management,
-- the same domain as 'appointments' scope.
drop policy if exists blocked_slots_write on public.blocked_slots;
create policy blocked_slots_write on public.blocked_slots for all
  using (
    (select auth.uid())::text = target_owner_user_id
    or (target_type = 'BUSINESS' and has_business_scope(target_id, (select auth.uid())::text, 'appointments'))
  )
  with check (
    (select auth.uid())::text = target_owner_user_id
    or (target_type = 'BUSINESS' and has_business_scope(target_id, (select auth.uid())::text, 'appointments'))
  );

-- business_packages — which package/theme a business runs under is a
-- foundational setting with no matching delegated scope; owner-only.
drop policy if exists "owner can manage their packages" on public.business_packages;
create policy "owner can manage their packages" on public.business_packages for all
  using (exists (select 1 from public.businesses where businesses.id = business_packages.business_id and businesses.owner_user_id = (select auth.uid())::text))
  with check (exists (select 1 from public.businesses where businesses.id = business_packages.business_id and businesses.owner_user_id = (select auth.uid())::text));

-- business_portfolio_items — has_business_scope(...,'catalog') + owner
-- already covered this; drop the redundant broader branch.
drop policy if exists delegated_access_biz_portfolio on public.business_portfolio_items;
create policy delegated_access_biz_portfolio on public.business_portfolio_items for all
  using (
    has_business_scope(business_id, (select auth.uid())::text, 'catalog')
    or exists (select 1 from public.businesses b where b.id = business_portfolio_items.business_id and b.owner_user_id = (select auth.uid())::text)
  )
  with check (
    has_business_scope(business_id, (select auth.uid())::text, 'catalog')
    or exists (select 1 from public.businesses b where b.id = business_portfolio_items.business_id and b.owner_user_id = (select auth.uid())::text)
  );

-- business_qna — answering customer questions is closest in spirit to
-- 'leads' scope (customer-inquiry handling); lower risk than the other
-- fixes here since Q&A content is already public-facing.
drop policy if exists upd_qna on public.business_qna;
create policy upd_qna on public.business_qna for update
  using (
    exists (select 1 from public.businesses b where b.id = business_qna.business_id and b.owner_user_id = (select auth.uid())::text)
    or has_business_scope(business_id, (select auth.uid())::text, 'leads')
  )
  with check (
    exists (select 1 from public.businesses b where b.id = business_qna.business_id and b.owner_user_id = (select auth.uid())::text)
    or has_business_scope(business_id, (select auth.uid())::text, 'leads')
  );

-- businesses — has_business_full_access(id,uid) (FULL-access-level
-- delegates only) + explicit owner + admin already covered this; drop the
-- redundant any-scope branch on the single most consequential table.
drop policy if exists admin_upd_businesses on public.businesses;
create policy admin_upd_businesses on public.businesses for update
  using (
    exists (select 1 from public.users where users.id = (select auth.uid())::text and 'admin' = any(users.roles))
    or has_business_full_access(id, (select auth.uid())::text)
    or owner_user_id = (select auth.uid())::text
  )
  with check (
    exists (select 1 from public.users where users.id = (select auth.uid())::text and 'admin' = any(users.roles))
    or has_business_full_access(id, (select auth.uid())::text)
    or owner_user_id = (select auth.uid())::text
  );

-- catalog_items — has_business_scope(...,'catalog') + owner/provider-owner
-- already covered this; drop the redundant broader branch.
drop policy if exists delegated_access_catalog on public.catalog_items;
create policy delegated_access_catalog on public.catalog_items for all
  using (
    has_business_scope(business_id, (select auth.uid())::text, 'catalog')
    or (business_id is not null and exists (select 1 from public.businesses b where b.id = catalog_items.business_id and b.owner_user_id = (select auth.uid())::text))
    or (provider_id is not null and exists (select 1 from public.providers p where p.id = catalog_items.provider_id and p.user_id = (select auth.uid())::text))
  )
  with check (
    has_business_scope(business_id, (select auth.uid())::text, 'catalog')
    or (business_id is not null and exists (select 1 from public.businesses b where b.id = catalog_items.business_id and b.owner_user_id = (select auth.uid())::text))
    or (provider_id is not null and exists (select 1 from public.providers p where p.id = catalog_items.provider_id and p.user_id = (select auth.uid())::text))
  );

-- offers — pricing/promotions on the catalog; 'catalog' scope fits.
drop policy if exists write_offers on public.offers;
create policy write_offers on public.offers for all
  using (
    exists (select 1 from public.businesses b where b.id = offers.business_id and b.owner_user_id = (select auth.uid())::text)
    or has_business_scope(business_id, (select auth.uid())::text, 'catalog')
  )
  with check (
    exists (select 1 from public.businesses b where b.id = offers.business_id and b.owner_user_id = (select auth.uid())::text)
    or has_business_scope(business_id, (select auth.uid())::text, 'catalog')
  );

-- queue_settings — has_business_scope(...,'queue') + owner already covered
-- this; drop the redundant broader branch.
drop policy if exists delegated_access_queue_settings on public.queue_settings;
create policy delegated_access_queue_settings on public.queue_settings for all
  using (
    has_business_scope(business_id, (select auth.uid())::text, 'queue')
    or business_id in (select businesses.id from public.businesses where businesses.owner_user_id = (select auth.uid())::text)
  )
  with check (
    has_business_scope(business_id, (select auth.uid())::text, 'queue')
    or business_id in (select businesses.id from public.businesses where businesses.owner_user_id = (select auth.uid())::text)
  );

-- queue_tokens — UPDATE: both can_manage_business occurrences replaced
-- with the correctly-scoped 'queue' check.
drop policy if exists queue_tokens_owner_update on public.queue_tokens;
create policy queue_tokens_owner_update on public.queue_tokens for update
  using (
    business_id in (select businesses.id from public.businesses where businesses.owner_user_id = (select auth.uid())::text)
    or has_business_scope(business_id, (select auth.uid())::text, 'queue')
    or (
      (select auth.role()) = 'authenticated'
      and (
        customer_user_id = (select auth.uid())::text
        or exists (select 1 from public.businesses b where b.id = queue_tokens.business_id and b.owner_user_id = (select auth.uid())::text)
        or has_business_scope(business_id, (select auth.uid())::text, 'queue')
      )
    )
  );

-- bulk_deals — write access was tied to the CREATING individual
-- (owner_user_id = auth.uid()), not the business, unlike every sibling
-- delegated table (catalog_items, business_portfolio_items). A
-- catalog-scoped teammate who creates a deal became its sole editor,
-- locking the actual business owner out of editing/deleting it.
drop policy if exists write_bulk_deals on public.bulk_deals;
create policy write_bulk_deals on public.bulk_deals for all
  using (
    owner_user_id = (select auth.uid())::text
    or has_business_scope(business_id, (select auth.uid())::text, 'catalog')
    or is_admin()
  )
  with check (
    owner_user_id = (select auth.uid())::text
    or has_business_scope(business_id, (select auth.uid())::text, 'catalog')
    or is_admin()
  );
