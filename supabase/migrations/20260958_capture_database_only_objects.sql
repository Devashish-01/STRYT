-- Migration: 20260958_capture_database_only_objects.sql
-- Description: W2 — Capture database-only objects into the repository.
-- All definitions are copied verbatim from the live catalog snapshot (2026-09-11_after_20260957.sql).
-- This migration is strictly idempotent: applying it to production is a verified no-op.
-- Reference: docs/database/HANDOFF.md, docs/database/W2_EXECUTION_PLAN.md

-- ══════════════════════════════════════════════════════════════════
-- 1. FUNCTIONS & EXECUTE GRANTS (18 Functions)
-- ══════════════════════════════════════════════════════════════════

-- Function: can_manage_business
CREATE OR REPLACE FUNCTION public.can_manage_business(p_business_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    exists (
      select 1 from public.businesses b
      where b.id = p_business_id and b.owner_user_id = auth.uid()::text
    )
    or exists (
      select 1 from public.business_access_sessions s
      where s.business_id = p_business_id
        and s.grantee_user_id = auth.uid()::text
        and s.status = 'ACTIVE'
        and (s.expires_at is null or s.expires_at > now())
    );
$function$
;

revoke all on function public.can_manage_business(p_business_id text) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_business(p_business_id text) TO anon, authenticated, postgres, service_role;

-- Function: create_settlements_on_complete
CREATE OR REPLACE FUNCTION public.create_settlements_on_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  req_title text;
  req_price int;
begin
  if new.status = 'COMPLETED' and (old.status is null or old.status <> 'COMPLETED') then
    req_title := coalesce(new.request_title, 'Agreement');
    req_price := coalesce(new.agreed_price, 0);
    insert into public.settlements (agreement_id, user_id, with_user_id, amount, mode, note)
    values (new.id, new.requester_user_id, new.responder_user_id, req_price, 'CASH', req_title)
    on conflict do nothing;
    if new.responder_user_id <> new.requester_user_id then
      insert into public.settlements (agreement_id, user_id, with_user_id, amount, mode, note)
      values (new.id, new.responder_user_id, new.requester_user_id, req_price, 'CASH', req_title)
      on conflict do nothing;
    end if;
  end if;
  return new;
end $function$
;

revoke all on function public.create_settlements_on_complete() from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_settlements_on_complete() TO postgres, service_role;

-- Function: distance_km
CREATE OR REPLACE FUNCTION public.distance_km(in_lng double precision, in_lat double precision, row_lng double precision, row_lat double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select ST_Distance(
    ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(row_lng, row_lat), 4326)::geography
  ) / 1000.0;
$function$
;

revoke all on function public.distance_km(in_lng double precision, in_lat double precision, row_lng double precision, row_lat double precision) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distance_km(in_lng double precision, in_lat double precision, row_lng double precision, row_lat double precision) TO anon, authenticated, postgres, service_role, PUBLIC;

-- Function: increment_stamp
CREATE OR REPLACE FUNCTION public.increment_stamp(p_card_id text, p_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target int := 10;
  v_reward text := '';
  v_stamps int := 0;
  v_earned bool := false;
BEGIN
  SELECT target, COALESCE(reward, '')
    INTO v_target, v_reward
    FROM public.loyalty_cards
   WHERE id = p_card_id AND is_active = true
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('stamps', 0, 'needed', 10, 'rewardEarned', false, 'reward', '');
  END IF;

  INSERT INTO public.user_stamps (user_id, card_id, stamps, updated_at)
  VALUES (p_user_id, p_card_id, 1, now())
  ON CONFLICT (user_id, card_id)
  DO UPDATE SET stamps = user_stamps.stamps + 1, updated_at = now()
  RETURNING stamps INTO v_stamps;

  IF v_stamps >= v_target THEN
    v_earned := true;
    UPDATE public.user_stamps
       SET stamps = v_stamps % v_target, updated_at = now()
     WHERE user_id = p_user_id AND card_id = p_card_id;
    v_stamps := v_stamps % v_target;
  END IF;

  RETURN jsonb_build_object(
    'stamps',      v_stamps,
    'needed',      v_target,
    'rewardEarned', v_earned,
    'reward',      v_reward
  );
END;
$function$
;

revoke all on function public.increment_stamp(p_card_id text, p_user_id text) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_stamp(p_card_id text, p_user_id text) TO authenticated, postgres, service_role;

-- Function: neighborhood_today
CREATE OR REPLACE FUNCTION public.neighborhood_today(in_lat double precision, in_lng double precision, in_radius_m integer DEFAULT 3000)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  origin  geography := ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography;
  result  json;
begin
  select json_build_object(

    -- New businesses approved/created in last 24h within radius
    'new_businesses', (
      select count(*)
      from businesses b
      where b.status = 'ACTIVE'
        and b.created_at > now() - interval '24 hours'
        and b.geom is not null
        and ST_DWithin(b.geom, origin, in_radius_m)
    ),

    -- Agreements marked COMPLETED in last 24h within the originating request's radius
    -- (agreements have no geom; join to requests for location)
    'jobs_completed', (
      select count(*)
      from agreements a
      join requests r on r.id = a.request_id
      where a.status = 'COMPLETED'
        and a.created_at > now() - interval '24 hours'
        and r.geom is not null
        and ST_DWithin(r.geom, origin, in_radius_m)
    ),

    -- Active providers (is_available_now OR available_until in the future) within radius
    'providers_available', (
      select count(*)
      from providers p
      where p.status = 'ACTIVE'
        and (p.is_available_now = true or p.available_until > now())
        and p.geom is not null
        and ST_DWithin(p.geom, origin, in_radius_m)
    ),

    -- Open, non-expired requests within radius
    -- expires_in_hrs is integer hours from created_at (no separate expires_at column)
    'open_requests', (
      select count(*)
      from requests r
      where r.status = 'OPEN'
        and (
          r.expires_in_hrs is null
          or r.created_at + (r.expires_in_hrs * interval '1 hour') > now()
        )
        and r.geom is not null
        and ST_DWithin(r.geom, origin, in_radius_m)
    ),

    -- Alerts that are resolved and were created in the last 24h
    -- (no resolved_at column; approximated by created_at + resolved=true)
    'alerts_resolved', (
      select count(*)
      from community_posts c
      where c.type = 'ALERT'
        and c.resolved = true
        and c.created_at > now() - interval '24 hours'
        and c.geom is not null
        and ST_DWithin(c.geom, origin, in_radius_m)
    ),

    -- Lost & found posts that are resolved and were created in the last 24h
    'lost_found_resolved', (
      select count(*)
      from community_posts c
      where c.type = 'LOST_FOUND'
        and c.resolved = true
        and c.created_at > now() - interval '24 hours'
        and c.geom is not null
        and ST_DWithin(c.geom, origin, in_radius_m)
    ),

    -- Most recent unresolved ALERT created in the last 24h (urgency signal)
    'active_alert', (
      select json_build_object('id', c.id, 'title', c.title)
      from community_posts c
      where c.type = 'ALERT'
        and (c.resolved is null or c.resolved = false)
        and c.created_at > now() - interval '24 hours'
        and c.geom is not null
        and ST_DWithin(c.geom, origin, in_radius_m)
      order by c.created_at desc
      limit 1
    )

  ) into result;

  return result;
end;
$function$
;

revoke all on function public.neighborhood_today(in_lat double precision, in_lng double precision, in_radius_m integer) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neighborhood_today(in_lat double precision, in_lng double precision, in_radius_m integer) TO anon, authenticated, postgres, service_role;

-- Function: protect_business_owner
CREATE OR REPLACE FUNCTION public.protect_business_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    if not (old.owner_user_id = (auth.uid())::text or public.is_admin()) then
      raise exception 'Cannot change business owner';
    end if;
  end if;
  return new;
end $function$
;

revoke all on function public.protect_business_owner() from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_business_owner() TO postgres, service_role;

-- Function: rls_auto_enable
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO authenticated, postgres, service_role;

-- Function: suggest_business_login
CREATE OR REPLACE FUNCTION public.suggest_business_login(p_business_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_name text;
  v_slug text;
  v_hex text;
  v_suffix text;
  v_candidate text;
  v_try int := 0;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select name into v_name from public.businesses where id = p_business_id and owner_user_id = v_uid;
  if v_name is null then raise exception 'Not allowed'; end if;

  v_slug := trim(both '-' from lower(regexp_replace(coalesce(v_name,''), '[^a-zA-Z0-9]+', '-', 'g')));
  v_slug := left(nullif(v_slug, ''), 20);
  if v_slug is null or v_slug = '' then v_slug := 'shop'; end if;
  if v_slug !~ '[a-z]' then v_slug := 'shop-' || v_slug; end if;

  v_hex := regexp_replace(p_business_id, '[^a-f0-9]', '', 'g');
  v_suffix := right(v_hex, 4);

  loop
    v_candidate := v_slug || '-' || v_suffix;
    exit when not exists (select 1 from public.business_login_credentials c where lower(c.login_id) = v_candidate);
    v_try := v_try + 1;
    exit when v_try > 6;
    v_suffix := right(v_hex, 4 + v_try) || substr(md5(random()::text), 1, 2);
  end loop;

  return v_candidate;
end $function$
;

revoke all on function public.suggest_business_login(p_business_id text) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_business_login(p_business_id text) TO authenticated, postgres, service_role;

-- Function: sync_community_post_geom
CREATE OR REPLACE FUNCTION public.sync_community_post_geom()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$function$
;

revoke all on function public.sync_community_post_geom() from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_community_post_geom() TO postgres, service_role;

-- Function: sync_geom
CREATE OR REPLACE FUNCTION public.sync_geom()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.lat is not null and new.lng is not null then
    new.geom := ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  end if;
  return new;
end $function$
;

revoke all on function public.sync_geom() from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_geom() TO postgres, service_role;

-- Function: sync_is_verified
CREATE OR REPLACE FUNCTION public.sync_is_verified()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.verification_status = 'APPROVED' THEN
    NEW.is_verified := true;
  ELSE
    NEW.is_verified := false;
  END IF;
  RETURN NEW;
END $function$
;

revoke all on function public.sync_is_verified() from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_is_verified() TO postgres, service_role;

-- Function: sync_me_too_count
CREATE OR REPLACE FUNCTION public.sync_me_too_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    update public.requests set me_too_count = coalesce(me_too_count, 0) + 1 where id = new.request_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.requests set me_too_count = greatest(0, coalesce(me_too_count, 0) - 1) where id = old.request_id;
    return old;
  end if;
  return null;
end $function$
;

revoke all on function public.sync_me_too_count() from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_me_too_count() TO postgres, service_role;

-- Function: sync_story_geom
CREATE OR REPLACE FUNCTION public.sync_story_geom()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$function$
;

revoke all on function public.sync_story_geom() from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_story_geom() TO postgres, service_role;

-- Function: update_rating_avg
CREATE OR REPLACE FUNCTION public.update_rating_avg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.ratee_type = 'BUSINESS' THEN
    UPDATE public.businesses SET
      rating_avg   = (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.ratings WHERE ratee_type = 'BUSINESS' AND ratee_id = NEW.ratee_id),
      rating_count = (SELECT COUNT(*)                        FROM public.ratings WHERE ratee_type = 'BUSINESS' AND ratee_id = NEW.ratee_id)
    WHERE id = NEW.ratee_id;

  ELSIF NEW.ratee_type = 'PROVIDER' THEN
    UPDATE public.providers SET
      rating_avg   = (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.ratings WHERE ratee_type = 'PROVIDER' AND ratee_id = NEW.ratee_id),
      rating_count = (SELECT COUNT(*)                        FROM public.ratings WHERE ratee_type = 'PROVIDER' AND ratee_id = NEW.ratee_id)
    WHERE id = NEW.ratee_id;

  ELSIF NEW.ratee_type = 'USER' THEN
    UPDATE public.users SET
      rating_avg   = (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.ratings WHERE ratee_type = 'USER' AND ratee_id = NEW.ratee_id),
      rating_count = (SELECT COUNT(*)                        FROM public.ratings WHERE ratee_type = 'USER' AND ratee_id = NEW.ratee_id)
    WHERE id = NEW.ratee_id;
  END IF;

  RETURN NEW;
END;
$function$
;

revoke all on function public.update_rating_avg() from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_rating_avg() TO postgres, service_role;

-- Function: set_business_login
CREATE OR REPLACE FUNCTION public.set_business_login(p_business_id text, p_login_id text, p_password text, p_require_approval boolean, p_session_hours integer, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_login text := lower(trim(p_login_id));
  v_hours integer := least(greatest(coalesce(p_session_hours, 8), 1), 720);
  v_bphone text;
  v_uphone text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = v_uid) then
    raise exception 'Not allowed';
  end if;
  if v_login = '' then raise exception 'Login id required'; end if;

  if v_login ~ '^[0-9]+$' then
    -- numeric: only the owner's own 10-digit mobile is allowed
    if length(v_login) <> 10 then
      raise exception 'A numeric login id must be your 10-digit mobile number';
    end if;
    select regexp_replace(coalesce(b.phone,''), '\D', '', 'g'),
           regexp_replace(coalesce(u.phone,''), '\D', '', 'g')
      into v_bphone, v_uphone
      from public.businesses b
      left join public.users u on u.id = b.owner_user_id
      where b.id = p_business_id;
    if right(coalesce(v_bphone,''),10) <> v_login and right(coalesce(v_uphone,''),10) <> v_login then
      raise exception 'A number can only be your own mobile number';
    end if;
  else
    -- handle: must contain at least one letter and only safe characters
    if v_login !~ '^[a-z0-9._-]{4,30}$' or v_login !~ '[a-z]' then
      raise exception 'Use 4-30 letters/numbers (with at least one letter), or your own mobile number';
    end if;
  end if;

  insert into public.business_login_credentials
    (business_id, login_id, password_hash, require_approval, session_hours, is_enabled, updated_at)
  values (
    p_business_id, v_login,
    case when coalesce(p_password,'') <> '' then crypt(p_password, gen_salt('bf')) else '' end,
    coalesce(p_require_approval, true), v_hours, coalesce(p_enabled, true), now()
  )
  on conflict (business_id) do update set
    login_id = excluded.login_id,
    password_hash = case when coalesce(p_password,'') <> ''
                         then crypt(p_password, gen_salt('bf'))
                         else public.business_login_credentials.password_hash end,
    require_approval = excluded.require_approval,
    session_hours = excluded.session_hours,
    is_enabled = excluded.is_enabled,
    updated_at = now();

  if coalesce(p_enabled, true) = false then
    update public.business_access_sessions
      set status = 'REVOKED', decided_at = now()
      where business_id = p_business_id and status in ('PENDING','ACTIVE');
  end if;
end $function$
;

revoke all on function public.set_business_login(p_business_id text, p_login_id text, p_password text, p_require_approval boolean, p_session_hours integer, p_enabled boolean) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_business_login(p_business_id text, p_login_id text, p_password text, p_require_approval boolean, p_session_hours integer, p_enabled boolean) TO authenticated, postgres, service_role;

-- Function: bump_provider_views
CREATE OR REPLACE FUNCTION public.bump_provider_views(p_provider_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.providers
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE id = p_provider_id;

  INSERT INTO public.provider_view_logs (provider_id, viewed_at)
  VALUES (p_provider_id, now());
END;
$function$
;

revoke all on function public.bump_provider_views(p_provider_id text) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_provider_views(p_provider_id text) TO authenticated, postgres, service_role;

-- Function: bump_business_metric
CREATE OR REPLACE FUNCTION public.bump_business_metric(p_business_id text, p_metric text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_metric = 'view' then
    update public.businesses
      set view_count = coalesce(view_count, 0) + 1
      where id = p_business_id;

    insert into public.business_view_logs(business_id)
      values (p_business_id);

  elsif p_metric = 'call' then
    update public.businesses
      set call_count = coalesce(call_count, 0) + 1
      where id = p_business_id;

  elsif p_metric = 'directions' then
    update public.businesses
      set directions_count = coalesce(directions_count, 0) + 1
      where id = p_business_id;
  end if;
end;
$function$
;

revoke all on function public.bump_business_metric(p_business_id text, p_metric text) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_business_metric(p_business_id text, p_metric text) TO authenticated, postgres, service_role;

-- Function: resolve_admin_email
CREATE OR REPLACE FUNCTION public.resolve_admin_email(p_login_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text := lower(trim(coalesce(p_login_id, '')));
  v_attempt public.admin_login_resolve_attempts%rowtype;
  v_email text;
  v_next_fail_count integer;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
begin
  if v_key = '' then return null; end if;
  select * into v_attempt from public.admin_login_resolve_attempts where login_id = v_key for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then return null; end if;
  select au.email into v_email from public.users u join auth.users au on au.id::text = u.id where u.admin_login_id = v_key and u.roles @> array['admin'] limit 1;
  if v_email is not null then
    delete from public.admin_login_resolve_attempts where login_id = v_key;
    return v_email;
  end if;
  v_next_fail_count := case when v_attempt.login_id is null or v_attempt.last_attempt_at <= now() - v_window or v_attempt.locked_until is not null then 1 else v_attempt.fail_count + 1 end;
  insert into public.admin_login_resolve_attempts (login_id, fail_count, last_attempt_at, locked_until)
  values (v_key, v_next_fail_count, now(), case when v_next_fail_count >= v_max_attempts then now() + v_window else null end)
  on conflict (login_id) do update set fail_count = excluded.fail_count, last_attempt_at = excluded.last_attempt_at, locked_until = excluded.locked_until;
  return null;
end
$function$
;

revoke all on function public.resolve_admin_email(p_login_id text) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_admin_email(p_login_id text) TO anon, authenticated, postgres, service_role, PUBLIC;

-- ══════════════════════════════════════════════════════════════════
-- 2. INDEXES (Idempotent: CREATE INDEX IF NOT EXISTS)
-- ══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS business_access_sessions_biz_status_idx
  ON public.business_access_sessions USING btree (business_id, status);

CREATE INDEX IF NOT EXISTS business_view_logs_biz_time
  ON public.business_view_logs USING btree (business_id, viewed_at);

-- ══════════════════════════════════════════════════════════════════
-- 3. TRIGGERS (Idempotent: Guarded by DO block checking pg_trigger)
-- ══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'agreements'
      AND t.tgname = 'trg_settlements'
  ) THEN
    CREATE TRIGGER trg_settlements
      AFTER UPDATE ON public.agreements
      FOR EACH ROW EXECUTE FUNCTION public.create_settlements_on_complete();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'businesses'
      AND t.tgname = 'sync_businesses_verified'
  ) THEN
    CREATE TRIGGER sync_businesses_verified
      BEFORE INSERT OR UPDATE ON public.businesses
      FOR EACH ROW EXECUTE FUNCTION public.sync_is_verified();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'businesses'
      AND t.tgname = 'trg_protect_business_owner'
  ) THEN
    CREATE TRIGGER trg_protect_business_owner
      BEFORE UPDATE ON public.businesses
      FOR EACH ROW EXECUTE FUNCTION public.protect_business_owner();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'community_posts'
      AND t.tgname = 'trg_sync_community_post_geom'
  ) THEN
    CREATE TRIGGER trg_sync_community_post_geom
      BEFORE INSERT OR UPDATE OF lat, lng ON public.community_posts
      FOR EACH ROW EXECUTE FUNCTION public.sync_community_post_geom();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'providers'
      AND t.tgname = 'providers_geom'
  ) THEN
    CREATE TRIGGER providers_geom
      BEFORE INSERT OR UPDATE ON public.providers
      FOR EACH ROW EXECUTE FUNCTION public.sync_geom();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'providers'
      AND t.tgname = 'sync_providers_verified'
  ) THEN
    CREATE TRIGGER sync_providers_verified
      BEFORE INSERT OR UPDATE ON public.providers
      FOR EACH ROW EXECUTE FUNCTION public.sync_is_verified();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'ratings'
      AND t.tgname = 'ratings_update_avg'
  ) THEN
    CREATE TRIGGER ratings_update_avg
      AFTER INSERT ON public.ratings
      FOR EACH ROW EXECUTE FUNCTION public.update_rating_avg();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'requests'
      AND t.tgname = 'requests_geom'
  ) THEN
    CREATE TRIGGER requests_geom
      BEFORE INSERT OR UPDATE ON public.requests
      FOR EACH ROW EXECUTE FUNCTION public.sync_geom();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'stories'
      AND t.tgname = 'trg_sync_story_geom'
  ) THEN
    CREATE TRIGGER trg_sync_story_geom
      BEFORE INSERT OR UPDATE ON public.stories
      FOR EACH ROW EXECUTE FUNCTION public.sync_story_geom();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'request_me_toos'
      AND t.tgname = 'me_too_count_trigger'
  ) THEN
    CREATE TRIGGER me_too_count_trigger
      AFTER INSERT OR DELETE ON public.request_me_toos
      FOR EACH ROW EXECUTE FUNCTION public.sync_me_too_count();
  END IF;
