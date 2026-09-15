-- Admin audit trail (E2E-031).
--
-- Moderation had no record of who did what: suspending a shop or provider, approving or rejecting a listing or a
-- location change, cancelling a request, deleting a post, resolving a dispute, closing a report or a bug report only
-- changed the row itself. This adds an append-only public.admin_actions log that only admins can read and nobody
-- can write directly: rows are inserted by SECURITY DEFINER triggers, and only when the signed-in actor is an admin
-- (public.is_admin()). Ordinary owner/customer changes to the same rows are not logged.
--
-- Covered writes (all admin paths the app uses):
--   reports.status, bug_reports.status             → report closed / dismissed / action taken
--   businesses.status, businesses.location_review_status, providers.status, places.status
--                                                   → approve / reject / suspend / reactivate / location change
--   requests.status                                 → admin_cancel_request
--   agreements.status                               → admin_resolve_agreement_dispute
--   community_posts delete                          → admin_delete_post
-- Comment removals are recorded through the report they close (reports.status). Verification decisions run in the
-- verification-review Edge Function as service_role and already stamp verification_reviewed_by/_at on the row.
--
-- Rollback: supabase/rollbacks/20260978_admin_actions_audit_log.rollback.sql

create table if not exists public.admin_actions (
  id text primary key default ('aa_' || replace(gen_random_uuid()::text, '-', '')),
  admin_user_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc);
create index if not exists admin_actions_target_idx on public.admin_actions (target_type, target_id);
create index if not exists admin_actions_admin_idx on public.admin_actions (admin_user_id, created_at desc);

alter table public.admin_actions enable row level security;

drop policy if exists admin_actions_admin_read on public.admin_actions;
create policy admin_actions_admin_read on public.admin_actions
  for select
  to authenticated
  using (public.is_admin());

revoke all on table public.admin_actions from public, anon, authenticated;
grant select on table public.admin_actions to authenticated;

create or replace function public.log_admin_action()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_new jsonb;
  v_old jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_col text;
begin
  if v_uid is null or not public.is_admin() then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    insert into public.admin_actions (admin_user_id, action, target_type, target_id, details)
    values (
      v_uid, 'DELETE', tg_table_name, v_old->>'id',
      jsonb_strip_nulls(jsonb_build_object(
        'title', v_old->'title',
        'author_user_id', v_old->'author_user_id',
        'body_excerpt', left(v_old->>'body', 280)
      ))
    );
    return old;
  end if;

  v_new := to_jsonb(new);
  v_old := to_jsonb(old);
  foreach v_col in array tg_argv loop
    if v_old->v_col is distinct from v_new->v_col then
      v_changes := v_changes || jsonb_build_object(v_col, jsonb_build_object('from', v_old->v_col, 'to', v_new->v_col));
    end if;
  end loop;
  if v_changes = '{}'::jsonb then
    return new;
  end if;

  insert into public.admin_actions (admin_user_id, action, target_type, target_id, details)
  values (
    v_uid, 'UPDATE', tg_table_name, v_new->>'id',
    jsonb_strip_nulls(jsonb_build_object(
      'changes', v_changes,
      'report_target_type', case when tg_table_name = 'reports' then v_new->'target_type' end,
      'report_target_id', case when tg_table_name = 'reports' then v_new->'target_id' end,
      'reason', coalesce(v_new->'rejection_reason', case when tg_table_name = 'reports' then v_new->'reason' end)
    ))
  );
  return new;
end;
$function$;

revoke all on function public.log_admin_action() from public, anon, authenticated;

drop trigger if exists trg_admin_audit_reports on public.reports;
create trigger trg_admin_audit_reports after update of status on public.reports
  for each row when (old.status is distinct from new.status) execute function public.log_admin_action('status');

drop trigger if exists trg_admin_audit_bug_reports on public.bug_reports;
create trigger trg_admin_audit_bug_reports after update of status on public.bug_reports
  for each row when (old.status is distinct from new.status) execute function public.log_admin_action('status');

drop trigger if exists trg_admin_audit_businesses on public.businesses;
create trigger trg_admin_audit_businesses after update of status, location_review_status on public.businesses
  for each row when (old.status is distinct from new.status or old.location_review_status is distinct from new.location_review_status)
  execute function public.log_admin_action('status', 'location_review_status', 'lat', 'lng');

drop trigger if exists trg_admin_audit_providers on public.providers;
create trigger trg_admin_audit_providers after update of status on public.providers
  for each row when (old.status is distinct from new.status) execute function public.log_admin_action('status');

drop trigger if exists trg_admin_audit_places on public.places;
create trigger trg_admin_audit_places after update of status on public.places
  for each row when (old.status is distinct from new.status) execute function public.log_admin_action('status');

drop trigger if exists trg_admin_audit_requests on public.requests;
create trigger trg_admin_audit_requests after update of status on public.requests
  for each row when (old.status is distinct from new.status) execute function public.log_admin_action('status');

drop trigger if exists trg_admin_audit_agreements on public.agreements;
create trigger trg_admin_audit_agreements after update of status on public.agreements
  for each row when (old.status is distinct from new.status) execute function public.log_admin_action('status');

drop trigger if exists trg_admin_audit_community_posts on public.community_posts;
create trigger trg_admin_audit_community_posts after delete on public.community_posts
  for each row execute function public.log_admin_action();
