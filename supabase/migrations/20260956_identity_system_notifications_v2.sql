-- ============================================================
-- 20260956_identity_system_notifications_v2.sql
-- Group 10: Identity, Role Management & System Administration
-- Complete entity scoping and rich metadata for:
-- - BUSINESS_ACCESS
-- - VERIFICATION_DECIDED
-- - QNA
-- - CHAT
-- - SYSTEM
-- ============================================================

-- 1. Enrich team member access grants, updates, and revocations
create or replace function public.grant_team_access(
  p_business_id text,
  p_identifier text,
  p_scopes text[]
)
returns table (session_id uuid, grantee_name text)
language plpgsql security definer
set search_path = public
as $fn$
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
end $fn$;

revoke execute on function public.grant_team_access(text, text, text[]) from public, anon;
grant execute on function public.grant_team_access(text, text, text[]) to authenticated;

-- 2. Enrich team member scope update notifications
create or replace function public.update_team_member_scopes(p_session_id uuid, p_scopes text[])
returns void
language plpgsql security definer
set search_path = public
as $fn$
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
end $fn$;

revoke execute on function public.update_team_member_scopes(uuid, text[]) from public, anon;
grant execute on function public.update_team_member_scopes(uuid, text[]) to authenticated;

-- 3. Enrich verification decision triggers with scoping & actionable CTAs
create or replace function public.notify_verification_decision_business()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.is_verified = true and old.is_verified is distinct from true then
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
      new.owner_user_id,
      'VERIFICATION_DECIDED',
      'You are verified!',
      new.name || ' is now a verified business.',
      '/business/' || new.id || '/manage/verify',
      jsonb_build_object(
        'businessId', new.id,
        'businessName', new.name,
        'avatarUrl', new.cover_image,
        'actorName', new.name,
        'statusPill', 'Verified ✓',
        'tone', 'success',
        'actions', jsonb_build_array('VIEW_STORE')
      ),
      'BUSINESS',
      new.id
    );
  elsif new.verification_status = 'REJECTED' and old.verification_status is distinct from 'REJECTED' then
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
      new.owner_user_id,
      'VERIFICATION_DECIDED',
      'Verification needs another look',
      case when new.verification_reason is not null and new.verification_reason <> ''
        then 'Reason: ' || new.verification_reason || ' — resubmit from Settings.'
        else 'Your documents for ' || new.name || ' were not approved — resubmit from Settings.'
      end,
      '/business/' || new.id || '/manage/verify',
      jsonb_build_object(
        'businessId', new.id,
        'businessName', new.name,
        'avatarUrl', new.cover_image,
        'actorName', new.name,
        'reason', new.verification_reason,
        'statusPill', 'Needs changes',
        'tone', 'danger',
        'actions', jsonb_build_array('RESUBMIT_VERIFY')
      ),
      'BUSINESS',
      new.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_verification_decision_provider()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.is_verified = true and old.is_verified is distinct from true then
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
      new.user_id,
      'VERIFICATION_DECIDED',
      'You are verified!',
      new.display_name || ' is now a verified provider.',
      '/provider/' || new.id || '/manage/verify',
      jsonb_build_object(
        'providerId', new.id,
        'providerName', new.display_name,
        'avatarUrl', new.avatar,
        'actorName', new.display_name,
        'statusPill', 'Verified ✓',
        'tone', 'success',
        'actions', jsonb_build_array('VIEW_STORE')
      ),
      'PROVIDER',
      new.id
    );
  elsif new.verification_status = 'REJECTED' and old.verification_status is distinct from 'REJECTED' then
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
      new.user_id,
      'VERIFICATION_DECIDED',
      'Verification needs another look',
      case when new.verification_reason is not null and new.verification_reason <> ''
        then 'Reason: ' || new.verification_reason || ' — resubmit from Settings.'
        else 'Your documents for ' || new.display_name || ' were not approved — resubmit from Settings.'
      end,
      '/provider/' || new.id || '/manage/verify',
      jsonb_build_object(
        'providerId', new.id,
        'providerName', new.display_name,
        'avatarUrl', new.avatar,
        'actorName', new.display_name,
        'reason', new.verification_reason,
        'statusPill', 'Needs changes',
        'tone', 'danger',
        'actions', jsonb_build_array('RESUBMIT_VERIFY')
      ),
      'PROVIDER',
      new.id
    );
  end if;
  return new;
