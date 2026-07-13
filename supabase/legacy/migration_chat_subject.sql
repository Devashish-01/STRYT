-- ============================================================
-- NAYA — Chat subject context (fix: business/provider identity in chat)
-- A conversation can now be "about" a specific business or provider, so:
--   • the chat list/thread can show the business name (not the owner's
--     personal name),
--   • the same two users can hold SEPARATE threads per business/provider
--     (the old UNIQUE(participant_a, participant_b) collapsed them into one).
-- Safe to re-run.
-- ============================================================

alter table public.conversations
  add column if not exists subject_type     text,   -- 'business' | 'provider' | null (plain user↔user)
  add column if not exists subject_id        text,
  add column if not exists subject_name      text,
  add column if not exists subject_avatar    text,
  add column if not exists subject_owner_id  text;   -- the user who owns the subject listing

-- Replace the pair-only uniqueness with pair + subject, so each business/
-- provider gets its own thread while plain user↔user chats still dedupe.
alter table public.conversations drop constraint if exists unique_conversation_pair;

create unique index if not exists conversations_pair_subject_uidx
  on public.conversations (participant_a, participant_b, coalesce(subject_id, ''));
