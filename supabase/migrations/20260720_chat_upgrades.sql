-- Flow 6 (Direct Chat) — image attachments + read receipts.
-- Run manually in Supabase SQL editor.
--
-- Typing indicators use Supabase Realtime Broadcast (ephemeral, no table needed)
-- and are wired entirely client-side in chatService.ts.

alter table if exists public.messages
  add column if not exists image_url text;

-- Per-side "I have read up to this point in time" markers. Coarser than
-- per-message receipts, but enough to show a "Seen" mark under the sender's
-- last message once the other side's timestamp passes it.
alter table if exists public.conversations
  add column if not exists last_read_at_a timestamptz,
  add column if not exists last_read_at_b timestamptz;
