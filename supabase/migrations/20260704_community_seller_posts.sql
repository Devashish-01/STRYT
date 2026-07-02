-- Lets a business/provider owner post to the community "as" their seller
-- identity instead of their personal account. author_user_id still always
-- holds the real signed-in user (ownership/RLS unchanged); author_type +
-- author_ref_id are purely which identity the post displays as.
alter table public.community_posts
  add column if not exists author_type text not null default 'user' check (author_type in ('user','business','provider')),
  add column if not exists author_ref_id text;

create index if not exists community_posts_author_ref_idx on public.community_posts (author_type, author_ref_id);
