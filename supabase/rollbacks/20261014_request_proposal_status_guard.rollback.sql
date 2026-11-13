-- Rollback for 20261014_request_proposal_status_guard.sql — nothing existed before it, so this only removes it.
drop trigger if exists trg_guard_deal_status on public.requests;
drop trigger if exists trg_guard_deal_status on public.proposals;
drop function if exists public.guard_deal_status();
