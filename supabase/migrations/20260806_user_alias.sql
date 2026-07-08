-- ============================================================
-- Alias / privacy: each user owns one unique, searchable, public alias. The
-- real name stays private and is only revealed to a counterparty inside an
-- active relationship (appointment booked, in queue, proposal submitted) —
-- that gating is enforced in the app layer on top of this column.
-- Run manually in Supabase SQL editor.
-- ============================================================

alter table public.users
  add column if not exists alias text;

comment on column public.users.alias is
  'Unique public handle. The only name strangers see and the only field users are searchable by; the real name (users.name) is private and revealed only in an active relationship.';

-- Case-insensitive uniqueness, but only for rows that have set one (partial),
-- so existing alias-less users are unaffected until they pick one.
create unique index if not exists users_alias_unique
  on public.users (lower(alias))
  where alias is not null and alias <> '';

-- Searchable by alias.
create index if not exists users_alias_search_idx
  on public.users (lower(alias));
