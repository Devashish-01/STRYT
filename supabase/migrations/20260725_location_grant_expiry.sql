-- Flow 11 (Location-Sharing Consent) — auto-expiring grants: an approval
-- lapses 24h after it's given unless the owner renews it. The always-visible
-- "who can see my location" list with one-tap revoke already exists
-- (LocationSharesManager in Settings.tsx) — this migration only adds expiry.
-- Run manually in Supabase SQL editor.

alter table if exists public.location_share_grants
  add column if not exists expires_at timestamptz;

-- Approving now sets a 24h expiry instead of an indefinite grant.
create or replace function public.respond_location_share(p_requester text, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then return; end if;

  update public.location_share_grants
    set status = case when p_approve then 'APPROVED' else 'DENIED' end,
        expires_at = case when p_approve then now() + interval '24 hours' else null end,
        updated_at = now()
  where owner_user_id = v_uid and requester_user_id = p_requester;

  if p_approve then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      p_requester, 'LOCATION_APPROVED',
      'Location shared',
      'Your location request was approved for 24 hours',
      '/u/' || v_uid
    );
  end if;
end $$;
grant execute on function public.respond_location_share(text, boolean) to authenticated;

-- Owner-only: extend an already-approved grant by another 24h without
-- requiring the requester to ask again.
create or replace function public.renew_location_share(p_requester text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then return; end if;
  update public.location_share_grants
    set expires_at = now() + interval '24 hours', updated_at = now()
  where owner_user_id = v_uid and requester_user_id = p_requester and status = 'APPROVED';
end $$;
grant execute on function public.renew_location_share(text) to authenticated;

-- An expired grant no longer reveals exact coordinates.
create or replace function public.get_shared_location(p_target text)
returns table (lat double precision, lng double precision)
language plpgsql security definer stable set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
begin
  return query
    select u.lat, u.lng
    from public.users u
    where u.id = p_target
      and (
        u.id = v_uid
        or exists (select 1 from public.users a where a.id = v_uid and 'admin' = any(a.roles))
        or coalesce(u.location_public, false)
        or exists (
          select 1 from public.location_share_grants g
          where g.owner_user_id = p_target
            and g.requester_user_id = v_uid
            and g.status = 'APPROVED'
            and (g.expires_at is null or g.expires_at > now())
        )
      );
end $$;
grant execute on function public.get_shared_location(text) to authenticated;
