import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Reads the migration as text (as communityNotifications.test.ts does for its SQL): the checks are for the promises
// the stories feature depends on, so a later edit cannot quietly drop one.
const sql = readFileSync(resolve(__dirname, "../../supabase/migrations/20261008_stories_complete.sql"), "utf8");
const rollback = readFileSync(resolve(__dirname, "../../supabase/rollbacks/20261008_stories_complete.rollback.sql"), "utf8");
const flat = (s: string) => s.replace(/--.*$/gm, "").replace(/\s+/g, " ").toLowerCase();
const code = flat(sql);

describe("20261008 stories migration", () => {
  it("lets a viewer read their own view row — without it no view or reaction can ever be saved", () => {
    expect(code).toMatch(/create policy read_story_views on public\.story_views for select using \( viewer_user_id = \(select auth\.uid\(\)\)::text/);
  });

  it("lets the shop's team and a provider's owner read views, not only the exact poster", () => {
    expect(code).toMatch(/s\.owner_type = 'business' and public\.can_manage_business\(s\.owner_id\)/);
    expect(code).toMatch(/s\.owner_type = 'provider' and exists/);
  });

  it("caps a story's life at 7 days (+1 h of clock slack) in the database", () => {
    expect(code).toMatch(/add constraint stories_expiry_cap check \(expires_at <= coalesce\(created_at, now\(\)\) \+ interval '7 days 1 hour'\)/);
  });

  it("hides expired stories from everyone but their owner/managers and Highlights, and hides blocked people both ways", () => {
    const policy = code.slice(code.indexOf("create policy stories_select"), code.indexOf("create policy read_story_views"));
    expect(policy).toContain("expires_at > now()");
    expect(policy).toContain("or is_highlighted");
    expect(policy).toContain("not public.is_blocked_between(user_id)");
    // the moderation rule from 20260971 is still there
    expect(policy).toContain("hidden_at is null");
    expect(policy).toContain("public.is_admin()");
  });

  it("keeps story_mutes private to the muter", () => {
    expect(code).toContain("alter table public.story_mutes enable row level security");
    for (const op of ["select", "insert", "delete"]) expect(code).toMatch(new RegExp(`create policy story_mutes_${op}_own`));
    expect(code).toContain("revoke all on public.story_mutes from anon");
  });

  it("makes the five-reporter rule apply to stories too", () => {
    expect(code).toContain("new.target_type not in ('post', 'comment', 'story')");
    expect(code).toMatch(/update public\.stories set hidden_at = now\(\), hidden_reason = 'reports'/);
  });

  it("purges expired stories daily but keeps Highlights and anything a moderator still has to look at", () => {
    const fn = code.slice(code.indexOf("create or replace function public.purge_expired_stories"), code.indexOf("do $cron$"));
    expect(fn).toContain("not s.is_highlighted");
    expect(fn).toContain("s.expires_at < now() - interval '1 hour'");
    expect(fn).toContain("r.status in ('open', 'reviewing')");
    expect(code).toContain("cron.schedule('purge-expired-stories'");
  });

  it("exposes the orphan-photo list to the service role only", () => {
    expect(code).toContain("revoke all on function public.orphan_story_files(integer) from public, anon, authenticated");
    expect(code).toContain("grant execute on function public.orphan_story_files(integer) to service_role");
  });

  it("lets a user see their own uploads so deleting a story photo really deletes it", () => {
    expect(code).toMatch(/create policy "user scoped select" on storage\.objects for select using \( bucket_id = 'uploads' and auth\.role\(\) = 'authenticated' and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  });

  it("has a rollback that restores the old policies and removes everything it added", () => {
    const r = flat(rollback);
    for (const needle of [
      "drop table if exists public.story_mutes",
      "drop function if exists public.purge_expired_stories()",
      "drop function if exists public.orphan_story_files(integer)",
      "drop constraint if exists stories_expiry_cap",
      "create policy read_story_views_owner",
      "create policy stories_select",
      "cron.unschedule('purge-expired-stories')",
      'drop policy if exists "user scoped select" on storage.objects',
    ]) expect(r).toContain(needle);
  });
});
