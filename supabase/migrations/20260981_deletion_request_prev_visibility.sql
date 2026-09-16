-- 20260981_deletion_request_prev_visibility
--
-- ACCOUNT_DELETION DEL-5: scheduling a deletion hides the profile and pauses every owned storefront; cancelling it
-- switched them all back on unconditionally, so a profile or shop that was deliberately hidden before became
-- discoverable again. The request row now carries what was visible at the time, and cancelling restores exactly that.
-- Additive only: one nullable jsonb column, no policy or default changes (rows written before this stay null, and the
-- app falls back to the old "switch it on" behaviour for those).
--
-- Rollback: supabase/rollbacks/20260981_deletion_request_prev_visibility.rollback.sql

alter table public.profile_deletion_requests
  add column if not exists prev_visibility jsonb;

comment on column public.profile_deletion_requests.prev_visibility is
  'Visibility captured when the deletion was scheduled: {"customerEnabled": bool, "businesses": {id: bool}, "providers": {id: bool}}. Used to restore exactly that on cancel (DEL-5).';
