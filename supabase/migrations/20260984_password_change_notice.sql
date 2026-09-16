-- 20260984_password_change_notice
--
-- SECURITY_SETTINGS SEC-3: setting, changing or removing a console password left no trace the owner would ever see.
-- Removing one also drops the backup reset question with it, so someone who got hold of an unlocked phone could take
-- the lock off the shop console and nothing would say so. Both now write the owner a security notice; removal also
-- says the backup question went with it. Everything else about these functions is unchanged.
--
-- Rollback: supabase/rollbacks/20260984_password_change_notice.rollback.sql

create or replace function public.set_entity_password(p_kind text, p_new_password text, p_current_password text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_existing text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business','provider') then raise exception 'Invalid kind'; end if;
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_existing from public.users where id = v_uid;

  -- Reuses _verify_entity_password (not a second unguarded comparison) so
  -- changing a password shares the exact same rate limit as the switch gate
  -- itself — otherwise a hijacked session could brute force it here instead.
  if v_existing is not null then
    if not public._verify_entity_password(p_kind, v_uid, coalesce(p_current_password, '')) then
      raise exception 'Current password is incorrect';
    end if;
  end if;

  if p_kind = 'business' then
    update public.users set business_password_hash = crypt(p_new_password, gen_salt('bf')) where id = v_uid;
  else
    update public.users set provider_password_hash = crypt(p_new_password, gen_salt('bf')) where id = v_uid;
  end if;
  delete from public.entity_password_attempts where owner_user_id = v_uid and kind = p_kind;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (v_uid, 'SYSTEM',
          case when v_existing is null then 'Console password set' else 'Console password changed' end,
          'The ' || p_kind || ' console password on your account was ' ||
          case when v_existing is null then 'set' else 'changed' end ||
          ' just now. If that wasn''t you, change it again straight away.',
          '/settings/security', jsonb_build_object('statusPill', 'Security', 'tone', 'neutral'));
end $function$;

create or replace function public.clear_entity_password(p_kind text, p_current_password text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_existing text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business', 'provider') then raise exception 'Invalid kind'; end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_existing
    from public.users
   where id = v_uid;

  if v_existing is null then return; end if;

  if not public._verify_entity_password(p_kind, v_uid, coalesce(p_current_password, '')) then
    raise exception 'Current password is incorrect';
  end if;

  if p_kind = 'business' then
    update public.users
       set business_password_hash = null,
           business_recovery_question_id = null,
           business_recovery_question_text = null,
           business_recovery_answer_hash = null
     where id = v_uid;
  else
    update public.users
       set provider_password_hash = null,
           provider_recovery_question_id = null,
           provider_recovery_question_text = null,
           provider_recovery_answer_hash = null
     where id = v_uid;
  end if;

  delete from public.entity_password_attempts where owner_user_id = v_uid and kind = p_kind;
  delete from public.entity_recovery_attempts where owner_user_id = v_uid and kind = p_kind;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (v_uid, 'SYSTEM', 'Console password removed',
          'The ' || p_kind || ' console password on your account was removed just now, along with its backup reset ' ||
          'question. Anyone signed in as you can now open that console. If that wasn''t you, set a new password.',
          '/settings/security', jsonb_build_object('statusPill', 'Security', 'tone', 'danger'));
end;
$function$;
