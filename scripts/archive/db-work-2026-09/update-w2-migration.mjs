import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const migPath = path.join(ROOT, "supabase/migrations/20260958_capture_database_only_objects.sql");

let content = fs.readFileSync(migPath, "utf8");

// 1. Add REVOKE before each GRANT
// Regex matches: GRANT EXECUTE ON FUNCTION public.(funcName)(args) TO (roles);
const grantRegex = /^GRANT EXECUTE ON FUNCTION (public\.[a-zA-Z0-9_]+\([^\)]*\)) TO ([^;]+);/gm;

let revokeCount = 0;
content = content.replace(grantRegex, (match, funcSig, roles) => {
  revokeCount++;
  return `revoke all on function ${funcSig} from public, anon, authenticated;\n${match}`;
});

console.log(`Added ${revokeCount} REVOKE statements.`);

// 2. Replace Section 3 (Triggers) with all 10 triggers
const sec3Start = content.indexOf("-- 3. TRIGGERS");
const sec4Start = content.indexOf("-- 4. POLICIES");

if (sec3Start === -1 || sec4Start === -1) {
  throw new Error("Could not find section boundaries for Section 3 or Section 4");
}

const triggersSql = `-- 3. TRIGGERS (Idempotent: Guarded by DO block checking pg_trigger)
-- ══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'agreements'
      AND t.tgname = 'trg_settlements'
  ) THEN
    CREATE TRIGGER trg_settlements
      AFTER UPDATE ON public.agreements
      FOR EACH ROW EXECUTE FUNCTION public.create_settlements_on_complete();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'businesses'
      AND t.tgname = 'sync_businesses_verified'
  ) THEN
    CREATE TRIGGER sync_businesses_verified
      BEFORE INSERT OR UPDATE ON public.businesses
      FOR EACH ROW EXECUTE FUNCTION public.sync_is_verified();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'businesses'
      AND t.tgname = 'trg_protect_business_owner'
  ) THEN
    CREATE TRIGGER trg_protect_business_owner
      BEFORE UPDATE ON public.businesses
      FOR EACH ROW EXECUTE FUNCTION public.protect_business_owner();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'community_posts'
      AND t.tgname = 'trg_sync_community_post_geom'
  ) THEN
    CREATE TRIGGER trg_sync_community_post_geom
      BEFORE INSERT OR UPDATE OF lat, lng ON public.community_posts
      FOR EACH ROW EXECUTE FUNCTION public.sync_community_post_geom();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'providers'
      AND t.tgname = 'providers_geom'
  ) THEN
    CREATE TRIGGER providers_geom
      BEFORE INSERT OR UPDATE ON public.providers
      FOR EACH ROW EXECUTE FUNCTION public.sync_geom();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'providers'
      AND t.tgname = 'sync_providers_verified'
  ) THEN
    CREATE TRIGGER sync_providers_verified
      BEFORE INSERT OR UPDATE ON public.providers
      FOR EACH ROW EXECUTE FUNCTION public.sync_is_verified();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'ratings'
      AND t.tgname = 'ratings_update_avg'
  ) THEN
    CREATE TRIGGER ratings_update_avg
      AFTER INSERT ON public.ratings
      FOR EACH ROW EXECUTE FUNCTION public.update_rating_avg();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'requests'
      AND t.tgname = 'requests_geom'
  ) THEN
    CREATE TRIGGER requests_geom
      BEFORE INSERT OR UPDATE ON public.requests
      FOR EACH ROW EXECUTE FUNCTION public.sync_geom();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'stories'
      AND t.tgname = 'trg_sync_story_geom'
  ) THEN
    CREATE TRIGGER trg_sync_story_geom
      BEFORE INSERT OR UPDATE ON public.stories
      FOR EACH ROW EXECUTE FUNCTION public.sync_story_geom();
  END IF;
END $$;

DO $$
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
END $$;

`;

content = content.substring(0, sec3Start) + triggersSql + content.substring(sec4Start);

fs.writeFileSync(migPath, content, "utf8");
console.log(`Updated ${migPath} successfully! Total lines: ${content.split('\n').length}`);
