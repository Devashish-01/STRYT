-- 20260811_chat_rls.sql
--
-- Row-Level Security for chat. Until now conversations/messages had no tracked
-- RLS policy — the app filtered client-side, which is NOT a security boundary
-- (a crafted query could read anyone's threads). This locks reads/writes to the
-- two participants at the database level, so the client-side scope filtering in
-- chatService.ts becomes purely a UX convenience on top of a real guarantee.
--
-- Idempotent + defensive: safe to run on a live DB. Column names match what the
-- app writes (participant_a / participant_b / sender_id / conversation_id).
-- Run manually in the Supabase SQL editor.

-- ── conversations ──────────────────────────────────────────────────────────
alter table if exists public.conversations enable row level security;

-- Read: only the two people in the thread.
do $$ begin
  create policy read_own_conversations on public.conversations
    for select using (
      participant_a = auth.uid()::text or participant_b = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

-- Insert: authenticated, and the creator must be one of the two participants.
do $$ begin
  create policy insert_own_conversations on public.conversations
    for insert with check (
      auth.role() = 'authenticated'
      and (participant_a = auth.uid()::text or participant_b = auth.uid()::text)
    );
exception when duplicate_object then null; end $$;

-- Update: either participant (preview text, unread flags, read receipts).
do $$ begin
  create policy update_own_conversations on public.conversations
    for update using (
      participant_a = auth.uid()::text or participant_b = auth.uid()::text
    ) with check (
      participant_a = auth.uid()::text or participant_b = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

-- ── messages ───────────────────────────────────────────────────────────────
alter table if exists public.messages enable row level security;

-- Read: only if you're a participant of the parent conversation.
do $$ begin
  create policy read_conversation_messages on public.messages
    for select using (
      exists (
        select 1 from public.conversations c
        where c.id = conversation_id
          and (c.participant_a = auth.uid()::text or c.participant_b = auth.uid()::text)
      )
    );
exception when duplicate_object then null; end $$;

-- Insert: you must be the sender AND a participant of that conversation.
do $$ begin
  create policy insert_own_messages on public.messages
    for insert with check (
      auth.role() = 'authenticated'
      and sender_id = auth.uid()::text
      and exists (
        select 1 from public.conversations c
        where c.id = conversation_id
          and (c.participant_a = auth.uid()::text or c.participant_b = auth.uid()::text)
      )
    );
exception when duplicate_object then null; end $$;
