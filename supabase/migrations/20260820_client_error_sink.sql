-- 20260820 — Client-side error capture sink (lightweight observability).
--
-- Production runtime errors were invisible: ErrorBoundary only console.logged
-- and nothing left the device. This table receives captured errors from the
-- client (src/lib/monitoring.ts) so admins can actually see crashes.
--
-- Security posture (matches the go-live hardening): authenticated users may
-- log ONLY their own errors — user_id is stamped from the JWT via the column
-- default and pinned by the insert policy, so it can't be spoofed and anon
-- can't write. Only admins can read. No FK on user_id, so the error logger
-- itself never fails (e.g. an error thrown mid-onboarding before the users row
-- exists still gets recorded).
create table if not exists public.client_errors (
  id          text primary key default ('err_' || replace(gen_random_uuid()::text, '-', '')),
  user_id     text default (auth.uid())::text,
  kind        text not null,          -- REACT | WINDOW_ERROR | UNHANDLED_REJECTION | MANUAL
  message     text,
  stack       text,
  url         text,
  user_agent  text,
  app_version text,
  context     jsonb,
  created_at  timestamptz default now()
);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
create index if not exists client_errors_user_idx    on public.client_errors (user_id);

alter table public.client_errors enable row level security;
do $$ begin
  -- Authenticated users may insert only their own error rows (user_id defaults
  -- to and must equal auth.uid() — unspoofable; anon is blocked entirely).
  create policy ce_insert on public.client_errors
    for insert to authenticated
    with check (user_id = auth.uid()::text);
  -- Only admins/super_admins can read the error log.
  create policy ce_admin_read on public.client_errors
    for select to authenticated
    using (exists (
      select 1 from public.users a
      where a.id = auth.uid()::text
        and (a.roles @> array['admin'] or a.roles @> array['super_admin'])
    ));
exception when duplicate_object then null; end $$;
