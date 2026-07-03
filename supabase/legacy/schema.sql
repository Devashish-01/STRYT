-- ============================================================
-- NAYA — Core schema (the single source of truth / contract)
-- Paste this into Supabase SQL Editor FIRST, before any seed data.
--
-- ID strategy: TEXT ids (Option A). The mock data uses friendly ids
-- like 'b1','u1','r1','c-food-rest'. We keep them as text so seed data
-- and parent-child links work directly and the read path goes live fast.
-- (Migrate to uuid later if needed.)
--
-- Column names are snake_case. The frontend types are camelCase; the app
-- converts at the service boundary (src/lib/caseMap.ts). Never rename a
-- column without updating this contract — all seed SQL targets THESE names.
-- ============================================================

-- Extensions ---------------------------------------------------
create extension if not exists "postgis";      -- geo distance (ST_Distance / ST_DWithin)

-- Enums (mirror the TS union types) ---------------------------
do $$ begin
  create type entity_status    as enum ('DRAFT','PENDING','ACTIVE','REJECTED','SUSPENDED');
  create type category_kind    as enum ('BUSINESS','SERVICE','BOTH');
  create type request_status   as enum ('OPEN','IN_PROGRESS','AGREED','COMPLETED','CANCELLED','EXPIRED');
  create type proposal_status  as enum ('SUBMITTED','ACCEPTED','REJECTED','WITHDRAWN');
  create type agreement_status as enum ('PENDING','ACTIVE','COMPLETED','CANCELLED','DISPUTED');
  create type stock_status     as enum ('IN_STOCK','OUT_OF_STOCK','LIMITED');
exception when duplicate_object then null; end $$;

-- ============================================================
-- users (app profile). For real phone-auth later, you can link
-- auth.users by storing supabase auth uid in a separate column.
-- ============================================================
create table if not exists public.users (
  id                     text primary key,        -- 'u1','u10' ...
  name                   text not null,
  phone                  text,
  avatar                 text,
  roles                  text[] not null default '{customer}',  -- customer|business_owner|provider
  area                   text,
  city                   text,
  rating_avg             numeric(2,1) default 0,
  rating_count           int default 0,
  language               text default 'en',
  notification_radius_km int default 5,
  created_at             timestamptz default now()
);

-- ============================================================
-- categories (self-referential taxonomy; seeded from data/categories.ts)
-- ============================================================
create table if not exists public.categories (
  id         text primary key,           -- 'c-food','c-food-rest'
  parent_id  text references public.categories(id),
  name       text not null,
  slug       text not null,
  kind       category_kind not null,
  icon       text,                        -- emoji
  color      text
);

-- ============================================================
-- businesses
-- ============================================================
create table if not exists public.businesses (
  id             text primary key,        -- 'b1' ...
  owner_user_id  text references public.users(id),
  name           text not null,
  slug           text unique,
  category_id    text references public.categories(id),
  category_name  text,
  sub_category   text,
  description    text,
  address_line1  text,
  city           text,
  pincode        text,
  lat            double precision,
  lng            double precision,
  geom           geography(Point, 4326),  -- auto-filled from lng/lat by trigger
  phone          text,
  whatsapp       text,
  hours          text,
  is_open_now    boolean default false,
  opening_date   date,
  is_new         boolean default false,
  status         entity_status default 'ACTIVE',
  cover_image    text,
  gallery        text[] default '{}',
  rating_avg     numeric(2,1) default 0,
  rating_count   int default 0,
  view_count     int default 0,
  is_featured    boolean default false,
  is_verified    boolean default false,
  tags           text[] default '{}',
  price_for_two  int,
  delivery_time  text,
  offer_text     text,
  broadcast_radius int default 5,
  created_at     timestamptz default now()
);
create index if not exists businesses_geom_idx on public.businesses using gist (geom);
create index if not exists businesses_category_idx on public.businesses (category_id);

-- catalog_items (child of businesses; was Business.catalog[])
create table if not exists public.catalog_items (
  id           text primary key,          -- 'ci1' ...
  business_id  text references public.businesses(id) on delete cascade,
  name         text not null,
  description  text,
  price        int not null,
  sale_price   int,
  image        text,
  stock_status stock_status default 'IN_STOCK',
  is_veg       boolean,
  best_seller  boolean default false,
  sort_order   int default 0
);
create index if not exists catalog_items_business_idx on public.catalog_items (business_id);

-- offers (child of businesses; was Business.offers[])
create table if not exists public.offers (
  id           text primary key,          -- 'o1' ...
  business_id  text references public.businesses(id) on delete cascade,
  title        text not null,
  description  text,
  code         text,
  valid_until  date
);
create index if not exists offers_business_idx on public.offers (business_id);

