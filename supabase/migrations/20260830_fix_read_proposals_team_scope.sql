-- read_proposals only checked responder_user_id = auth.uid() — a business
-- proposal submitted BY a teammate (any teammate with 'leads' scope may
-- submit as the business, enforced server-side by
-- enforce_proposal_responder_entity_owner) was invisible to every OTHER
-- teammate managing the same business, including the owner, on the "Sent"
-- tab (BusinessRequests.tsx, requestService.myProposals) — silently
-- incomplete, no error. Added the same 'leads' scope check the write-side
-- trigger already enforces, so read visibility now matches write eligibility.

drop policy if exists read_proposals on public.proposals;
create policy read_proposals on public.proposals for select
  using (
    responder_user_id = (select auth.uid())::text
    or (responder_type = 'business' and has_business_scope(responder_entity_id, (select auth.uid())::text, 'leads'))
    or exists (select 1 from public.requests r where r.id = proposals.request_id and r.requester_user_id = (select auth.uid())::text)
    or is_admin()
  );
