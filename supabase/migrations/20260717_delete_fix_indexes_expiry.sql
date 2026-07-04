-- 20260717 — three concerns, all idempotent + schema-drift-guarded:
--   1. Fix "can't delete a request" — agreements.request_id had no ON DELETE
--      rule, so a request with an accepted agreement failed FK on delete.
--   2. Request auto-expiry (max 24h) — expires_at column + sweep function.
--   3. Comprehensive indexing of hot filter/FK columns (perf).
--
-- Every index is wrapped in an information_schema column-existence check because
-- this project has a history of live schema drift vs. tracked migrations; a bare
-- CREATE INDEX on a drifted/renamed column would abort the whole file.

-- ── 1. DELETE-REQUEST FIX ───────────────────────────────────────────────
-- Re-point agreements.request_id → ON DELETE SET NULL. The agreement keeps its
-- denormalised request_title, so deleting the original request post no longer
-- destroys deal history, and no longer FK-blocks the delete.
do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.agreements'::regclass
    and contype = 'f'
    and conkey = (
      select array_agg(attnum)
      from pg_attribute
      where attrelid = 'public.agreements'::regclass and attname = 'request_id'
    );
  if fk_name is not null then
    execute format('alter table public.agreements drop constraint %I', fk_name);
  end if;
  alter table public.agreements
    add constraint agreements_request_id_fkey
    foreign key (request_id) references public.requests(id) on delete set null;
exception
  when undefined_table then null;   -- agreements table absent (shouldn't happen)
  when duplicate_object then null;  -- constraint already re-created
end $$;

-- ── 2. REQUEST AUTO-EXPIRY (max 24h) ────────────────────────────────────
alter table if exists public.requests
  add column if not exists expires_at timestamptz;

-- Sweep: flip still-OPEN requests whose timer elapsed to EXPIRED. Called
-- opportunistically by the feed/detail reads (same pattern as
-- cancel_expired_agreements). SECURITY DEFINER so any caller can run it.
create or replace function public.close_expired_requests()
returns void
language sql
security definer
set search_path = public
as $$
  update public.requests
  set status = 'EXPIRED'
  where status = 'OPEN'
    and expires_at is not null
    and expires_at < now();
$$;

grant execute on function public.close_expired_requests() to anon, authenticated;

-- ── 3. INDEXES ──────────────────────────────────────────────────────────
do $$
declare
  r text[];
  specs text[][] := array[
    -- table,            index name,                        columns
    ['requests',          'requests_requester_idx',          '(requester_user_id)'],
    ['requests',          'requests_expires_idx',            '(expires_at) where status = ''OPEN'''],
    ['agreements',        'agreements_requester_idx',        '(requester_user_id)'],
    ['agreements',        'agreements_responder_idx',        '(responder_user_id)'],
    ['agreements',        'agreements_request_idx',          '(request_id)'],
    ['agreements',        'agreements_status_idx',           '(status)'],
    ['proposals',         'proposals_responder_idx',         '(responder_user_id)'],
    ['bookmarks',         'bookmarks_user_idx',              '(user_id)'],
    ['follows',           'follows_follower_idx',            '(follower_user_id)'],
    ['follows',           'follows_target_idx',              '(target_type, target_id)'],
    ['notifications',     'notifications_user_idx',          '(user_id, created_at desc)'],
    ['messages',          'messages_conversation_idx',       '(conversation_id, created_at)'],
    ['conversations',     'conversations_user_a_idx',        '(user_a_id)'],
    ['conversations',     'conversations_user_b_idx',        '(user_b_id)'],
    ['ratings',           'ratings_rater_idx',               '(rater_user_id)'],
    ['ratings',           'ratings_ratee_idx',               '(ratee_type, ratee_id)'],
    ['vouches',           'vouches_from_idx',                '(from_user_id)'],
    ['vouches',           'vouches_provider_idx',            '(provider_id)'],
    ['endorsements',      'endorsements_from_idx',           '(from_user_id)'],
    ['endorsements',      'endorsements_provider_idx',       '(provider_id)'],
    ['community_posts',   'community_posts_author_user_idx',  '(author_user_id)'],
    ['post_comments',     'post_comments_post_idx',          '(post_id)'],
    ['user_lists',        'user_lists_user_idx',             '(user_id)'],
    ['user_list_items',   'user_list_items_list_idx',        '(list_id)'],
    ['user_saved_coupons','user_saved_coupons_user_idx',     '(user_id)']
  ];
  first_col text;
begin
  foreach r slice 1 in array specs loop
    -- extract the first bare column name from the columns spec for existence test
    first_col := lower(regexp_replace(split_part(regexp_replace(r[3], '^\(', ''), ',', 1), '[^a-z_].*$', ''));
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r[1] and column_name = first_col
    ) then
      begin
        execute format('create index if not exists %I on public.%I %s', r[2], r[1], r[3]);
      exception when others then
        -- skip any single index that can't be built (e.g. a drifted later column)
        -- rather than aborting the whole migration.
        null;
      end;
    end if;
  end loop;
end $$;