end;
$$;

-- 4. Enrich Q&A notifications with business scoping and actions
create or replace function public.notify_on_qna_asked() returns trigger as $$
declare
  v_owner text;
  v_asker_name text;
begin
  select owner_user_id into v_owner from public.businesses where id = new.business_id;
  select coalesce(name, alias, 'A customer') into v_asker_name from public.users where id = new.asker_user_id;

  if v_owner is not null and v_owner <> new.asker_user_id then
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
        v_owner,
        'QNA',
        'New question from ' || coalesce(v_asker_name, 'a customer'),
        '"' || left(new.question, 120) || '"',
        '/business/' || new.business_id || '/manage/community',
        jsonb_build_object(
          'businessId', new.business_id,
          'question', new.question,
          'senderName', v_asker_name,
          'statusPill', 'New Question',
          'tone', 'brand',
          'actions', jsonb_build_array('ANSWER_QNA', 'VIEW_STORE')
        ),
        'BUSINESS',
        new.business_id
      );
    exception when others then null;
    end;
  end if;
  return new;
end $$ language plpgsql security definer set search_path = public;

create or replace function public.notify_on_qna_answered() returns trigger as $$
declare
  v_biz_name text;
begin
  if new.answer is not null and old.answer is null then
    select name into v_biz_name from public.businesses where id = new.business_id;
    begin
      insert into public.notifications (
        user_id,
        type,
        title,
        body,
        deep_link,
        metadata
      ) values (
        new.asker_user_id,
        'QNA',
        'Your question was answered',
        coalesce(v_biz_name, 'The business') || ' replied: "' || left(new.answer, 120) || '"',
        '/business/' || new.business_id,
        jsonb_build_object(
          'businessId', new.business_id,
          'businessName', v_biz_name,
          'question', new.question,
          'answer', new.answer,
          'statusPill', 'Answered ✓',
          'tone', 'success',
          'actions', jsonb_build_array('VIEW_QNA', 'VIEW_STORE')
        )
      );
    exception when others then null;
    end;
  end if;
  return new;
end $$ language plpgsql security definer set search_path = public;

-- 5. Enrich direct CHAT notifications with sender avatar and quick actions
create or replace function public.notify_on_chat_message()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_recipient text;
  v_sender_name text;
  v_sender_avatar text;
begin
  select user_id into v_recipient
  from public.conversation_participants
  where conversation_id = NEW.conversation_id
    and user_id <> NEW.sender_id
  limit 1;

  if v_recipient is null then return NEW; end if;

  if public._user_blocks_exists(NEW.sender_id, v_recipient) then return NEW; end if;

  select coalesce(name, alias, 'Someone'), avatar
    into v_sender_name, v_sender_avatar
    from public.users
   where id = NEW.sender_id;

  begin
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      deep_link,
      metadata
    ) values (
      v_recipient,
      'CHAT',
      coalesce(v_sender_name, 'New message'),
      case when NEW.image_url is not null and (NEW.body is null or NEW.body = '') then '📷 Sent a photo' else substring(NEW.body from 1 for 100) end,
      '/chat/' || NEW.conversation_id,
      jsonb_build_object(
        'conversationId', NEW.conversation_id,
        'senderId', NEW.sender_id,
        'senderName', v_sender_name,
        'avatarUrl', v_sender_avatar,
        'statusPill', 'New Message',
        'tone', 'brand',
        'actions', jsonb_build_array('REPLY_CHAT', 'OPEN_CHAT')
      )
    );
  exception when others then null; end;

  return NEW;
end;
$$;
