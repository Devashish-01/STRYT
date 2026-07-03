-- ============================================================
-- Fix: Add queue_settings and queue_tokens to realtime publication
-- Run manually in Supabase SQL editor.
-- ============================================================

do $$ begin
  alter publication supabase_realtime add table public.queue_settings;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.queue_tokens;
exception when others then null; end $$;
