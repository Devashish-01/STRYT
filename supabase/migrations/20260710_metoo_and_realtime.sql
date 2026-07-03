-- ============================================================
-- Fix 3 (Me too — full flow) + Fix 4 (mock-target demo pages)
-- request_me_toos + its me_too_count sync were never in any tracked
-- migration (schema drift — requestService.meToo() only worked because
-- these existed live, untracked). This captures them for real, adds the
-- notify-on-me-too + group-buy-unlock notifications that never existed,
-- and gets the requests table properly synced.
-- Run manually in Supabase SQL editor.
-- ============================================================

create table if not exists public.request_me_toos (
  id          uuid primary key default gen_random_uuid(),
  request_id  text not null references public.requests(id) on delete cascade,
  user_id     text not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (request_id, user_id)
);
create index if not exists request_me_toos_request_idx on public.request_me_toos (request_id);
create index if not exists request_me_toos_user_idx on public.request_me_toos (user_id);

alter table public.request_me_toos enable row level security;

do $$ begin
  create policy read_request_me_toos on public.request_me_toos
    for select using (auth.role() = 'authenticated' or auth.role() = 'anon');
  create policy ins_request_me_toos on public.request_me_toos
    for insert with check (user_id = auth.uid()::text);
  create policy del_request_me_toos on public.request_me_toos
    for delete using (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- Sync requests.me_too_count + notify requester + fire the group-buy-unlock
-- notification exactly once (when the count first reaches the target).
create or replace function public.sync_request_me_too()
returns trigger as $$
declare
  req_owner text;
  req_title text;
  req_is_group_buy boolean;
  req_group_target int;
  new_count int;
begin
  if tg_op = 'INSERT' then
    update public.requests
       set me_too_count = coalesce(me_too_count, 0) + 1
     where id = new.request_id
    returning requester_user_id, title, is_group_buy, group_buy_target, me_too_count
      into req_owner, req_title, req_is_group_buy, req_group_target, new_count;

    if req_owner is not null and req_owner <> new.user_id then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (
        req_owner, 'ME_TOO', 'Someone said "me too"',
        'A neighbor needs "' || coalesce(req_title, 'your request') || '" too.',
        '/request/' || new.request_id
      );
    end if;

    if req_is_group_buy and req_group_target is not null and new_count = req_group_target then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (
        req_owner, 'GROUP_BUY_UNLOCKED', 'Group buy unlocked!',
        req_group_target || ' neighbors joined "' || coalesce(req_title, 'your request') || '" — bulk price unlocked.',
        '/request/' || new.request_id
      );
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    update public.requests
       set me_too_count = greatest(0, coalesce(me_too_count, 0) - 1)
     where id = old.request_id;
    return old;
  end if;
  return null;
end $$ language plpgsql security definer;

drop trigger if exists trg_metoo_insert on public.request_me_toos;
create trigger trg_metoo_insert
  after insert on public.request_me_toos
  for each row execute function public.sync_request_me_too();

drop trigger if exists trg_metoo_delete on public.request_me_toos;
create trigger trg_metoo_delete
  after delete on public.request_me_toos
  for each row execute function public.sync_request_me_too();