-- ============================================================
-- providers
-- ============================================================
create table if not exists public.providers (
  id                text primary key,      -- 'p1' ...
  user_id           text references public.users(id),
  display_name      text not null,
  category_id       text references public.categories(id),
  category_name     text,
  sub_category      text,
  bio               text,
  avatar            text,
  lat               double precision,
  lng               double precision,
  geom              geography(Point, 4326),
  service_radius_km int default 5,
  starting_price    int,
  availability_note text,
  status            entity_status default 'ACTIVE',
  is_verified       boolean default false,
  rating_avg        numeric(2,1) default 0,
  rating_count      int default 0,
  jobs_done         int default 0,
  response_time     text,
  is_new            boolean default false,
  skills            text[] default '{}',
  phone             text,
  created_at        timestamptz default now()
);
create index if not exists providers_geom_idx on public.providers using gist (geom);
create index if not exists providers_category_idx on public.providers (category_id);

-- portfolio_items (child of providers; was Provider.portfolio[])
create table if not exists public.portfolio_items (
  id           text primary key,          -- 'pp1' ...
  provider_id  text references public.providers(id) on delete cascade,
  url          text not null,
  caption      text,
  sort_order   int default 0
);
create index if not exists portfolio_items_provider_idx on public.portfolio_items (provider_id);

-- ============================================================
-- requests (the "ask" posts)
-- ============================================================
create table if not exists public.requests (
  id                text primary key,      -- 'r1' ...
  requester_user_id text references public.users(id),
  title             text not null,
  description       text,
  category_id       text references public.categories(id),
  category_name     text,
  budget_min        int,
  budget_max        int,
  area              text,
  lat               double precision,
  lng               double precision,
  geom              geography(Point, 4326),
  radius_km         int default 5,
  deadline          text,
  status            request_status default 'OPEN',
  is_boosted        boolean default false,
  view_count        int default 0,
  photos            text[] default '{}',
  me_too_count      int default 0,
  is_group_buy      boolean default false,
  group_buy_target  int,
  is_urgent         boolean default false,
  is_recurring      boolean default false,
  is_anonymous      boolean default false,
  expires_in_hrs    int,
  created_at        timestamptz default now()
);
create index if not exists requests_geom_idx on public.requests using gist (geom);
create index if not exists requests_status_idx on public.requests (status);

-- proposals (child of requests)
create table if not exists public.proposals (
  id                 text primary key,     -- 'pr1' ...
  request_id         text references public.requests(id) on delete cascade,
  responder_user_id  text references public.users(id),
  responder_type     text,                 -- provider|business|user
  responder_tagline  text,
  price              int not null,
  message            text,
  eta                text,
  status             proposal_status default 'SUBMITTED',
  is_boosted         boolean default false,
  created_at         timestamptz default now()
);
create index if not exists proposals_request_idx on public.proposals (request_id);

-- ============================================================
-- agreements
-- ============================================================
create table if not exists public.agreements (
  id                  text primary key,    -- 'ag1' ...
  request_id          text references public.requests(id),
  request_title       text,
  proposal_id         text,
  requester_user_id   text references public.users(id),
  responder_user_id   text references public.users(id),
  agreed_price        int not null,
  terms               text,
  scheduled_for       text,
  requester_confirmed boolean default false,
  responder_confirmed boolean default false,
  payment_mode        text default 'OFFLINE',  -- OFFLINE|ONLINE
  status              agreement_status default 'PENDING',
  created_at          timestamptz default now()
);

-- ============================================================
-- Helper: keep geom in sync with lat/lng on write
-- ============================================================
create or replace function public.sync_geom() returns trigger as $$
begin
  if new.lat is not null and new.lng is not null then
    new.geom := ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  end if;
  return new;
end $$ language plpgsql;

do $$ begin
  create trigger businesses_geom before insert or update on public.businesses
    for each row execute function public.sync_geom();
  create trigger providers_geom before insert or update on public.providers
    for each row execute function public.sync_geom();
  create trigger requests_geom before insert or update on public.requests
    for each row execute function public.sync_geom();
exception when duplicate_object then null; end $$;

-- ============================================================
-- support_tickets
-- ============================================================
create table if not exists public.support_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    text references public.users(id),
  category   text not null,
  email      text not null,
  subject    text not null,
  message    text not null,
  status     text not null default 'OPEN',
  created_at timestamptz default now()
);

-- ============================================================
-- bug_reports
-- ============================================================
create table if not exists public.bug_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     text references public.users(id),
  description text not null,
  status      text not null default 'OPEN',
  created_at  timestamptz default now()
);

create index if not exists support_tickets_user_id_idx on public.support_tickets (user_id);
create index if not exists bug_reports_user_id_idx on public.bug_reports (user_id);


