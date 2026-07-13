-- ============================================================
-- NAYA — R10 migration: loyalty cards, stamps, saved coupons,
--        settlements ledger + auto-settlement trigger.
-- Run AFTER migration_r9.sql. Safe to re-run.
-- ============================================================

-- ── 1. LOYALTY CARDS (business-defined program) ───────────────
create table if not exists public.loyalty_cards (
  id            text primary key default ('lc_' || replace(gen_random_uuid()::text, '-', '')),
  business_id   text not null references public.businesses(id) on delete cascade,
  target        int  not null default 10,   -- stamps needed for reward
  reward        text not null default 'Free item',
  is_active     boolean default true,
  created_at    timestamptz default now(),
  unique (business_id)  -- one program per business for MVP
);

alter table public.loyalty_cards enable row level security;

do $$ begin
  create policy read_loyalty_cards on public.loyalty_cards
    for select using (true);
  create policy write_loyalty_cards on public.loyalty_cards
    for all
    using  (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text))
    with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text));
exception when duplicate_object then null; end $$;

-- ── 2. USER STAMPS (per user, per card) ───────────────────────
create table if not exists public.user_stamps (
  id         text primary key default ('us_' || replace(gen_random_uuid()::text, '-', '')),
  user_id    text not null references public.users(id) on delete cascade,
  card_id    text not null references public.loyalty_cards(id) on delete cascade,
  stamps     int  not null default 0,
  updated_at timestamptz default now(),
  unique (user_id, card_id)
);

alter table public.user_stamps enable row level security;

do $$ begin
  create policy read_user_stamps on public.user_stamps
    for select using (user_id = auth.uid()::text);
  create policy write_user_stamps on public.user_stamps
    for all
    using  (user_id = auth.uid()::text)
    with check (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- ── 3. USER SAVED COUPONS (saved offers from businesses) ──────
create table if not exists public.user_saved_coupons (
  id         text primary key default ('uco_' || replace(gen_random_uuid()::text, '-', '')),
  user_id    text not null references public.users(id) on delete cascade,
  offer_id   text not null references public.offers(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, offer_id)
);

alter table public.user_saved_coupons enable row level security;

do $$ begin
  create policy read_saved_coupons on public.user_saved_coupons
    for select using (user_id = auth.uid()::text);
  create policy ins_saved_coupons on public.user_saved_coupons
    for insert with check (user_id = auth.uid()::text);
  create policy del_saved_coupons on public.user_saved_coupons
    for delete using (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- ── 4. SETTLEMENTS LEDGER ────────────────────────────────────
create table if not exists public.settlements (
  id            text primary key default ('st_' || replace(gen_random_uuid()::text, '-', '')),
  agreement_id  text not null references public.agreements(id) on delete cascade,
  user_id       text not null references public.users(id) on delete cascade,
  with_user_id  text not null references public.users(id),
  amount        int  not null default 0,   -- paise or INR integer
  mode          text not null default 'CASH',  -- CASH | UPI_OFFLINE
  note          text not null default '',
  tip           int  default 0,
  created_at    timestamptz default now()
);

create index if not exists settlements_user_idx on public.settlements (user_id, created_at desc);

alter table public.settlements enable row level security;

do $$ begin
  create policy read_settlements on public.settlements
    for select using (user_id = auth.uid()::text);
  -- inserted by trigger (security definer), not directly by client
exception when duplicate_object then null; end $$;

-- ── 5. TRIGGER: auto-create settlements on agreement COMPLETED ─
create or replace function public.create_settlements_on_complete()
returns trigger as $$
declare
  req_title text;
  req_price int;
begin
  if new.status = 'COMPLETED' and (old.status is null or old.status <> 'COMPLETED') then
    req_title := coalesce(new.request_title, 'Agreement');
    req_price := coalesce(new.agreed_price, 0);

    -- settlement for the requester (they paid)
    insert into public.settlements
      (agreement_id, user_id, with_user_id, amount, mode, note)
    values
      (new.id, new.requester_user_id, new.responder_user_id, req_price, 'CASH', req_title)
    on conflict do nothing;

    -- settlement for the responder (they received)
    if new.responder_user_id <> new.requester_user_id then
      insert into public.settlements
        (agreement_id, user_id, with_user_id, amount, mode, note)
      values
        (new.id, new.responder_user_id, new.requester_user_id, req_price, 'CASH', req_title)
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_settlements on public.agreements;
create trigger trg_settlements
  after update on public.agreements
  for each row execute function public.create_settlements_on_complete();

-- ── 6. Patch offers table: add is_active if missing ──────────
alter table public.offers add column if not exists is_active boolean default true;
