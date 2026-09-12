-- ============================================================
-- Rollback for 20260956_identity_system_notifications_v2.sql
-- Restores all replaced objects to their exact production catalog definitions
-- from supabase/snapshots/2026-09-13_after_20260958.sql.
-- ============================================================

-- ── Drop brand new function grant_team_access ─────────────────────────
drop function if exists public.grant_team_access(text, text, text[]);

-- ── Restore update_team_member_scopes ─────────────────────────
CREATE OR REPLACE FUNCTION public.update_team_member_scopes(p_session_id uuid, p_scopes text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    values (v_grantee, 'BUSINESS_ACCESS', 'Access updated',
            'Your access to ' || coalesce(v_biz_name, 'a business') || ' was changed by the owner.',
            '/account/business-access');
  exception when others then null; end;
end $function$
;
GRANT EXECUTE ON FUNCTION public.update_team_member_scopes(p_session_id uuid, p_scopes text[]) TO authenticated, postgres, service_role;

-- ── Restore notify_verification_decision_business ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_verification_decision_business()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_verified = true and old.is_verified is distinct from true then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (new.owner_user_id, 'VERIFICATION_DECIDED', 'You are verified!', new.name || ' is now a verified business.', '/business/' || new.id || '/manage/verify',
            jsonb_build_object('avatarUrl', new.cover_image, 'actorName', new.name, 'statusPill', 'Verified', 'tone', 'success'));
  elsif new.verification_status = 'REJECTED' and old.verification_status is distinct from 'REJECTED' then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.owner_user_id, 'VERIFICATION_DECIDED', 'Verification needs another look',
      case when new.verification_reason is not null and new.verification_reason <> ''
        then 'Reason: ' || new.verification_reason || ' — resubmit from Settings.'
        else 'Your documents for ' || new.name || ' were not approved — resubmit from Settings.'
      end,
      '/business/' || new.id || '/manage/verify',
      jsonb_build_object('avatarUrl', new.cover_image, 'actorName', new.name, 'reason', new.verification_reason, 'statusPill', 'Needs changes', 'tone', 'danger')
    );
  end if;
  return new;
end $function$
;
GRANT EXECUTE ON FUNCTION public.notify_verification_decision_business() TO postgres, service_role;

-- ── Restore notify_verification_decision_provider ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_verification_decision_provider()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_verified = true and old.is_verified is distinct from true then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (new.user_id, 'VERIFICATION_DECIDED', 'You are verified!', new.display_name || ' is now a verified provider.', '/provider/' || new.id || '/manage/verify',
            jsonb_build_object('avatarUrl', new.avatar, 'actorName', new.display_name, 'statusPill', 'Verified', 'tone', 'success'));
  elsif new.verification_status = 'REJECTED' and old.verification_status is distinct from 'REJECTED' then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.user_id, 'VERIFICATION_DECIDED', 'Verification needs another look',
      case when new.verification_reason is not null and new.verification_reason <> ''
        then 'Reason: ' || new.verification_reason || ' — resubmit from Settings.'
        else 'Your documents for ' || new.display_name || ' were not approved — resubmit from Settings.'
      end,
      '/provider/' || new.id || '/manage/verify',
      jsonb_build_object('avatarUrl', new.avatar, 'actorName', new.display_name, 'reason', new.verification_reason, 'statusPill', 'Needs changes', 'tone', 'danger')
    );
  end if;
  return new;
end $function$
;
GRANT EXECUTE ON FUNCTION public.notify_verification_decision_provider() TO postgres, service_role;

-- ── Restore notify_on_qna_asked ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_qna_asked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner text;
begin
  select owner_user_id into v_owner from public.businesses where id = new.business_id;
  if v_owner is not null and v_owner <> new.asker_user_id then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_owner, 'QNA', 'New question',
        '"' || left(new.question, 120) || '"',
        '/business/' || new.business_id || '/manage/community');
    exception when others then null;
    end;
  end if;
  return new;
end $function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_qna_asked() TO anon, authenticated, postgres, service_role, PUBLIC;

-- ── Restore notify_on_qna_answered ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_qna_answered()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_biz_name text;
begin
  if new.answer is not null and old.answer is null then
    select name into v_biz_name from public.businesses where id = new.business_id;
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.asker_user_id, 'QNA', 'Your question was answered',
        coalesce(v_biz_name, 'The business') || ' replied: "' || left(new.answer, 120) || '"',
        '/business/' || new.business_id);
    exception when others then null;
    end;
  end if;
  return new;
end $function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_qna_answered() TO anon, authenticated, postgres, service_role, PUBLIC;

-- ── Restore notify_on_chat_message ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_conv public.conversations%rowtype;
  v_recipient text;
  v_sender_name text;
begin
  select * into v_conv from public.conversations where id = NEW.conversation_id;
  if not found then return NEW; end if;

  v_recipient := case when v_conv.participant_a = NEW.sender_id then v_conv.participant_b else v_conv.participant_a end;
  if v_recipient is null then return NEW; end if;

  -- Do not notify if blocked between either party
  if public._user_blocks_exists(NEW.sender_id, v_recipient) then return NEW; end if;

  select coalesce(name, alias, 'Someone') into v_sender_name from public.users where id = NEW.sender_id;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      v_recipient,
      'CHAT',
      coalesce(v_sender_name, 'New message'),
      case when NEW.image_url is not null and (NEW.body is null or NEW.body = '') then '📷 Sent a photo' else substring(NEW.body from 1 for 100) end,
      '/chat/' || NEW.conversation_id
    );
  exception when others then null; end;

  return NEW;
end;
$function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_chat_message() TO anon, authenticated, postgres, service_role, PUBLIC;

notify pgrst, 'reload schema';
