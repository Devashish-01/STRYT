-- confirm_handoff had no attempt limit at all — an agent (or anyone who
-- somehow reached the RPC) could brute-force a 6-digit handoff code
-- indefinitely. Same per-identifier attempts-table + lockout pattern already
-- used by verify_switch_pin (20260828_switch_pin.sql): 5 attempts / 15
-- minutes, keyed by the delivery being confirmed (not the agent's uid,
-- since a compromised session could otherwise still spread its attempts
-- across many different deliveries with no per-delivery limit).
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as
-- `confirm_handoff_rate_limit`.
create table public.handoff_attempts (
  delivery_id     text primary key references public.appointment_deliveries(id) on delete cascade,
  fail_count      integer not null default 0,
  locked_until    timestamptz,
  last_attempt_at timestamptz not null default now()
);

alter table public.handoff_attempts enable row level security;
revoke all on table public.handoff_attempts from public, anon, authenticated;
-- No policies — this table has no client-facing reads/writes at all; only
-- the SECURITY DEFINER confirm_handoff below ever touches it.

create or replace function public.confirm_handoff(p_delivery_id text, p_code text)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_attempt public.handoff_attempts%rowtype;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_matches boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;

  select * into v_attempt from public.handoff_attempts where delivery_id = p_delivery_id for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    raise exception 'Too many wrong attempts — wait a few minutes and ask the customer to confirm again.';
  end if;

  v_matches := v_row.handoff_code is not distinct from p_code;

  if v_matches then
    delete from public.handoff_attempts where delivery_id = p_delivery_id;
    update public.appointment_deliveries
       set handoff_verified = true, status = case when status = 'EN_ROUTE' then 'ARRIVED' else status end
     where id = p_delivery_id;
    return true;
  end if;

  insert into public.handoff_attempts (delivery_id, fail_count, last_attempt_at, locked_until)
  values (p_delivery_id, 1, now(), null)
  on conflict (delivery_id) do update
  set fail_count = case
        when handoff_attempts.last_attempt_at <= now() - v_window
          or handoff_attempts.locked_until is not null
        then 1 else handoff_attempts.fail_count + 1 end,
      last_attempt_at = now(),
      locked_until = case
        when (case
          when handoff_attempts.last_attempt_at <= now() - v_window
            or handoff_attempts.locked_until is not null
          then 1 else handoff_attempts.fail_count + 1 end) >= v_max_attempts
        then now() + v_window else null end;

  return false;
end
$function$;

revoke execute on function public.confirm_handoff(text, text) from public, anon;
grant execute on function public.confirm_handoff(text, text) to authenticated;
