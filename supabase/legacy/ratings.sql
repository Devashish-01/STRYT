-- ============================================================
-- NAYA — ratings table (run AFTER schema.sql + rls.sql)
-- Stores mutual ratings from completed agreements.
-- Safe to re-run (CREATE IF NOT EXISTS + idempotent policies).
-- ============================================================

create table if not exists public.ratings (
  id            text primary key default ('rv_' || replace(gen_random_uuid()::text, '-', '')),
  rater_user_id text references public.users(id),
  ratee_type    text not null,          -- 'USER' | 'BUSINESS' | 'PROVIDER'
  ratee_id      text not null,          -- id of the rated entity
  rating        int  not null check (rating between 1 and 5),
  comment       text,
  tip           int,                    -- optional offline tip amount in INR
  created_at    timestamptz default now()
);

create index if not exists ratings_ratee_idx on public.ratings (ratee_type, ratee_id);
create index if not exists ratings_rater_idx on public.ratings (rater_user_id);

-- RLS
alter table public.ratings enable row level security;

do $$ begin
  -- Anyone can read ratings (public reputation scores).
  create policy read_ratings on public.ratings
    for select using (true);
  -- Only authenticated users can insert, and only as themselves.
  create policy ins_ratings on public.ratings
    for insert with check (rater_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;
