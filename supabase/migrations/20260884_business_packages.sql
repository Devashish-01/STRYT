-- ============================================================
-- Business Packages — package_key + bookings_enabled
-- ============================================================
-- Backs src/lib/businessPackages.ts. Adds:
--   - categories.package_key   — the DEFAULT package a category suggests
--   - businesses.package_key   — the owner's own confirmed/overridden choice
--   - providers.package_key    — same, for providers
--   - businesses.bookings_enabled / providers.bookings_enabled — whether this
--     business/provider takes bookings at all; null = inherit the resolved
--     package's own default. Deliberately NOT businesses.is_open_now, which
--     is the transient "pause bookings" toggle (BusinessSettings.tsx) and
--     already renders as "closed", not "doesn't take bookings" — conflating
--     the two would make a shop's page read as permanently paused.
--
-- NOT YET APPLIED — Supabase MCP is unauthenticated in this session, so this
-- has NOT been run against the live DB and has NOT been verified in a
-- rolled-back transaction the way every other migration this project has
-- shipped was. Review before applying: apply in a transaction, confirm
-- anon/authenticated access before and after, THEN commit for real via
-- mcp__supabase__apply_migration, and run mcp__supabase__get_advisors
-- afterward. The application code in this same change is written to be
-- inert without these columns (resolvePackage() falls back to keyword
-- derivation when packageKey is absent), so shipping the code ahead of this
-- migration is safe — nothing writes package_key/bookings_enabled yet
-- (that's Phase 2/3 of the plan).

-- ---------- package_key everywhere, pinned to the known keys ----------
-- The list here MUST be kept in sync with PACKAGE_KEYS in
-- src/lib/businessPackages.ts by hand — there is no shared source of truth
-- between SQL and TypeScript for this project.
alter table public.categories add column if not exists package_key text;
alter table public.categories
  add constraint categories_package_key_check
  check (package_key is null or package_key in (
    'clinic','diagnostics','vet','pharmacy','dining','takeaway','salon',
    'shop','homeservice','learning','fitness','professional','events','generic'
  ));

alter table public.businesses add column if not exists package_key text;
alter table public.businesses
  add constraint businesses_package_key_check
  check (package_key is null or package_key in (
    'clinic','diagnostics','vet','pharmacy','dining','takeaway','salon',
    'shop','homeservice','learning','fitness','professional','events','generic'
  ));
alter table public.businesses add column if not exists bookings_enabled boolean;

alter table public.providers add column if not exists package_key text;
alter table public.providers
  add constraint providers_package_key_check
  check (package_key is null or package_key in (
    'clinic','diagnostics','vet','pharmacy','dining','takeaway','salon',
    'shop','homeservice','learning','fitness','professional','events','generic'
  ));
alter table public.providers add column if not exists bookings_enabled boolean;

-- ---------- seed every existing category's default package ----------
-- Mirrors the table in docs' "Business Packages" plan / the KEYWORDS buckets
-- in businessPackages.ts. Parent (group) rows get the package their most
-- representative child implies, since a business can be stored against the
-- parent alone (BusinessOnboard's top-level chip) with no sub-category.
update public.categories set package_key = v.package_key
from (values
  -- Food & Beverage
  ('c-food',          'dining'),
  ('c-food-rest',     'dining'),
  ('c-food-cafe',     'dining'),
  ('c-food-tiffin',   'takeaway'),
  ('c-food-sweet',    'takeaway'),
  ('c-food-juice',    'takeaway'),
  ('c-food-ice',      'takeaway'),
  -- Health & Medical
  ('c-health',        'clinic'),
  ('c-health-gp',     'clinic'),
  ('c-health-dent',   'clinic'),
  ('c-health-chem',   'pharmacy'),
  ('c-health-lab',    'diagnostics'),
  ('c-health-vet',    'vet'),
  -- Beauty & Personal Care
  ('c-beauty',        'salon'),
  ('c-beauty-barber', 'salon'),
  ('c-beauty-salon',  'salon'),
  ('c-beauty-spa',    'salon'),
  ('c-beauty-makeup', 'salon'),
  ('c-beauty-nail',   'salon'),
  -- Retail Shops
  ('c-retail',        'shop'),
  ('c-retail-kirana', 'shop'),
  ('c-retail-cloth',  'shop'),
  ('c-retail-mobile', 'shop'),
  ('c-retail-foot',   'shop'),
  ('c-retail-books',  'shop'),
  -- Home & Repair
  ('c-home',          'homeservice'),
  ('c-home-plumb',    'homeservice'),
  ('c-home-elec',     'homeservice'),
  ('c-home-carp',     'homeservice'),
  ('c-home-ac',       'homeservice'),
  ('c-home-clean',    'homeservice'),
  ('c-home-pest',     'homeservice'),
  -- Education & Tutoring
  ('c-edu',           'learning'),
  ('c-edu-tuition',   'learning'),
  ('c-edu-music',     'learning'),
  ('c-edu-dance',     'learning'),
  ('c-edu-tutor',     'learning'),
  -- Fitness & Wellness
  ('c-fit',           'fitness'),
  ('c-fit-gym',       'fitness'),
  ('c-fit-yoga',      'fitness'),
  ('c-fit-trainer',   'fitness'),
  -- Professional Services
  ('c-pro',           'professional'),
  ('c-pro-photo',     'events'),
  ('c-pro-law',       'professional'),
  ('c-pro-ca',        'professional'),
  ('c-pro-design',    'professional'),
  -- Events & Personal
  ('c-events',        'events'),
  ('c-events-plan',   'events'),
  ('c-events-decor',  'events'),
  ('c-events-cater',  'events'),
  ('c-events-cook',   'events'),
  ('c-events-mehndi', 'events'),
  -- Pets — left unmapped (null) on purpose: a bare "Pets" pick (no
  -- sub-category) is genuinely ambiguous between a shop and a grooming
  -- service; falls back to "generic", which is safe, not incorrect.
  ('c-pets-shop',     'shop'),
  ('c-pets-groom',    'salon')
) as v(id, package_key)
where public.categories.id = v.id
  and public.categories.package_key is null;

-- ---------- backfill existing businesses/providers from their category ----------
update public.businesses b
set package_key = c.package_key
from public.categories c
where b.category_id = c.id
  and c.package_key is not null
  and b.package_key is null;

update public.providers p
set package_key = c.package_key
from public.categories c
where p.category_id = c.id
  and c.package_key is not null
  and p.package_key is null;
