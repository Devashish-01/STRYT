-- ============================================================
-- 20260911 — Fix team/business-access notification gaps (flow-completeness
-- audit, workflows 11, 12, 17):
--
--   1. respond_location_share — the approve branch already notified the
--      requester; deny did nothing.
--   2. New revoke_location_share RPC — locationService.revoke
--      (src/services/engagement/locationService.ts:41-51) was a bare client
--      table update with no RPC to notify through. The requester whose
--      access just ended never found out.
--   3. update_team_member_scopes — grant and approve/deny both notify the
--      grantee; editing scopes (this function) didn't.
--   4. revoke_business_session — same gap on the revoke path. Only notifies
--      when the OWNER revokes someone ELSE — a grantee revoking their own
--      access (leaving the team) doesn't need telling.
-- ============================================================

-- ── 1) respond_location_share — add the missing deny notification ──
create or replace function public.respond_location_share(p_requester text, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_owner_name text;
  v_owner_avatar text;
begin
  if v_uid is null then return; end if;

  update public.location_share_grants
    set status = case when p_approve then 'APPROVED' else 'DENIED' end,
        updated_at = now()
  where owner_user_id = v_uid and requester_user_id = p_requester;

  select name, avatar into v_owner_name, v_owner_avatar from public.users where id = v_uid;

  if p_approve then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      p_requester, 'LOCATION_APPROVED',
      'Location shared',
      'Your location request was approved',
      '/u/' || v_uid,
      jsonb_build_object('avatarUrl', v_owner_avatar, 'actorName', v_owner_name, 'statusPill', 'Approved', 'tone', 'success')
    );
  else
    begin
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        p_requester, 'LOCATION_DENIED',
        'Location request declined',
        coalesce(v_owner_name, 'They') || ' didn''t approve your location request',
        '/u/' || v_uid,
        jsonb_build_object('avatarUrl', v_owner_avatar, 'actorName', v_owner_name, 'statusPill', 'Declined', 'tone', 'neutral')
      );
    exception when others then null;
    end;
  end if;
end $$;

-- ── 2) New RPC so revoking a share can notify — locationService.revoke
--      switches from a bare table update to this ──
create or replace function public.revoke_location_share(p_requester text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_owner_name text;
  v_owner_avatar text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  update public.location_share_grants
    set status = 'REVOKED', updated_at = now()
  where owner_user_id = v_uid and requester_user_id = p_requester;

  select name, avatar into v_owner_name, v_owner_avatar from public.users where id = v_uid;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      p_requester, 'LOCATION_REVOKED',
      'Location access ended',
      coalesce(v_owner_name, 'Someone') || ' stopped sharing their exact location with you',
      '/u/' || v_uid,
      jsonb_build_object('avatarUrl', v_owner_avatar, 'actorName', v_owner_name, 'statusPill', 'Ended', 'tone', 'neutral')
    );
  exception when others then null;
  end;
end $$;

revoke execute on function public.revoke_location_share(text) from public, anon;
grant execute on function public.revoke_location_share(text) to authenticated;

-- ── 3) update_team_member_scopes — notify the grantee of the change ──
create or replace function public.update_team_member_scopes(p_session_id uuid, p_scopes text[])
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid text := auth.uid()::text;
  v_scopes text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                 where s in ('appointments','queue','catalog','leads','delivery')), '{}');
  v_grantee text;
  v_biz_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;

  update public.business_access_sessions s
     set access_level = 'SCOPED', scopes = v_scopes
    from public.businesses b
   where s.id = p_session_id and b.id = s.business_id and b.owner_user_id = v_uid
     and s.status = 'ACTIVE'
  returning s.grantee_user_id, b.name into v_grantee, v_biz_name;
  if not found then raise exception 'NOT_ALLOWED'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_grantee, 'QUEUE_UPDATE', 'Access updated',
            'Your access to ' || coalesce(v_biz_name, 'a business') || ' was changed by the owner.',
            '/account/business-access');
  exception when others then null; end;
end $function$;

-- ── 4) revoke_business_session — notify the grantee, only when the OWNER did it ──
create or replace function public.revoke_business_session(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_session public.business_access_sessions%rowtype;
  v_biz_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_session
  from public.business_access_sessions
  where id = p_session_id
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.grantee_user_id is distinct from v_uid
     and not exists (
       select 1 from public.businesses b
       where b.id = v_session.business_id and b.owner_user_id = v_uid
     ) then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.business_access_sessions
  set status = 'REVOKED', decided_at = now(),
      expires_at = case when status = 'ACTIVE' then now() else expires_at end
  where id = p_session_id and status in ('PENDING', 'ACTIVE');

  -- Only when the OWNER revoked someone ELSE's access — a grantee revoking
  -- their own (leaving the team) doesn't need to be told they did the thing
  -- they just did.
  if v_uid is distinct from v_session.grantee_user_id then
    select name into v_biz_name from public.businesses where id = v_session.business_id;
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_session.grantee_user_id, 'QUEUE_UPDATE', 'Access removed',
              'Your access to ' || coalesce(v_biz_name, 'a business') || ' was removed.',
              '/account/business-access');
    exception when others then null; end;
  end if;
end
$$;
