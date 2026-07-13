-- 20260812_chat_indexes.sql
--
-- Indexes to keep the scoped chat queries fast. The old index migration
-- (20260717) tried to index conversations on user_a_id/user_b_id — columns that
-- don't exist (the real columns are participant_a/participant_b), so its
-- column-existence guard silently SKIPPED them. Net result: conversations has
-- had NO participant index. These back:
--   • conversations() list      → participant_a / participant_b lookups
--   • totalUnread() head-counts  → participant + has_unread partial scans
--   • BUSINESS/PROVIDER scope     → subject_owner_id + type + id
--
-- messages already has messages_conversation_idx; notifications already has
-- notif_scope_idx + notifications_user_idx — so nothing to add there.
-- Idempotent; run manually in the Supabase SQL editor.

-- Participant lookups (customer inbox + the OR filter in conversations()).
create index if not exists conversations_participant_a_idx
  on public.conversations (participant_a);
create index if not exists conversations_participant_b_idx
  on public.conversations (participant_b);

-- Unread head-counts: partial indexes so each count query touches only the
-- (usually tiny) set of still-unread rows for that side.
create index if not exists conversations_unread_a_idx
  on public.conversations (participant_a) where has_unread_a;
create index if not exists conversations_unread_b_idx
  on public.conversations (participant_b) where has_unread_b;

-- BUSINESS / PROVIDER inbox: owner's listing threads by type + id.
create index if not exists conversations_subject_owner_idx
  on public.conversations (subject_owner_id, subject_type, subject_id)
  where subject_owner_id is not null;

-- Defensive: ensure the messages-by-conversation index exists (matches
-- 20260717's messages_conversation_idx; no-op if already present).
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);
