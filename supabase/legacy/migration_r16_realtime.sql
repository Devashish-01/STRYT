-- ============================================================
-- NAYA — R16: Enable Realtime for key tables
-- ============================================================

do $$ begin
  alter publication supabase_realtime add table public.stories;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.community_posts;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.requests;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.agreements;
exception when others then null; end $$;