END $$;

-- 4. POLICIES (Idempotent: Guarded by DO blocks checking pg_policies)
-- ══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'upd_users'
  ) THEN
    CREATE POLICY upd_users ON public.users AS PERMISSIVE FOR UPDATE TO PUBLIC
      USING (((id = (( SELECT auth.uid() AS uid))::text) OR (id = (( SELECT auth.uid() AS uid))::text)))
      WITH CHECK ((id = (( SELECT auth.uid() AS uid))::text));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'society_members' AND policyname = 'mem_read'
  ) THEN
    CREATE POLICY mem_read ON public.society_members AS PERMISSIVE FOR SELECT TO authenticated
      USING ((((( SELECT auth.uid() AS uid))::text = user_id) OR is_society_member(society_id, (( SELECT auth.uid() AS uid))::text)));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'society_members' AND policyname = 'mem_update'
  ) THEN
    CREATE POLICY mem_update ON public.society_members AS PERMISSIVE FOR UPDATE TO authenticated
      USING ((((( SELECT auth.uid() AS uid))::text = ( SELECT societies.admin_user_id
       FROM societies
      WHERE (societies.id = society_members.society_id))) OR is_society_admin(society_id, (( SELECT auth.uid() AS uid))::text)))
      WITH CHECK (is_society_admin(society_id, (( SELECT auth.uid() AS uid))::text));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'queue_tokens' AND policyname = 'queue_tokens_select_all'
  ) THEN
    CREATE POLICY queue_tokens_select_all ON public.queue_tokens AS PERMISSIVE FOR SELECT TO PUBLIC
      USING ((true OR ((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((customer_user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
       FROM businesses b
      WHERE ((b.id = queue_tokens.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text)))) OR can_manage_business(business_id)))));
  END IF;
END $$;
