-- ============================================================
-- NAYA — R11: provider packages, Q&A, leads, boosts, analytics
-- Run AFTER migration_r10.sql. Safe to re-run.
-- ============================================================

-- ── 1. PROVIDER PACKAGES ─────────────────────────────────────
create table if not exists public.provider_packages (
  id           text primary key default ('pk_' || replace(gen_random_uuid()::text, '-', '')),
  provider_id  text not null references public.providers(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  price        int  not null,
  duration     text not null default '',
  instant_book boolean default false,
  created_at   timestamptz default now()
);

create index if not exists pkg_provider_idx on public.provider_packages (provider_id);
alter table public.provider_packages enable row level security;

do $$ begin
  create policy read_packages on public.provider_packages for select using (true);
  create policy write_packages on public.provider_packages
    for all
    using  (exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()::text))
    with check (exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()::text));
exception when duplicate_object then null; end $$;

-- ── 2. BUSINESS Q&A ──────────────────────────────────────────
create table if not exists public.business_qna (
  id           text primary key default ('qna_' || replace(gen_random_uuid()::text, '-', '')),
  business_id  text not null references public.businesses(id) on delete cascade,
  asker_user_id text not null references public.users(id),
  question     text not null,
  answer       text,
  answered_at  timestamptz,
  created_at   timestamptz default now()
);

create index if not exists qna_biz_idx on public.business_qna (business_id, created_at desc);
alter table public.business_qna enable row level security;

do $$ begin
  create policy read_qna on public.business_qna for select using (true);
  create policy ins_qna  on public.business_qna
    for insert with check (asker_user_id = auth.uid()::text);
  -- owner can update (answer)
  create policy upd_qna  on public.business_qna
    for update
    using  (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text))
    with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text));
exception when duplicate_object then null; end $$;

-- ── 3. LEADS ─────────────────────────────────────────────────
-- Records every trackable interaction (call, directions, question, offer clip).
create table if not exists public.leads (
  id           text primary key default ('ld_' || replace(gen_random_uuid()::text, '-', '')),
  business_id  text references public.businesses(id) on delete cascade,
  provider_id  text references public.providers(id) on delete cascade,
  from_user_id text references public.users(id),
  kind         text not null,  -- CALL | DIRECTIONS | QUESTION | OFFER_CLIP | STORY_REPLY
  note         text default '',
  handled      boolean default false,
  created_at   timestamptz default now()
);

create index if not exists leads_biz_idx on public.leads (business_id, created_at desc);
create index if not exists leads_prov_idx on public.leads (provider_id, created_at desc);
alter table public.leads enable row level security;

do $$ begin
  -- owner of the business/provider sees their leads
  create policy read_leads on public.leads
    for select using (
      (business_id is not null and exists (
        select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text))
      or
      (provider_id is not null and exists (
        select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()::text))
    );
  create policy ins_leads on public.leads
    for insert with check (auth.role() = 'authenticated');
  create policy upd_leads on public.leads
    for update
    using (
      (business_id is not null and exists (
        select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text))
      or
      (provider_id is not null and exists (
        select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()::text))
    );
exception when duplicate_object then null; end $$;

-- Q&A question → auto-create a lead for the business owner
create or replace function public.qna_to_lead()
returns trigger as $$
begin
  insert into public.leads (business_id, from_user_id, kind, note)
  values (new.business_id, new.asker_user_id, 'QUESTION', left(new.question, 120))
  on conflict do nothing;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_qna_lead on public.business_qna;
create trigger trg_qna_lead
  after insert on public.business_qna
  for each row execute function public.qna_to_lead();

-- ── 4. BOOSTS ────────────────────────────────────────────────
create table if not exists public.boosts (
  id           text primary key default ('bo_' || replace(gen_random_uuid()::text, '-', '')),
  target_type  text not null,  -- business | provider
  target_id    text not null,
  boost_type   text not null,  -- RADIUS | TOP_FEED | REBROADCAST | FEATURED | PROMO_OFFER
  starts_at    timestamptz default now(),
  ends_at      timestamptz,
  created_at   timestamptz default now()
);

alter table public.boosts enable row level security;

do $$ begin
  create policy read_boosts on public.boosts for select using (auth.role() = 'authenticated');
  create policy ins_boosts  on public.boosts for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ── 5. ANALYTICS COLUMNS ─────────────────────────────────────
alter table public.businesses
  add column if not exists view_count       int default 0,
  add column if not exists call_count       int default 0,
  add column if not exists directions_count int default 0,
  add column if not exists is_boosted       boolean default false,
  add column if not exists boosted_until    timestamptz;

alter table public.providers
  add column if not exists view_count int default 0;

-- ── 6. METRIC RPCs ───────────────────────────────────────────
-- Viewers/customers are NOT the owner, so RLS blocks a direct UPDATE on the
-- listing. These SECURITY DEFINER helpers let any signed-in (or anon) user bump
-- a public counter without exposing a general write policy on the row.
create or replace function public.bump_business_metric(p_business_id text, p_metric text)
returns void as $$
begin
  if p_metric = 'view' then
    update public.businesses set view_count = coalesce(view_count, 0) + 1 where id = p_business_id;
  elsif p_metric = 'call' then
    update public.businesses set call_count = coalesce(call_count, 0) + 1 where id = p_business_id;
  elsif p_metric = 'directions' then
    update public.businesses set directions_count = coalesce(directions_count, 0) + 1 where id = p_business_id;
  end if;
end $$ language plpgsql security definer;

create or replace function public.bump_provider_views(p_provider_id text)
returns void as $$
begin
  update public.providers set view_count = coalesce(view_count, 0) + 1 where id = p_provider_id;
end $$ language plpgsql security definer;

grant execute on function public.bump_business_metric(text, text) to anon, authenticated;
grant execute on function public.bump_provider_views(text)        to anon, authenticated;
