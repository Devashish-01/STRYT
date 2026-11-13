-- ============================================================
-- 20261014 — Requests and proposals change state only through the deal functions (GAPS #43)
--
-- The deal flow is three linked machines: requests (OPEN -> IN_PROGRESS -> …),
-- proposals (SUBMITTED -> ACCEPTED | REJECTED | WITHDRAWN) and agreements.
-- agreements is already RPC-only. But:
--   * RLS upd_requests let the requester UPDATE status directly: mark a request
--     COMPLETED / CANCELLED under a live agreement, or reopen IN_PROGRESS -> OPEN;
--     and a request could be inserted already AGREED / COMPLETED.
--   * RLS accept_proposals let the responder UPDATE their own proposal,
--     including status and request_id: self-ACCEPT (after which the requester's
--     real accept_proposal fails with REQUEST_NOT_OPEN and no agreement exists),
--     revive a WITHDRAWN / REJECTED quote, or move it to another request.
-- The app never writes these directly (requestService.update only sends
-- title / description / budget / urgency; every move is accept_proposal,
-- accept_proposal_counter, withdraw_proposal, agreement_cancel,
-- cancel_expired_agreements, admin_cancel_request, close_expired_requests —
-- all SECURITY DEFINER, so untouched here).
-- Now, for client roles:
--   requests   insert only as OPEN; status never changes by direct UPDATE
--   proposals  insert only as SUBMITTED; status, request_id and the responder
--              columns never change by direct UPDATE
-- Admins keep direct access (the admin panel).
-- Rollback: supabase/rollbacks/20261014_request_proposal_status_guard.rollback.sql
-- Test:     supabase/tests/request_proposal_status_guard.test.sql
-- ============================================================

create or replace function public.guard_deal_status()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    if tg_table_name = 'requests' and new.status::text is distinct from 'OPEN'
       or tg_table_name = 'proposals' and new.status::text is distinct from 'SUBMITTED' then
      raise exception 'DEAL_STATUS_NEEDS_FUNCTION' using errcode = '42501',
        hint = format('A new %s starts as %s.', tg_table_name, case when tg_table_name = 'requests' then 'OPEN' else 'SUBMITTED' end);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'DEAL_STATUS_NEEDS_FUNCTION' using errcode = '42501',
      hint = format('%s -> %s on %s goes through the deal functions.', old.status, new.status, tg_table_name);
  end if;

  -- Nested on purpose: PL/pgSQL does not short-circuit AND, so new.request_id must
  -- never be evaluated for a requests row (it has no such column).
  if tg_table_name = 'proposals' then
    if new.request_id is distinct from old.request_id
       or new.responder_user_id is distinct from old.responder_user_id
       or new.responder_type is distinct from old.responder_type
       or new.responder_entity_id is distinct from old.responder_entity_id then
      raise exception 'IMMUTABLE_FIELD' using errcode = '42501',
        hint = 'A proposal stays on its request and with its responder.';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function public.guard_deal_status() from public, anon, authenticated;

drop trigger if exists trg_guard_deal_status on public.requests;
create trigger trg_guard_deal_status
  before insert or update on public.requests
  for each row execute function public.guard_deal_status();

drop trigger if exists trg_guard_deal_status on public.proposals;
create trigger trg_guard_deal_status
  before insert or update on public.proposals
  for each row execute function public.guard_deal_status();
