-- ============================================================
-- Code-audit guardrails for local discovery, appointments,
-- proposal identity, and push health.
--
-- Do not run automatically from Codex. Apply manually in Supabase SQL editor
-- or via your migration workflow after reviewing.
-- ============================================================

-- 1. Discovery must respect both the viewer's chosen radius and the listing's
-- own work/service radius. This mirrors the client-side guard in
-- discoveryService.ts, but makes the database RPC the source of truth.
create or replace function public.businesses_nearby(
  in_lng        double precision,
  in_lat        double precision,
  in_radius_km  double precision default 50,
  in_category   text default null,
  in_limit      int default 20,
  in_offset     int default 0
)
returns setof public.businesses as $$
  select b.*
  from public.businesses b
  where b.status = 'ACTIVE'
    and b.owner_enabled = true
    and b.deleted_at is null
    and b.geom is not null
    and (in_category is null or b.category_id = in_category)
    and ST_DWithin(
      b.geom,
      ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
      least(in_radius_km, greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0)) * 1000
    )
  order by ST_Distance(b.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography) asc
  limit in_limit offset in_offset;
$$ language sql stable;

create or replace function public.providers_nearby(
  in_lng        double precision,
  in_lat        double precision,
  in_radius_km  double precision default 50,
  in_category   text default null,
  in_limit      int default 20,
  in_offset     int default 0
)
returns setof public.providers as $$
  select p.*
  from public.providers p
  where p.status = 'ACTIVE'
    and p.owner_enabled = true
    and p.deleted_at is null
    and p.geom is not null
    and (in_category is null or p.category_id = in_category)
    and ST_DWithin(
      p.geom,
      ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
      least(in_radius_km, greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0)) * 1000
    )
  order by ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography) asc
  limit in_limit offset in_offset;
$$ language sql stable;

-- 2. Enforce the daily customer appointment limit in the database so two tabs
-- or devices cannot race past the client-side check.
create or replace function public.enforce_customer_daily_appointment_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  if coalesce(new.is_walk_in, false) then
    return new;
  end if;

  if new.status in ('CANCELLED', 'REJECTED') then
    return new;
  end if;

  select count(*)
    into v_count
    from public.appointments a
   where a.customer_user_id = new.customer_user_id
     and a.id is distinct from new.id
     and coalesce(a.is_walk_in, false) = false
     and a.status not in ('CANCELLED', 'REJECTED')
     and a.scheduled_for >= date_trunc('day', new.scheduled_for)
     and a.scheduled_for <  date_trunc('day', new.scheduled_for) + interval '1 day';

  if v_count >= 5 then
    raise exception 'You''ve reached the limit of 5 appointments for this day. Please pick another date.';
  end if;

  return new;
end $$;

drop trigger if exists trg_customer_daily_appointment_limit on public.appointments;
create trigger trg_customer_daily_appointment_limit
  before insert or update of customer_user_id, scheduled_for, status
  on public.appointments
  for each row execute function public.enforce_customer_daily_appointment_limit();

-- 3. Enforce proposal responder entity ownership server-side. The client still
-- validates for UX, but the database rejects impersonation or stale route state.
create or replace function public.enforce_proposal_responder_entity_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.responder_type is null or new.responder_type = 'user' then
    new.responder_type := 'user';
    new.responder_entity_id := null;
    return new;
  end if;

  if new.responder_type = 'business' then
    if new.responder_entity_id is null or not exists (
      select 1 from public.businesses b
       where b.id = new.responder_entity_id
         and b.owner_user_id = new.responder_user_id
    ) then
      raise exception 'You can only submit a business proposal as a business you own.';
    end if;
    return new;
  end if;

  if new.responder_type = 'provider' then
    if new.responder_entity_id is null or not exists (
      select 1 from public.providers p
       where p.id = new.responder_entity_id
         and p.user_id = new.responder_user_id
    ) then
      raise exception 'You can only submit a provider proposal as a provider profile you own.';
    end if;
    return new;
  end if;

  raise exception 'Invalid proposal responder type.';
end $$;

drop trigger if exists trg_proposal_responder_entity_owner on public.proposals;
create trigger trg_proposal_responder_entity_owner
  before insert or update of responder_type, responder_entity_id, responder_user_id
  on public.proposals
  for each row execute function public.enforce_proposal_responder_entity_owner();

-- 4. Lightweight health check for the push trigger setup. It returns booleans
-- only, never the service-role key or configured URL value.
create or replace function public.notification_push_health()
returns table (
  pg_net_installed boolean,
  functions_url_configured boolean,
  service_role_key_configured boolean,
  trigger_installed boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    exists(select 1 from pg_extension where extname = 'pg_net') as pg_net_installed,
    coalesce(current_setting('app.settings.functions_url', true), '') <> '' as functions_url_configured,
    coalesce(current_setting('app.settings.service_role_key', true), '') <> '' as service_role_key_configured,
    exists(
      select 1
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'notifications'
         and t.tgname = 'trg_push_on_notification'
         and not t.tgisinternal
    ) as trigger_installed;
$$;

grant execute on function public.notification_push_health() to authenticated;
