-- ============================================================
-- 20260917 — Fix a real integration bug found while testing 20260914's new
-- queue_token_create_walk_in: enforce_queue_open_on_join (20260729) fires on
-- every queue_tokens insert unconditionally, blocking a customer
-- self-joining a closed queue — which is correct — but it ALSO blocked the
-- owner's own walk-in insert whenever the queue happened to be toggled off,
-- which is wrong. An owner manually adding someone in person isn't a
-- customer self-join and shouldn't be gated by "is this queue open to the
-- public" at all. Exempt walk-ins specifically (customer_user_id IS NULL —
-- the one thing that distinguishes them, since a real customer join always
-- carries their own uid) rather than trying to detect the calling RPC.
-- ============================================================

create or replace function public.enforce_queue_open_on_join()
returns trigger as $$
declare
  v_is_open boolean;
begin
  if new.customer_user_id is null then
    return new;
  end if;

  select is_open into v_is_open
    from public.queue_settings
   where business_id = new.business_id;

  if coalesce(v_is_open, false) is false then
    raise exception 'This queue is currently closed — the shop isn''t accepting new joins right now.';
  end if;

  return new;
end $$ language plpgsql security definer;
