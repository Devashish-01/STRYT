-- Migration 20260969 — agreements change only through their functions.
--
-- WHY
--   Policy write_agreements (FOR ALL) let the requester or responder INSERT, UPDATE or
--   DELETE an agreement row directly. Tested on production 2026-09-15 inside a forced
--   rollback: the responder set payment_status = PAID, status = COMPLETED and
--   agreed_price = 1 in one UPDATE, and the requester deleted the agreement — skipping
--   every rule in accept_proposal / agreement_claim_payment / agreement_confirm_payment
--   (payment confirmation, settlements, notifications).
--
-- WHAT
--   Drop write_agreements. Reading is unchanged (read_agreements). Every agreement write
--   in the app goes through SECURITY DEFINER functions owned by `postgres`, which has
--   BYPASSRLS, so they keep working. Checked: no direct insert/update/delete on
--   agreements in src or the shipped bundle, and no SECURITY INVOKER function writes it.

drop policy if exists write_agreements on public.agreements;

notify pgrst, 'reload schema';
