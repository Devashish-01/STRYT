-- ============================================================
-- 20260915 — Per-recipient revoke for live location sharing
-- (flow-completeness audit, workflow 10): live_share_recipients was
-- populated once, at start_live_share time, from the full emergency-contact
-- list — with no way to drop a single recipient short of stopping the share
-- for everyone. New RPC does for one recipient what stop_live_share already
-- does for all of them: remove their row, flip their chat card to ENDED.
-- ============================================================

create or replace function public.revoke_live_share_recipient(p_recipient_user_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid   text := auth.uid()::text;
  v_share text;
  v_message_id text;
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
end $$;

revoke execute on function public.revoke_live_share_recipient(text) from public, anon;
grant execute on function public.revoke_live_share_recipient(text) to authenticated;

-- Read path for "who's currently receiving my share" — get_live_share answers
-- "can THIS viewer see me", not "who are all my current viewers", which the
-- new UI needs to list and offer a revoke button per person.
create or replace function public.my_live_share_recipients()
returns table (recipient_user_id text, recipient_name text, recipient_avatar text)
language sql security definer set search_path = public as $$
  select r.recipient_user_id, u.name, u.avatar
  from public.live_share_recipients r
  join public.live_shares s on s.id = r.share_id
  join public.users u on u.id = r.recipient_user_id
  where s.sharer_user_id = auth.uid()::text and s.status = 'ACTIVE';
$$;

revoke execute on function public.my_live_share_recipients() from public, anon;
grant execute on function public.my_live_share_recipients() to authenticated;
