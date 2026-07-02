-- ============================================================
-- Q-1 (My Queues dashboard) + GEN-1 (notification triggers)
-- Run manually in Supabase SQL editor.
-- ============================================================

-- ── Q-1: let a customer leave a queue they joined ──────────────
-- queue_tokens.status has never appeared in a tracked migration (schema
-- drift, same class of issue as alias/show_*_publicly earlier). Defensively
-- normalize to text + permissive check so 'LEFT' is accepted regardless of
-- whether the live column was a bare text field or a custom enum type.
alter table public.queue_tokens alter column status type text using status::text;
alter table public.queue_tokens drop constraint if exists queue_tokens_status_check;
alter table public.queue_tokens add constraint queue_tokens_status_check
  check (status in ('WAITING','CALLED','SERVED','LEFT'));

create index if not exists queue_tokens_customer_idx on public.queue_tokens (customer_user_id, created_at desc);

-- ── GEN-1: re-apply proposal/agreement triggers idempotently ──
-- These already exist in the untracked supabase/migration_r8.sql — re-running
-- here (CREATE OR REPLACE + DROP TRIGGER IF EXISTS) is a safe no-op if already
-- live, and closes the gap if that file was never actually applied.
create or replace function public.notify_on_proposal()
returns trigger as $$
declare
  req_owner text;
  req_title text;
begin
  select requester_user_id, title
    into req_owner, req_title
    from public.requests
   where id = new.request_id;

  if req_owner is null or req_owner = new.responder_user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    req_owner,
    'PROPOSAL',
    'New proposal on your request',
    'Someone replied to "' || coalesce(req_title, 'your request') || '"',
    '/request/' || new.request_id
  );
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_proposal on public.proposals;
create trigger trg_notify_proposal
  after insert on public.proposals
  for each row execute function public.notify_on_proposal();

create or replace function public.notify_on_agreement()
returns trigger as $$
begin
  if new.status = 'ACTIVE' and (old.status is null or old.status <> 'ACTIVE') then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      new.requester_user_id,
      'AGREEMENT',
      'Agreement confirmed',
      'Your agreement for "' || coalesce(new.request_title, 'a request') || '" is now active.',
      '/agreement/' || new.id
    );
    if new.responder_user_id <> new.requester_user_id then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (
        new.responder_user_id,
        'AGREEMENT',
        'Agreement confirmed',
        'The agreement for "' || coalesce(new.request_title, 'a request') || '" is active — good luck!',
        '/agreement/' || new.id
      );
    end if;
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_agreement on public.agreements;
create trigger trg_notify_agreement
  after update on public.agreements
  for each row execute function public.notify_on_agreement();

-- ── GEN-1 (new): nearby-request notification — previously the NEARBY_REQUEST
-- type existed in the app's type union with its own icon, but nothing ever
-- created a row of that type. Mirrors the bounding-box "nearby" technique
-- already used client-side in adminService.ts for new-listing broadcasts.
create or replace function public.notify_on_request()
returns trigger as $$
declare
  delta double precision;
begin
  if new.lat is null or new.lng is null then
    return new;
  end if;
  delta := coalesce(new.radius_km, 5) / 111.0;

  insert into public.notifications (user_id, type, title, body, deep_link)
  select u.id, 'NEARBY_REQUEST',
         'New request near you',
         coalesce(new.category_name, 'Someone') || ' needs help: "' || left(coalesce(new.title, new.description, 'a request'), 60) || '"',
         '/request/' || new.id
    from public.users u
   where u.id <> new.requester_user_id
     and u.lat is not null and u.lng is not null
     and u.lat between new.lat - delta and new.lat + delta
     and u.lng between new.lng - delta and new.lng + delta
   limit 200;

  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_request on public.requests;
create trigger trg_notify_request
  after insert on public.requests
  for each row execute function public.notify_on_request();
