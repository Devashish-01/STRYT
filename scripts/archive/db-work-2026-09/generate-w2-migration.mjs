import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const snapshot = fs.readFileSync(path.join(ROOT, "supabase/snapshots/2026-09-11_after_20260957.sql"), "utf8");

function extractFunction(name) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = snapshot.indexOf(marker);
  if (start === -1) throw new Error(`Function public.${name} not found in snapshot`);
  const nextFunc = snapshot.indexOf('\nCREATE OR REPLACE FUNCTION ', start + marker.length);
  const nextSection = snapshot.indexOf('\n-- ═', start + marker.length);
  let end = -1;
  if (nextFunc !== -1 && nextSection !== -1) end = Math.min(nextFunc, nextSection);
  else if (nextFunc !== -1) end = nextFunc;
  else if (nextSection !== -1) end = nextSection;
  else end = snapshot.length;
  return snapshot.substring(start, end).trim();
}

function extractGrant(name) {
  const target = `GRANT EXECUTE ON FUNCTION public.${name}(`;
  const idx = snapshot.indexOf(target);
  if (idx !== -1) {
    const end = snapshot.indexOf(';', idx);
    return snapshot.substring(idx, end + 1);
  }
  return null;
}

const funcs = [
  'can_manage_business',
  'create_settlements_on_complete',
  'distance_km',
  'increment_stamp',
  'neighborhood_today',
  'protect_business_owner',
  'rls_auto_enable',
  'suggest_business_login',
  'sync_community_post_geom',
  'sync_geom',
  'sync_is_verified',
  'sync_me_too_count',
  'sync_story_geom',
  'update_rating_avg',
  'set_business_login',
  'bump_provider_views',
  'bump_business_metric',
  'resolve_admin_email'
];

let sql = `-- Migration: 20260958_capture_database_only_objects.sql
-- Description: W2 — Capture database-only objects into the repository.
-- All definitions are copied verbatim from the live catalog snapshot (2026-09-11_after_20260957.sql).
-- This migration is strictly idempotent: applying it to production is a verified no-op.
-- Reference: docs/database/HANDOFF.md, docs/database/W2_EXECUTION_PLAN.md

`;

sql += `-- ══════════════════════════════════════════════════════════════════
-- 1. FUNCTIONS & EXECUTE GRANTS (18 Functions)
-- ══════════════════════════════════════════════════════════════════\n\n`;

for (const f of funcs) {
  const def = extractFunction(f);
  const grant = extractGrant(f);
  sql += `-- Function: ${f}\n`;
  sql += def + "\n\n";
  if (grant) {
    sql += grant + "\n\n";
  }
}

sql += `-- ══════════════════════════════════════════════════════════════════
-- 2. INDEXES (Idempotent: CREATE INDEX IF NOT EXISTS)
-- ══════════════════════════════════════════════════════════════════\n\n`;

sql += `CREATE INDEX IF NOT EXISTS business_access_sessions_biz_status_idx
  ON public.business_access_sessions USING btree (business_id, status);\n\n`;

sql += `CREATE INDEX IF NOT EXISTS business_view_logs_biz_time
  ON public.business_view_logs USING btree (business_id, viewed_at);\n\n`;

sql += `-- ══════════════════════════════════════════════════════════════════
-- 3. TRIGGERS (Idempotent: Guarded by DO block checking pg_trigger)
-- ══════════════════════════════════════════════════════════════════\n\n`;

sql += `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'request_me_toos'
      AND t.tgname = 'me_too_count_trigger'
  ) THEN
    CREATE TRIGGER me_too_count_trigger
      AFTER INSERT OR DELETE ON public.request_me_toos
      FOR EACH ROW EXECUTE FUNCTION public.sync_me_too_count();
  END IF;
END $$;\n\n`;

sql += `-- ══════════════════════════════════════════════════════════════════
-- 4. POLICIES (Idempotent: Guarded by DO blocks checking pg_policies)
-- ══════════════════════════════════════════════════════════════════\n\n`;

// 4.1 upd_users
sql += `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'upd_users'
  ) THEN
    CREATE POLICY upd_users ON public.users AS PERMISSIVE FOR UPDATE TO PUBLIC
      USING (((id = (( SELECT auth.uid() AS uid))::text) OR (id = (( SELECT auth.uid() AS uid))::text)))
      WITH CHECK ((id = (( SELECT auth.uid() AS uid))::text));
  END IF;
END $$;\n\n`;

// 4.2 mem_read
sql += `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'society_members' AND policyname = 'mem_read'
  ) THEN
    CREATE POLICY mem_read ON public.society_members AS PERMISSIVE FOR SELECT TO authenticated
      USING ((((( SELECT auth.uid() AS uid))::text = user_id) OR is_society_member(society_id, (( SELECT auth.uid() AS uid))::text)));
  END IF;
END $$;\n\n`;

// 4.3 mem_update
sql += `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'society_members' AND policyname = 'mem_update'
  ) THEN
    CREATE POLICY mem_update ON public.society_members AS PERMISSIVE FOR UPDATE TO authenticated
      USING ((((( SELECT auth.uid() AS uid))::text = ( SELECT societies.admin_user_id
       FROM societies
      WHERE (societies.id = society_members.society_id))) OR is_society_admin(society_id, (( SELECT auth.uid() AS uid))::text)))
      WITH CHECK (is_society_admin(society_id, (( SELECT auth.uid() AS uid))::text));
  END IF;
END $$;\n\n`;

// 4.4 queue_tokens_select_all
sql += `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'queue_tokens' AND policyname = 'queue_tokens_select_all'
  ) THEN
    CREATE POLICY queue_tokens_select_all ON public.queue_tokens AS PERMISSIVE FOR SELECT TO PUBLIC
      USING ((true OR ((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((customer_user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
       FROM businesses b
      WHERE ((b.id = queue_tokens.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text)))) OR can_manage_business(business_id)))));
  END IF;
END $$;\n`;

const targetPath = path.join(ROOT, "supabase/migrations/20260958_capture_database_only_objects.sql");
fs.writeFileSync(targetPath, sql, "utf8");
console.log("Written migration to:", targetPath);
console.log("File size:", sql.length, "bytes, lines:", sql.split("\n").length);
