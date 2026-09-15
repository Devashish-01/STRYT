-- Chat: every signed-in user's message send fails with
--   42501 permission denied for function _user_blocks_exists
--
-- Why: 20260943 added the INSERT policy `insert_own_messages`, whose CHECK calls
-- public._user_blocks_exists(participant_a, participant_b). 20260892 had revoked EXECUTE on that
-- function from public/anon/authenticated (it takes two free user ids, so it must not be client-callable).
-- A policy expression runs with the caller's privileges, so the INSERT raises instead of evaluating.
-- Found by the P07 E2E chat journey on staging (E2E-014); production has the same ACL and policy.
--
-- Second problem in the same place: the older permissive policy `ins_messages` (no block check) is OR'ed
-- with `insert_own_messages`, so once the function error is gone a blocked person could still message
-- through `ins_messages`.
--
-- Fix: one INSERT policy. The sender is the caller, the caller is a participant of the conversation, and
-- there is no block between the two participants, asked through public.is_blocked_between(other_user)
-- (SECURITY DEFINER, answers only "is there a block between ME and this person", EXECUTE granted to
-- authenticated). The legacy `ins_messages` is dropped.
--
-- Third problem, found by the forced-rollback test once the policy stopped raising: the AFTER INSERT trigger
-- function notify_on_chat_message (rewritten in 20260956) looks the recipient up in
-- public.conversation_participants, a table that has never existed (conversations store participant_a /
-- participant_b). Every insert would then fail with 42P01. The function below is the live definition with
-- only that lookup changed back to the conversation row (as 20260943 had it). Grants unchanged
-- (postgres, service_role).
--
-- Rollback: supabase/rollbacks/20260973_messages_insert_policy_block_check.rollback.sql

drop policy if exists ins_messages on public.messages;
drop policy if exists insert_own_messages on public.messages;

create policy insert_own_messages on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())::text
    and exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and (c.participant_a = (select auth.uid())::text or c.participant_b = (select auth.uid())::text)
        and not public.is_blocked_between(
          case when c.participant_a = (select auth.uid())::text then c.participant_b else c.participant_a end
        )
    )
  );

create or replace function public.notify_on_chat_message()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_recipient text;
  v_sender_name text;
  v_sender_avatar text;
begin
  select case when c.participant_a = NEW.sender_id then c.participant_b else c.participant_a end
    into v_recipient
  from public.conversations c
  where c.id = NEW.conversation_id;

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
$function$;

revoke all on function public.notify_on_chat_message() from public, anon, authenticated;
