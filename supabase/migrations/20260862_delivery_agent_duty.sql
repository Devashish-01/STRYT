-- On/off-duty for delivery agents. A single global "am I working right now"
-- signal per user (not per-business), matching the existing "one merged
-- Delivery hat across every business you deliver for" model — my_deliveries()
-- already unions across businesses server-side, so duty does too.
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as `delivery_agent_duty`.
create table public.delivery_agent_duty (
  user_id text primary key references public.users(id) on delete cascade,
  on_duty boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.delivery_agent_duty enable row level security;

-- The agent sees their own row; a business owner/manager sees it only for an
-- agent who currently holds an ACTIVE delivery-scoped grant at one of their
-- businesses (same "appointments" management boundary business_active_deliveries
-- already uses for owner visibility).
create policy delivery_agent_duty_select on public.delivery_agent_duty
  for select using (
    user_id = auth.uid()::text
    or exists (
      select 1 from public.business_access_sessions s
      where s.grantee_user_id = delivery_agent_duty.user_id
        and s.status = 'ACTIVE'
        and (s.expires_at is null or s.expires_at > now())
        and 'delivery' = any(s.scopes)
        and public.has_business_scope(s.business_id, auth.uid()::text, 'appointments')
    )
  );

grant select on public.delivery_agent_duty to authenticated;
-- No INSERT/UPDATE policy — writes only through the RPCs below.

create or replace function public.get_delivery_duty()
returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid text := auth.uid()::text;
  v_on boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select on_duty into v_on from public.delivery_agent_duty where user_id = v_uid;
  return coalesce(v_on, true);
end
$function$;

-- Going OFF duty is blocked while any non-terminal delivery work exists for
-- this agent — there's no reassignment-on-duty-change flow anywhere in this
-- app, so letting someone go dark mid-run would strand a customer with
-- nothing to catch it. Going ON duty is always allowed.
create or replace function public.set_delivery_duty(p_on_duty boolean)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid text := auth.uid()::text;
  v_active_count int;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  if p_on_duty = false then
    select count(*) into v_active_count
    from public.appointment_deliveries d
    where d.agent_user_id = v_uid
      and d.status in ('ASSIGNED', 'EN_ROUTE', 'ARRIVED');

    if v_active_count = 0 then
      select count(*) into v_active_count
      from public.delivery_batches b
      where b.agent_user_id = v_uid
        and b.status in ('PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS');
    end if;

    if v_active_count > 0 then
      raise exception 'Finish your current delivery before going off duty.';
    end if;
  end if;

  insert into public.delivery_agent_duty (user_id, on_duty, updated_at)
  values (v_uid, p_on_duty, now())
  on conflict (user_id) do update set on_duty = excluded.on_duty, updated_at = now();

  return p_on_duty;
end
$function$;

revoke all on function public.get_delivery_duty() from public, anon;
grant execute on function public.get_delivery_duty() to authenticated;

revoke all on function public.set_delivery_duty(boolean) from public, anon;
grant execute on function public.set_delivery_duty(boolean) to authenticated;
