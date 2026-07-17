-- 20260825 — Agreement cancel (pre-payment) + stale-ACTIVE auto-expiry
--
-- Today an ACTIVE agreement has no way out short of reaching REVIEW and
-- raising a dispute for an admin to resolve — an awkward path for someone who
-- just wants to back out before any work or money moves. Two gaps closed:
--
-- 1. agreement_cancel(p_id): either party can cancel while ACTIVE and nothing
--    has been paid (payment_status UNPAID/REJECTED only — blocked once a
--    claim is PENDING_CONFIRM or PAID, same principle as the queue-cancel
--    fix). Reopens the original request and reverts proposals back to
--    SUBMITTED, matching the existing cancel_expired_agreements behavior, so
--    the requester can pick someone else.
--
-- 2. cancel_expired_agreements() extended: a one-time payment reminder at 24h
--    unpaid, and auto-cancel at 72h unpaid — a stale ACTIVE deal no longer
--    sits forever. The existing PENDING (10-minute) branch is unchanged.

create or replace function public.agreement_cancel(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
  v_other text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.requester_user_id
     and v_uid is distinct from v_agreement.responder_user_id then
    raise exception 'NOT_A_PARTY';
  end if;
  if v_agreement.status <> 'ACTIVE' then raise exception 'INVALID_TRANSITION'; end if;
  if coalesce(v_agreement.payment_status, 'UNPAID') not in ('UNPAID', 'REJECTED') then
    raise exception 'PAYMENT_IN_PROGRESS';
  end if;

  update public.agreements set status = 'CANCELLED' where id = p_id and status = 'ACTIVE';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  update public.requests set status = 'OPEN' where id = v_agreement.request_id;
  update public.proposals set status = 'SUBMITTED' where request_id = v_agreement.request_id;

  v_other := case when v_uid = v_agreement.requester_user_id
    then v_agreement.responder_user_id else v_agreement.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_other, 'AGREEMENT', 'Agreement cancelled',
      'The agreement for "' || coalesce(v_agreement.request_title, 'your request') || '" was cancelled before payment.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end
$$;

revoke execute on function public.agreement_cancel(text) from public, anon;
grant execute on function public.agreement_cancel(text) to authenticated;


create or replace function public.cancel_expired_agreements()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ag record;
begin
  -- Unchanged: both parties must confirm within 10 minutes of a proposal
  -- being accepted, or the agreement (and the underlying request/proposals)
  -- reverts.
  for v_ag in
    select * from public.agreements
    where status = 'PENDING'
      and created_at < now() - interval '10 minutes'
  loop
    update public.agreements set status = 'CANCELLED' where id = v_ag.id;
    update public.requests set status = 'OPEN' where id = v_ag.request_id;
    update public.proposals set status = 'SUBMITTED' where request_id = v_ag.request_id;
  end loop;

  -- New: a confirmed-but-unpaid ACTIVE deal is otherwise invisible to the
  -- system — nothing nudges or times it out. One reminder at 24h, deduped by
  -- checking a reminder with this exact deep-link hasn't already gone out.
  insert into public.notifications (user_id, type, title, body, deep_link)
  select a.requester_user_id, 'AGREEMENT', 'Payment reminder',
         'You still need to pay for "' || coalesce(a.request_title, 'your agreement')
           || '" — this deal auto-cancels after 3 days unpaid.',
         '/agreement/' || a.id
    from public.agreements a
   where a.status = 'ACTIVE'
     and coalesce(a.payment_status, 'UNPAID') in ('UNPAID', 'REJECTED')
     and a.created_at < now() - interval '24 hours'
     and not exists (
       select 1 from public.notifications n
        where n.deep_link = '/agreement/' || a.id and n.title = 'Payment reminder'
     );

  -- New: auto-cancel at 72h unpaid — same revert-and-notify shape as the
  -- PENDING branch above, plus an explicit notice to both parties since this
  -- one fires without either of them acting.
  for v_ag in
    select * from public.agreements
    where status = 'ACTIVE'
      and coalesce(payment_status, 'UNPAID') in ('UNPAID', 'REJECTED')
      and created_at < now() - interval '72 hours'
  loop
    update public.agreements set status = 'CANCELLED' where id = v_ag.id;
    update public.requests set status = 'OPEN' where id = v_ag.request_id;
    update public.proposals set status = 'SUBMITTED' where request_id = v_ag.request_id;

    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values
        (v_ag.requester_user_id, 'AGREEMENT', 'Agreement auto-cancelled',
         'Payment was never made for "' || coalesce(v_ag.request_title, 'your agreement') || '" — it has been cancelled.',
         '/agreement/' || v_ag.id),
        (v_ag.responder_user_id, 'AGREEMENT', 'Agreement auto-cancelled',
         'The unpaid agreement for "' || coalesce(v_ag.request_title, 'your agreement') || '" has been cancelled.',
         '/agreement/' || v_ag.id);
    exception when others then null;
    end;
  end loop;
end
$function$;
