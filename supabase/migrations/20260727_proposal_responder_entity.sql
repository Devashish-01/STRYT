-- ============================================================
-- Tags a proposal to the specific business/provider that submitted it (not
-- just a generic "business"/"provider" role string), so a person who owns
-- multiple businesses/providers can tell their own proposals apart, and so
-- each console can show only its own sent proposals. Run manually in
-- Supabase SQL editor.
-- ============================================================

alter table public.proposals
  add column if not exists responder_entity_id text;

create index if not exists proposals_responder_entity_idx on public.proposals (responder_entity_id) where responder_entity_id is not null;
