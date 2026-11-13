-- Rollback for 20261018_money_scope.sql — the money functions go back to the `appointments` scope, the scope whitelists
-- drop `money`, and `money` is removed from every grant and saved login (including ones the owner ticked since).
-- Generated from the migration: same bodies with only the scope name / whitelist reverted. set_business_login keeps the
-- 'extensions' search_path fix (GAPS #52): rolling that back would break saving the shop login again.
-- 1. The four money functions ------------------------------------------------

create or replace function public.business_cash_outstanding(p_business_id text)
 returns table(appointment_id text, customer_name text, amount numeric, delivered_at timestamp with time zone, agent_name text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, auth.uid()::text, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  return query
    select a.id, a.customer_name, a.cash_outstanding_amount, d.delivered_at, public.person_first_name(d.agent_user_id)
      from public.appointments a
      join public.appointment_deliveries d on d.appointment_id = a.id and d.status = 'DELIVERED'
     where a.target_type = 'BUSINESS' and a.target_id = p_business_id
       and a.cash_outstanding_amount > 0 and a.payment_status is distinct from 'PAID'
     order by d.delivered_at desc;
end $function$;

create or replace function public.business_cash_to_settle(p_business_id text)
 returns table(agent_user_id text, agent_name text, orders integer, amount numeric, oldest timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, auth.uid()::text, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  return query
    select d.agent_user_id, coalesce(nullif(trim(u.name), ''), u.alias, 'Rider'),
           count(*)::int, sum(coalesce(a.cash_collected_amount, a.payment_amount, 0)), min(a.cash_collected_at)
      from public.appointments a
      join public.appointment_deliveries d on d.appointment_id = a.id and d.status = 'DELIVERED'
      left join public.users u on u.id = d.agent_user_id
     where a.target_type = 'BUSINESS' and a.target_id = p_business_id
       and a.cash_collected_at is not null and a.cash_settled_at is null
     group by d.agent_user_id, u.name, u.alias
     order by min(a.cash_collected_at);
end $function$;

create or replace function public.business_delivery_stats(p_business_id text, p_days integer default 30)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v_out jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, auth.uid()::text, 'appointments') then raise exception 'NOT_ALLOWED'; end if;

  select jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 365)),
    'delivered', count(*) filter (where d.status = 'DELIVERED'),
    'cancelled', count(*) filter (where d.status = 'CANCELLED'),
    'avg_minutes', (round(avg(extract(epoch from (d.delivered_at - coalesce(d.started_at, d.created_at))) / 60.0)
                      filter (where d.status = 'DELIVERED' and d.delivered_at is not null)))::int,
    'fees_collected', coalesce(sum(a.delivery_fee) filter (where d.status = 'DELIVERED'), 0),
    'per_agent', coalesce((
      select jsonb_agg(jsonb_build_object('agent_user_id', x.agent_user_id, 'name', x.name, 'delivered', x.n) order by x.n desc)
        from (
          select d2.agent_user_id, coalesce(nullif(trim(u.name), ''), u.alias, 'Rider') as name, count(*) as n
            from public.appointment_deliveries d2
            left join public.users u on u.id = d2.agent_user_id
           where d2.business_id = p_business_id and d2.status = 'DELIVERED' and d2.created_at >= v_since
           group by d2.agent_user_id, u.name, u.alias
        ) x
    ), '[]'::jsonb)
  ) into v_out
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  where d.business_id = p_business_id and d.created_at >= v_since;

  return v_out;
end $function$;

create or replace function public.settle_agent_cash(p_business_id text, p_agent_user_id text)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_total numeric;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, auth.uid()::text, 'appointments') then raise exception 'NOT_ALLOWED'; end if;

  with settled as (
    update public.appointments a
       set cash_settled_at = now()
      from public.appointment_deliveries d
     where d.appointment_id = a.id and d.status = 'DELIVERED' and d.agent_user_id = p_agent_user_id
       and a.target_type = 'BUSINESS' and a.target_id = p_business_id
       and a.cash_collected_at is not null and a.cash_settled_at is null
    returning coalesce(a.cash_collected_amount, a.payment_amount, 0) as amt
  )
  select coalesce(sum(amt), 0), count(*) into v_total, v_count from settled;

  if v_count > 0 then
    perform public.emit_event('delivery_cash_settled', jsonb_build_object('delivery_count', v_count),
      'business', p_business_id, public.analytics_actor_role('business', p_business_id));
  end if;

  return v_total;
