-- Rollback for 20260988_emergency_contact_by_identifier.sql
-- Neither function nor the trigger existed in production before the apply (pg_proc / pg_trigger, 2026-09-16), so
-- dropping them restores the previous state exactly. The most contacts any user has today is 1, so no row was written
-- that the cap would have refused.
-- WARNING: restoring means emergency contacts can only be chosen from people already chatted with (ECON-1) and the
-- list is uncapped again (ECON-5). Roll the app back too, or "Add by number" will fail with "function not found".

drop trigger if exists trg_emergency_contact_cap on public.emergency_contacts;
drop function if exists public.enforce_emergency_contact_cap();
drop function if exists public.emergency_contact_add_by_identifier(text);
