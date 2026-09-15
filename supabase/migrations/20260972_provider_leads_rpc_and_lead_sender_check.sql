-- Migration 20260972 — provider leads without raw users.phone; leads can't be sent in someone else's name.
--
-- WHY
--   1. 20260968 had to leave users.phone readable by every signed-in user, because the
--      provider leads inbox (providerService.leads) embeds users.phone and drops it in the
--      browser when the sender hasn't chosen to share it — the raw number still reaches
--      the client. This function returns the phone only when the sender allows it, so
--      the app can stop reading users.phone and the column can be locked
--      (supabase/pending/users_phone_column_lockdown.sql, after the app ships).
--   2. Policy ins_leads only checked `auth.role() = 'authenticated'`, so any signed-in
--      user could create a lead whose from_user_id is another user. The app always sends
--      its own id (businessService/providerService: from_user_id = currentUserId()).
--
-- WHAT
--   - provider_leads(p_provider_id): same rows and ownership rule as the provider branch
--     of read_leads (the provider's own user), newest first, 100 max; sender phone only
--     if users.show_phone_publicly is true. Additive — nothing reads it until the app does.
--   - ins_leads: WITH CHECK now requires from_user_id = auth.uid().

create or replace function public.provider_leads(p_provider_id text)
returns table (
  id text,
  provider_id text,
  from_user_id text,
  kind text,
  note text,
  handled boolean,
  created_at timestamp with time zone,
  from_name text,
  from_alias text,
  from_avatar text,
  from_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.provider_id, l.from_user_id, l.kind, l.note, l.handled, l.created_at,
         u.name, u.alias, u.avatar,
         case when coalesce(u.show_phone_publicly, false) then u.phone end
    from public.leads l
    left join public.users u on u.id = l.from_user_id
   where l.provider_id = p_provider_id
     and exists (
       select 1 from public.providers p
        where p.id = p_provider_id and p.user_id = (select auth.uid())::text
     )
   order by l.created_at desc
   limit 100;
$$;

revoke all on function public.provider_leads(text) from public, anon, authenticated;
grant execute on function public.provider_leads(text) to authenticated;

alter policy ins_leads on public.leads
  with check (
    (( select auth.uid() as uid) is not null)
    and (from_user_id = (( select auth.uid() as uid))::text)
  );

notify pgrst, 'reload schema';
