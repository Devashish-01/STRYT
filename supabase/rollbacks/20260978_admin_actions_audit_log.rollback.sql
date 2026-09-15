-- Rollback for 20260978_admin_actions_audit_log.sql. Everything it created is new (no replaced definitions):
-- drops the triggers, the trigger function and the log table.
-- WARNING: dropping the table deletes the recorded admin history; export it first if it matters.

drop trigger if exists trg_admin_audit_reports on public.reports;
drop trigger if exists trg_admin_audit_bug_reports on public.bug_reports;
drop trigger if exists trg_admin_audit_businesses on public.businesses;
drop trigger if exists trg_admin_audit_providers on public.providers;
drop trigger if exists trg_admin_audit_places on public.places;
drop trigger if exists trg_admin_audit_requests on public.requests;
drop trigger if exists trg_admin_audit_agreements on public.agreements;
drop trigger if exists trg_admin_audit_community_posts on public.community_posts;
drop function if exists public.log_admin_action();
drop table if exists public.admin_actions;
