-- ============================================================
-- Blocks a new queue_tokens row from being created for a business whose
-- queue is currently closed (queue_settings.is_open = false). The client
-- (businessService.joinQueueToken) already checks this before inserting and
-- the "Join queue" button is hidden while closed, but neither stops a direct
-- API call — this trigger is the actual enforcement point. Run manually in
-- Supabase SQL editor.
-- ============================================================

create or replace function public.enforce_queue_open_on_join()
returns trigger as $$
declare
  v_is_open boolean;
begin
  select is_open into v_is_open
    from public.queue_settings
   where business_id = new.business_id;

  if coalesce(v_is_open, false) is false then
    raise exception 'This queue is currently closed — the shop isn''t accepting new joins right now.';
  end if;

  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_enforce_queue_open_on_join on public.queue_tokens;
create trigger trg_enforce_queue_open_on_join
  before insert on public.queue_tokens
  for each row execute function public.enforce_queue_open_on_join();
