-- Create table to store native Firebase Cloud Messaging (FCM) tokens
create table if not exists public.fcm_tokens (
  user_id text not null references public.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz default now(),
  primary key (user_id, token)
);

-- Enable RLS
alter table public.fcm_tokens enable row level security;

-- Policies
do $$ begin
  create policy own_fcm_tokens on public.fcm_tokens for all
    using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- Grant permissions to authenticated users
grant all on public.fcm_tokens to authenticated;
