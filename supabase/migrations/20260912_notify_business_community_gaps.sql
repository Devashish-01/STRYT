-- ============================================================
-- 20260912 — Fix business-community notification gaps (flow-completeness
-- audit, workflows 17, 18):
--
--   1/2. business_qna — a plain client-side insert (askQuestion) and update
--        (answerQuestion), src/services/marketplace/businessService.ts:
--        874-890, never an RPC, so neither direction ever notified anyone.
--        New triggers, same convention as ratings (20260909) and queue
--        payment status (20260910).
--   3. reply_to_rating — never notified the reviewer their review got a reply.
--   4. delete_business — revokes every team/delegate grant on the business
--      but never told any of them why their access just vanished.
-- ============================================================

-- ── 1) A customer asks — notify the business owner ──
create or replace function public.notify_on_qna_asked() returns trigger as $$
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
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_qna_asked on public.business_qna;
create trigger trg_notify_qna_asked
  after insert on public.business_qna
  for each row execute function public.notify_on_qna_asked();

-- ── 2) The business answers — notify the asker ──
create or replace function public.notify_on_qna_answered() returns trigger as $$
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
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_qna_answered on public.business_qna;
create trigger trg_notify_qna_answered
  after update on public.business_qna
  for each row execute function public.notify_on_qna_answered();

-- ── 3) reply_to_rating — notify the reviewer ──
CREATE OR REPLACE FUNCTION public.reply_to_rating(p_rating_id text, p_reply text)
 RETURNS ratings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_ratee_type text;
  v_ratee_id text;
  v_owner text;
  v_ratee_name text;
  v_rating public.ratings%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if length(trim(coalesce(p_reply, ''))) < 2 then raise exception 'REPLY_TOO_SHORT'; end if;

  select ratee_type, ratee_id into v_ratee_type, v_ratee_id
  from public.ratings where id = p_rating_id;
  if not found then raise exception 'RATING_NOT_FOUND'; end if;

  if v_ratee_type = 'BUSINESS' then
    select owner_user_id, name into v_owner, v_ratee_name from public.businesses where id = v_ratee_id;
  elsif v_ratee_type = 'PROVIDER' then
    select user_id, display_name into v_owner, v_ratee_name from public.providers where id = v_ratee_id;
  else
    raise exception 'NOT_REPLYABLE';
  end if;

  if v_owner is null or v_owner != v_uid then raise exception 'FORBIDDEN'; end if;

  update public.ratings
  set owner_reply = left(trim(p_reply), 2000), owner_reply_at = now()
  where id = p_rating_id
  returning * into v_rating;

  if v_rating.rater_user_id is not null then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_rating.rater_user_id, 'RATING_REPLY', 'You got a reply',
        coalesce(v_ratee_name, 'They') || ' replied to your review: "' || left(trim(p_reply), 120) || '"',
        case when v_ratee_type = 'BUSINESS' then '/business/' || v_ratee_id else '/provider/' || v_ratee_id end);
    exception when others then null;
    end;
  end if;

  return v_rating;
end
$function$;

-- ── 4) delete_business — notify every team member whose access this revokes ──
create or replace function public.delete_business(p_business_id text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid     text := auth.uid()::text;
  v_owner   text;
  v_status  text;
  v_live    int;
  v_biz_name text;
  v_grantee text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select owner_user_id, status::text into v_owner, v_status
    from public.businesses where id = p_business_id for update;
  if v_owner is null then raise exception 'BUSINESS_NOT_FOUND'; end if;

  if v_owner is distinct from v_uid then
    raise exception 'Only the business owner can delete this business.';
  end if;

  if v_status = 'DELETED' then
    raise exception 'This business is already deleted.';
  end if;

  select count(*) into v_live
    from public.appointments a
   where a.target_type = 'BUSINESS'
     and a.target_id = p_business_id
     and a.status in ('PENDING','ACCEPTED')
     and a.scheduled_for >= now();
  if v_live > 0 then
    raise exception 'You have % upcoming booking(s). Cancel or complete them before deleting.', v_live;
  end if;

  select name into v_biz_name from public.businesses where id = p_business_id;

  update public.businesses
     set status = 'DELETED', deleted_at = now()
   where id = p_business_id;

  for v_grantee in
    update public.business_access_sessions
       set status = 'REVOKED', decided_at = now()
     where business_id = p_business_id
       and status in ('PENDING','ACTIVE')
    returning grantee_user_id
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_grantee, 'QUEUE_UPDATE', 'Business closed',
              coalesce(v_biz_name, 'A business') || ' was deleted by its owner — your access has ended.',
              '/account/business-access');
    exception when others then null;
    end;
  end loop;
end $function$;