end $function$;

-- 2. The four functions that write scopes stop accepting `money` ------------

create or replace function public.grant_team_access(p_business_id text, p_identifier text, p_scopes text[])
 returns table(session_id uuid, grantee_name text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_target text;
  v_name text;
  v_biz_name text;
  v_scopes text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                 where s in ('appointments','queue','catalog','leads','delivery')), '{}');
  v_session_id uuid;
  v_meta jsonb;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not exists (select 1 from public.businesses where id = p_business_id and owner_user_id = v_uid) then
    raise exception 'NOT_ALLOWED';
  end if;

  select name into v_biz_name from public.businesses where id = p_business_id;

  select id, coalesce(name, alias, 'User')
    into v_target, v_name
    from public.users
   where lower(phone) = lower(p_identifier)
      or lower(alias) = lower(p_identifier)
      or id = p_identifier
   limit 1;

  if v_target is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_target = v_uid then raise exception 'CANNOT_GRANT_TO_SELF'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;

  select id into v_session_id
    from public.business_access_sessions
   where business_id = p_business_id and grantee_user_id = v_target;

  if v_session_id is not null then
    update public.business_access_sessions
       set status = 'ACTIVE', decided_at = now(), expires_at = null,
           access_level = 'SCOPED', scopes = v_scopes
     where id = v_session_id;
  else
    insert into public.business_access_sessions
      (business_id, grantee_user_id, status, decided_at, expires_at, access_level, scopes)
    values (p_business_id, v_target, 'ACTIVE', now(), null, 'SCOPED', v_scopes)
    returning id into v_session_id;
  end if;

  v_meta := jsonb_build_object(
    'businessId', p_business_id,
    'businessName', coalesce(v_biz_name, 'a business'),
    'scopes', v_scopes,
    'statusPill', 'Team Access',
    'tone', 'brand',
    'actions', jsonb_build_array('SWITCH_BUSINESS')
  );

  begin
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      deep_link,
      metadata,
      entity_type,
      entity_id
    ) values (
      v_target,
      'BUSINESS_ACCESS',
      'Team access granted',
      'You can now help manage ' || coalesce(v_biz_name, 'a business') || ' from Switch account.',
      '/account/business-access',
      v_meta,
      'BUSINESS',
      p_business_id
    );
  exception when others then null; end;

  session_id := v_session_id;
  grantee_name := coalesce(v_name, 'User');
  return next;
end $function$;

create or replace function public.grant_team_member_access(p_business_id text, p_identifier text, p_scopes text[])
 returns table(session_id uuid, grantee_name text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid      text := auth.uid()::text;
  v_target   text;
  v_name     text;
  v_ident    text := trim(p_identifier);
  v_digits   text := regexp_replace(v_ident, '\D', '', 'g');
  v_biz_name text;
  v_session_id uuid;
  v_scopes   text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                   where s in ('appointments','queue','catalog','leads','delivery')), '{}');
begin
  if v_uid is null then raise exception 'Sign in to your STRYT account first.'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;

  select b.name into v_biz_name from public.businesses b
   where b.id = p_business_id and b.owner_user_id = v_uid;
  if v_biz_name is null then raise exception 'Only the business owner can add team members.'; end if;

  if v_ident ~ '@.*\.' then
    select id, name into v_target, v_name from public.users where lower(email) = lower(v_ident) limit 1;
  elsif regexp_replace(v_ident, '[\s\-+]', '', 'g') ~ '^\d{6,}$' then
    select id, name into v_target, v_name from public.users
     where regexp_replace(coalesce(phone, ''), '\D', '', 'g') like '%' || right(v_digits, 10)
     limit 1;
  else
    select id, name into v_target, v_name from public.users
     where lower(alias) = lower(ltrim(v_ident, '@'))
     limit 1;
  end if;

  if v_target is null then
    raise exception 'No STRYT account found for that mobile number, email, or username.';
  end if;
  if v_target = v_uid then
    raise exception 'You already own this business.';
  end if;

  update public.business_access_sessions
     set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
   where business_id = p_business_id and grantee_user_id = v_target
     and status in ('PENDING', 'ACTIVE')
     and expires_at is not null and expires_at <= now();

  select id into v_session_id
  from public.business_access_sessions
  where business_id = p_business_id and grantee_user_id = v_target
    and status in ('PENDING', 'ACTIVE')
  order by requested_at desc, id desc
  limit 1 for update;

  if v_session_id is not null then
    update public.business_access_sessions
       set status = 'ACTIVE', decided_at = now(), expires_at = null,
           access_level = 'SCOPED', scopes = v_scopes
     where id = v_session_id;
  else
    insert into public.business_access_sessions
      (business_id, grantee_user_id, status, decided_at, expires_at, access_level, scopes)
    values (p_business_id, v_target, 'ACTIVE', now(), null, 'SCOPED', v_scopes)
    returning id into v_session_id;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_target, 'BUSINESS_ACCESS', 'Team access granted',
            'You can now help manage ' || coalesce(v_biz_name, 'a business') || ' from Switch account.',
            '/account/business-access');
  exception when others then null; end;

  session_id := v_session_id;
  grantee_name := coalesce(v_name, 'User');
  return next;
