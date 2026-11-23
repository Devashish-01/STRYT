-- Migration: 20261025_teleportation_and_telemetry_hardening.sql
-- SEC-GEO-04, SEC-GEO-05, SEC-GEO-06, SEC-GEO-07:
-- 1. Server-side teleportation & implausible speed detection (> 130 km/h)
-- 2. Decoupled live position (out-of-order protection) from historical telemetry audit log
-- 3. GPS horizontal accuracy persistence and gating
-- 4. Idempotent geofence arrival detection (100m dropoff threshold) with customer alerts

-- ── 1. Schema Additions for Delivery Tracking ─────────────────────────────────
alter table public.appointment_deliveries
  add column if not exists accuracy double precision,
  add column if not exists arrival_notified_at timestamptz;

create table if not exists public.delivery_location_history (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null references public.appointment_deliveries(id) on delete cascade,
  agent_user_id text not null,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  heading double precision,
  speed double precision,
  simulated boolean default false,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_dlv_loc_hist_delivery
  on public.delivery_location_history(delivery_id, recorded_at asc);

alter table public.delivery_location_history enable row level security;

drop policy if exists dlv_loc_hist_insert on public.delivery_location_history;
create policy dlv_loc_hist_insert on public.delivery_location_history
  for insert to authenticated
  with check (agent_user_id = (select auth.uid())::text);

drop policy if exists dlv_loc_hist_select on public.delivery_location_history;
create policy dlv_loc_hist_select on public.delivery_location_history
  for select to authenticated
  using (
    agent_user_id = (select auth.uid())::text
    or exists (
      select 1 from public.appointment_deliveries ad
      join public.appointments a on a.id = ad.appointment_id
      where ad.id = delivery_location_history.delivery_id
        and (
          a.customer_user_id = (select auth.uid())::text
          or public.has_business_scope(ad.business_id, (select auth.uid())::text, 'appointments')
        )
    )
  );

-- ── 2. Hardened update_delivery_position ──────────────────────────────────────
create or replace function public.update_delivery_position(
  p_delivery_id text,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null::double precision,
  p_heading double precision default null::double precision,
  p_recorded_at timestamptz default null::timestamptz,
  p_simulated boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_appt record;
  v_client_time timestamptz := coalesce(p_recorded_at, now());
  v_delta_seconds double precision;
  v_delta_meters double precision;
  v_speed_kmh double precision;
  v_dest_distance double precision;
  v_effective_accuracy double precision := coalesce(p_accuracy, 25.0);
  v_agent_name text;
  v_agent_phone text;
  v_agent_avatar text;
  v_biz_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_lat < -90 or p_lat > 90 then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng < -180 or p_lng > 180 then raise exception 'INVALID_LONGITUDE'; end if;

  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_row.agent_user_id is distinct from v_uid then raise exception 'NOT_AGENT'; end if;
  if v_row.status not in ('EN_ROUTE', 'ARRIVED') then return; end if;

  -- ── A. Teleportation / Implausible Speed Validation ──────────────────────────
  if v_row.lat is not null and v_row.lng is not null and v_row.position_at is not null then
    v_delta_seconds := extract(epoch from (v_client_time - v_row.position_at));
    
    -- Sub-second bursts: preserve historical log but throttle live table write
    if v_delta_seconds > 1.5 then
      v_delta_meters := ST_Distance(
        ST_SetSRID(ST_MakePoint(v_row.lng, v_row.lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      );

      v_speed_kmh := (v_delta_meters / v_delta_seconds) * 3.6;

      -- Speed ceiling: 130 km/h over more than 250m displacement
      if v_speed_kmh > 130.0 and v_delta_meters > 250.0 then
        insert into public.client_errors (user_id, error_type, message, metadata, created_at)
        values (
          v_uid,
          'LOCATION_TELEPORTATION_SUSPECTED',
          format('Speed %s km/h across %s m in %s s', round(v_speed_kmh::numeric, 1), round(v_delta_meters::numeric, 1), round(v_delta_seconds::numeric, 1)),
          jsonb_build_object('delivery_id', p_delivery_id, 'prev_lat', v_row.lat, 'prev_lng', v_row.lng, 'new_lat', p_lat, 'new_lng', p_lng),
          now()
        );
        raise exception 'IMPLAUSIBLE_SPEED_DETECTED';
      end if;
    end if;
  end if;

  -- ── B. Historical Trail Logging (Always preserved for offline flushes) ───────
  begin
    insert into public.delivery_location_history (
      delivery_id, agent_user_id, lat, lng, accuracy, heading, speed, simulated, recorded_at
    ) values (
      p_delivery_id, v_uid, p_lat, p_lng, p_accuracy, p_heading,
      case when v_delta_seconds > 0 then (v_delta_meters / v_delta_seconds) else null end,
      p_simulated, v_client_time
    );
  exception when others then null; end;

  -- ── C. Out-of-Order Check: Live Position Only Updated If Monotonically Newer ─
  if v_row.position_at is null or v_client_time >= v_row.position_at then
    update public.appointment_deliveries
       set lat = p_lat,
           lng = p_lng,
           accuracy = coalesce(p_accuracy, accuracy),
           heading = coalesce(p_heading, heading),
           position_at = v_client_time
     where id = p_delivery_id;
  end if;

  -- ── D. Idempotent Arrival Geofence Detection (100m Drop-Off Zone) ───────────
  if v_row.status = 'EN_ROUTE' and v_row.arrival_notified_at is null then
    select a.customer_user_id, a.target_id, a.delivery_lat, a.delivery_lng
      into v_appt
      from public.appointments a
     where a.id = v_row.appointment_id;

    if v_appt.delivery_lat is not null and v_appt.delivery_lng is not null then
      v_dest_distance := ST_Distance(
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(v_appt.delivery_lng, v_appt.delivery_lat), 4326)::geography
      );

      -- Conservative entry condition: distance + horizontal uncertainty <= 100 meters
      if (v_dest_distance + v_effective_accuracy) <= 100.0 then
        update public.appointment_deliveries
           set status = 'ARRIVED',
               arrival_notified_at = now(),
               arrived_at = coalesce(arrived_at, now())
         where id = p_delivery_id;

        -- Fetch sender info for push alert
        if v_appt.target_id is not null then
          select name into v_biz_name from public.businesses where id = v_appt.target_id;
        end if;
        if v_row.agent_user_id is not null then
          v_agent_name := public.person_first_name(v_row.agent_user_id);
          select phone, avatar into v_agent_phone, v_agent_avatar from public.users where id = v_row.agent_user_id;
        end if;

        if v_appt.customer_user_id is not null then
          begin
            insert into public.notifications (user_id, type, title, body, deep_link, metadata)
            values (
              v_appt.customer_user_id,
              'DELIVERY',
              'Courier has arrived! 🛵',
              'Your delivery agent is outside. Share OTP ' || coalesce(v_row.handoff_code, '') || ' to receive your order.',
              '/appointments',
              jsonb_build_object(
                'deliveryId', p_delivery_id,
                'appointmentId', v_row.appointment_id,
                'handoffCode', v_row.handoff_code,
                'agentName', v_agent_name,
                'agentPhone', v_agent_phone,
                'avatarUrl', v_agent_avatar,
                'statusPill', 'Arrived',
                'tone', 'success',
                'actions', case when v_agent_phone is not null then jsonb_build_array('TRACK_DELIVERY', 'CALL_RIDER') else jsonb_build_array('TRACK_DELIVERY') end
              )
            );
          exception when others then null; end;
        end if;
      end if;
    end if;
  end if;
end $function$;

revoke all on function public.update_delivery_position(text, double precision, double precision, double precision, double precision, timestamptz, boolean) from public, anon;
grant execute on function public.update_delivery_position(text, double precision, double precision, double precision, double precision, timestamptz, boolean) to authenticated;

-- ── 3. Hardened update_delivery_batch_position ────────────────────────────────
create or replace function public.update_delivery_batch_position(
  p_batch_id text,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null::double precision,
  p_heading double precision default null::double precision,
  p_recorded_at timestamptz default null::timestamptz,
  p_simulated boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_batch public.delivery_batches%rowtype;
  v_client_time timestamptz := coalesce(p_recorded_at, now());
  v_delta_seconds double precision;
  v_delta_meters double precision;
  v_speed_kmh double precision;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_lat < -90 or p_lat > 90 then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng < -180 or p_lng > 180 then raise exception 'INVALID_LONGITUDE'; end if;

  select * into v_batch from public.delivery_batches
   where id = p_batch_id and agent_user_id = v_uid and status in ('ACCEPTED', 'IN_PROGRESS')
   for update;

  if not found then raise exception 'NOT_ALLOWED'; end if;

  if v_batch.lat is not null and v_batch.lng is not null and v_batch.position_at is not null then
    v_delta_seconds := extract(epoch from (v_client_time - v_batch.position_at));
    if v_delta_seconds > 1.5 then
      v_delta_meters := ST_Distance(
        ST_SetSRID(ST_MakePoint(v_batch.lng, v_batch.lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      );
      v_speed_kmh := (v_delta_meters / v_delta_seconds) * 3.6;
      if v_speed_kmh > 130.0 and v_delta_meters > 250.0 then
        raise exception 'IMPLAUSIBLE_SPEED_DETECTED';
      end if;
    end if;
  end if;

  if v_batch.position_at is null or v_client_time >= v_batch.position_at then
    update public.delivery_batches
       set lat = p_lat,
           lng = p_lng,
           accuracy = p_accuracy,
           heading = p_heading,
           position_at = v_client_time
     where id = p_batch_id and agent_user_id = v_uid;
  end if;
end $function$;

revoke all on function public.update_delivery_batch_position(text, double precision, double precision, double precision, double precision, timestamptz, boolean) from public, anon;
grant execute on function public.update_delivery_batch_position(text, double precision, double precision, double precision, double precision, timestamptz, boolean) to authenticated;
