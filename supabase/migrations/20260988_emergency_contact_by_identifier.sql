-- 20260988_emergency_contact_by_identifier
--
-- EMERGENCY_CONTACTS ECON-1: emergency contacts could only be picked from people the user had already chatted with in
-- the app, so the people you would actually want — a spouse, a parent, a neighbour you've never messaged — could not
-- be added at all. This adds the same "you must already know their identifier" route team access uses
-- (grant_business_access): resolve a user server-side by mobile number, email or username and add them. There is still
-- no directory to browse, and the resolution happens inside a SECURITY DEFINER function, so nothing about who exists
-- leaks to the client beyond the single answer.
--
-- EMERGENCY_CONTACTS ECON-5: nothing capped the list, and start_live_share inserts a row per contact inside one
-- transaction. Ten is more than anyone needs in an emergency and keeps that insert small.
--
-- Rollback: supabase/rollbacks/20260988_emergency_contact_by_identifier.rollback.sql

create or replace function public.emergency_contact_add_by_identifier(p_identifier text)
 returns table (contact_user_id text, contact_name text, contact_avatar text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_identifier text := trim(coalesce(p_identifier, ''));
  v_digits text := regexp_replace(v_identifier, '\D', '', 'g');
  v_target text;
  v_name text;
  v_avatar text;
  v_count integer;
  v_max constant integer := 10;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if v_identifier = '' then raise exception 'IDENTIFIER_REQUIRED'; end if;

  -- Same three shapes grant_business_access accepts: an email, a phone number, or a username.
  if v_identifier ~ '@.*\.' then
    select u.id, coalesce(nullif(trim(u.alias), ''), u.name, 'User'), coalesce(u.avatar, '')
      into v_target, v_name, v_avatar
      from public.users u
     where lower(u.email) = lower(v_identifier)
     order by u.id limit 1;
  elsif regexp_replace(v_identifier, '[\s\-+]', '', 'g') ~ '^\d{6,}$' then
    select u.id, coalesce(nullif(trim(u.alias), ''), u.name, 'User'), coalesce(u.avatar, '')
      into v_target, v_name, v_avatar
      from public.users u
     where right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) = right(v_digits, 10)
     order by u.id limit 1;
  else
    select u.id, coalesce(nullif(trim(u.alias), ''), u.name, 'User'), coalesce(u.avatar, '')
      into v_target, v_name, v_avatar
      from public.users u
     where lower(u.alias) = lower(ltrim(v_identifier, '@'))
     order by u.id limit 1;
  end if;

  if v_target is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_target = v_uid then raise exception 'CANNOT_ADD_YOURSELF'; end if;

  select count(*) into v_count from public.emergency_contacts where owner_user_id = v_uid;
  if v_count >= v_max then raise exception 'TOO_MANY_CONTACTS'; end if;

  insert into public.emergency_contacts (owner_user_id, contact_user_id)
  values (v_uid, v_target)
  on conflict do nothing;

  return query select v_target, v_name, v_avatar;
end $function$;

revoke all on function public.emergency_contact_add_by_identifier(text) from public, anon;
grant execute on function public.emergency_contact_add_by_identifier(text) to authenticated;

-- ECON-5: the same cap, enforced wherever a contact is added (the older in-app-chat path writes the row directly).
create or replace function public.enforce_emergency_contact_cap()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  select count(*) into v_count from public.emergency_contacts where owner_user_id = new.owner_user_id;
  if v_count >= 10 then
    raise exception 'TOO_MANY_CONTACTS';
  end if;
  return new;
end $function$;

drop trigger if exists trg_emergency_contact_cap on public.emergency_contacts;
create trigger trg_emergency_contact_cap before insert on public.emergency_contacts
  for each row execute function public.enforce_emergency_contact_cap();
