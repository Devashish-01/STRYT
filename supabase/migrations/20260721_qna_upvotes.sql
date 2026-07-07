-- Flow 7 (Q&A) — upvote unanswered questions so owners see what visitors most
-- want answered first; "verified answer" is a pure UI badge (no schema needed).
-- Run manually in Supabase SQL editor.

alter table if exists public.business_qna
  add column if not exists upvotes int not null default 0;

create table if not exists public.qna_upvotes (
  id         text primary key default ('qu_' || replace(gen_random_uuid()::text, '-', '')),
  qna_id     text not null references public.business_qna(id) on delete cascade,
  user_id    text not null references public.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (qna_id, user_id)
);
create index if not exists qna_upvotes_qna_idx on public.qna_upvotes (qna_id);

alter table public.qna_upvotes enable row level security;

do $$ begin
  create policy qna_upvotes_read on public.qna_upvotes
    for select using (true);
  create policy qna_upvotes_insert on public.qna_upvotes
    for insert with check (user_id = auth.uid()::text);
  create policy qna_upvotes_delete on public.qna_upvotes
    for delete using (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;
