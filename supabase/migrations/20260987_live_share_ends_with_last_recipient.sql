-- 20260987_live_share_ends_with_last_recipient
--
-- LOCATION_SHARING LOC-5: revoking recipients one at a time removed each of them but left the live_shares row ACTIVE,
-- so the phone kept taking a GPS fix every 12 seconds and broadcasting it to nobody — battery and location data spent
-- on an audience of zero, with the sharer's banner still saying they were sharing. Revoking the last recipient now
-- ends the share itself.
--
-- Rollback: supabase/rollbacks/20260987_live_share_ends_with_last_recipient.rollback.sql

create or replace function public.revoke_live_share_recipient(p_recipient_user_id text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid   text := auth.uid()::text;
  v_share text;
  v_message_id text;
  v_left integer;
begin
  if v_uid is null then return; end if;

  select id into v_share from public.live_shares
    where sharer_user_id = v_uid and status = 'ACTIVE';
  if v_share is null then return; end if;

  select message_id into v_message_id from public.live_share_recipients
    where share_id = v_share and recipient_user_id = p_recipient_user_id;
  if v_message_id is null then return; end if;

  delete from public.live_share_recipients
    where share_id = v_share and recipient_user_id = p_recipient_user_id;

  update public.messages
    set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('status', 'ENDED')
    where id = v_message_id;

  -- Nobody left to share with: end the share so the device stops broadcasting (LOC-5).
  select count(*) into v_left from public.live_share_recipients where share_id = v_share;
  if v_left = 0 then
    update public.live_shares
       set status = 'ENDED',
           ended_at = now()
     where id = v_share and status = 'ACTIVE';
  end if;
end $function$;
