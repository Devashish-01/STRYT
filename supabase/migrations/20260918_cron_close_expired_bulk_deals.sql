-- ============================================================
-- 20260918 — Fix gap log #8: an expired bulk-buying campaign kept showing as
-- open indefinitely. close_expired_bulk_deals() itself is correct (confirmed
-- by calling it directly) — the gap was that nothing guaranteed it ever ran.
-- It was only invoked opportunistically from bulkService.ts's deals()/
-- dealsForBusiness()/getDeal(), gated on an authenticated session and
-- debounced to once per 2 minutes per browser session — if no signed-in
-- client happened to hit one of those three methods after a deal's deadline
-- passed, it simply never closed.
--
-- close_stale_queue_tokens is the only sweep function in this codebase with
-- a real pg_cron schedule (20260803_queue_auto_close_and_cancel.sql:139) —
-- this gives close_expired_bulk_deals the exact same treatment. The
-- opportunistic client-side calls stay as-is (harmless, and they close
-- things faster than a 10-minute cron tick when someone IS actively using
-- the app) — this just adds the missing backstop.
-- ============================================================

do $$
begin
  perform cron.schedule('close-expired-bulk-deals', '*/10 * * * *', 'select public.close_expired_bulk_deals();');
exception when others then null;
end $$;