end $function$;

create or replace function public.update_team_member_scopes(p_session_id uuid, p_scopes text[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_scopes text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                 where s in ('appointments','queue','catalog','leads','delivery')), '{}');
  v_grantee text;
  v_biz_name text;
  v_biz_id text;
  v_meta jsonb;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;

  update public.business_access_sessions s
     set access_level = 'SCOPED', scopes = v_scopes
    from public.businesses b
   where s.id = p_session_id and b.id = s.business_id and b.owner_user_id = v_uid
     and s.status = 'ACTIVE'
  returning s.grantee_user_id, b.name, b.id into v_grantee, v_biz_name, v_biz_id;
  if not found then raise exception 'NOT_ALLOWED'; end if;

  v_meta := jsonb_build_object(
    'businessId', v_biz_id,
    'businessName', coalesce(v_biz_name, 'a business'),
    'scopes', v_scopes,
    'statusPill', 'Access Updated',
    'tone', 'warning',
    'actions', jsonb_build_array('SWITCH_BUSINESS')
  );

  begin
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      deep_link,
      metadata,
      entity_type,
      entity_id
    ) values (
      v_grantee,
      'BUSINESS_ACCESS',
      'Access updated',
      'Your access to ' || coalesce(v_biz_name, 'a business') || ' was updated by the owner.',
      '/account/business-access',
      v_meta,
      'BUSINESS',
      v_biz_id
    );
  exception when others then null; end;
end $function$;

create or replace function public.set_business_login(p_business_id text, p_login_id text, p_password text, p_require_approval boolean, p_session_hours integer, p_enabled boolean, p_access_level text default 'SCOPED'::text, p_scopes text[] default '{appointments,queue,catalog,leads}'::text[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_scopes text[];
  v_level text;
begin
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = auth.uid()::text) then
    raise exception 'Only the business owner can set login access.';
  end if;

  v_level := case when p_access_level = 'FULL' then 'FULL' else 'SCOPED' end;
  v_scopes := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                         where s in ('appointments','queue','catalog','leads','delivery')), '{}');
  if v_level = 'SCOPED' and array_length(v_scopes, 1) is null then
    v_scopes := array['appointments','queue','catalog','leads'];
  end if;

  insert into public.business_login_credentials (
    business_id, login_id, password_hash, require_approval, session_hours, is_enabled,
    access_level, scopes, updated_at
  )
  values (
    p_business_id, trim(p_login_id), crypt(nullif(p_password, ''), gen_salt('bf')),
    p_require_approval, greatest(1, least(p_session_hours, 720)), p_enabled,
    v_level, v_scopes, now()
  )
  on conflict (business_id) do update set
    login_id = excluded.login_id,
    password_hash = case when coalesce(p_password, '') <> '' then crypt(p_password, gen_salt('bf')) else public.business_login_credentials.password_hash end,
    require_approval = excluded.require_approval,
    session_hours = excluded.session_hours,
    is_enabled = excluded.is_enabled,
    access_level = excluded.access_level,
    scopes = excluded.scopes,
    updated_at = now();
end $function$;

-- 3. Remove the scope from grants and saved logins ----------------------------

update public.business_access_sessions   set scopes = array_remove(scopes, 'money') where 'money' = any(scopes);
update public.business_login_credentials set scopes = array_remove(scopes, 'money') where 'money' = any(scopes);

notify pgrst, 'reload schema';
