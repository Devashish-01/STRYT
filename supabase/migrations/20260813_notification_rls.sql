-- 20260813_notification_rls.sql
--
-- Row-Level Security for notifications. Like chat, notifications had no tracked
-- RLS policy — reads were only ever filtered client-side (user_id = uid in
-- notificationService), which is NOT a security boundary. This restricts a user
-- to reading and updating ONLY their own notifications at the database level, so
-- the scoped bells (BUSINESS/PROVIDER/CUSTOMER) sit on top of a real guarantee.
--
-- ── Why INSERT stays permissive ─────────────────────────────────────────────
-- Notifications are inherently CROSS-USER: a customer's booking, a community
-- reply, a queue call, etc. each insert a row whose user_id is SOMEONE ELSE
-- (the recipient). Those inserts run inside ~15 triggers (and notificationService
-- .send/sendBulk) in the acting user's session. A strict
-- `with check (user_id = auth.uid())` would break every one of them. So INSERT is
-- limited to authenticated callers only. This closes the real hole (reading
-- other people's notifications) while leaving the create-for-others flows intact.
--
-- Follow-up option (not done here): to also stop a malicious client from
-- inserting spam notifications for others, convert the notification-creating
-- trigger functions to SECURITY DEFINER and then tighten this INSERT check.
-- That's a larger, riskier audit across many migrations — deferred deliberately.
--
-- Idempotent + defensive; run manually in the Supabase SQL editor.

alter table if exists public.notifications enable row level security;

-- Read: only your own notifications.
do $$ begin
  create policy read_own_notifications on public.notifications
    for select using (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- Update: only your own (mark-as-read).
do $$ begin
  create policy update_own_notifications on public.notifications
    for update using (user_id = auth.uid()::text)
    with check (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- Delete: only your own (in case of client-side dismissal).
do $$ begin
  create policy delete_own_notifications on public.notifications
    for delete using (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- Insert: authenticated only (recipient is often another user — see header).
do $$ begin
  create policy insert_notifications on public.notifications
    for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
