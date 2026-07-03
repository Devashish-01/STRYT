-- ============================================================
-- Migration: Quote Broadcast to Me-Too Joiners
-- Add broadcast_to_metoo to proposals, and trigger notifications to me-toos.
-- ============================================================

-- 1. Add broadcast_to_metoo column to public.proposals defensively
alter table public.proposals add column if not exists broadcast_to_metoo boolean not null default false;

-- 2. Create function to notify me-too users on proposal broadcast
create or replace function public.notify_on_proposal_broadcast()
returns trigger as $$
declare
  req_owner text;
  req_title text;
begin
  select requester_user_id, title
    into req_owner, req_title
    from public.requests
   where id = new.request_id;

  -- Notify all me-too joiners except the requester and the provider themselves
  insert into public.notifications (user_id, type, title, body, deep_link)
  select mt.user_id,
         'QUOTE_BROADCAST',
         'New group quote available',
         'A provider sent a quote on the group request "' || coalesce(req_title, 'a request you joined') || '"',
         '/request/' || new.request_id
    from public.request_me_toos mt
   where mt.request_id = new.request_id
     and mt.user_id <> coalesce(req_owner, '')
     and mt.user_id <> new.responder_user_id;

  return new;
end $$ language plpgsql security definer;

-- 3. Bind the trigger to public.proposals
drop trigger if exists trg_notify_proposal_broadcast on public.proposals;
create trigger trg_notify_proposal_broadcast
  after insert on public.proposals
  for each row
  when (new.broadcast_to_metoo = true)
  execute function public.notify_on_proposal_broadcast();
