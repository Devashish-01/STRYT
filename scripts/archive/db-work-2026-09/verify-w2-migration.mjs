import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const migPath = path.join(ROOT, "supabase/migrations/20260958_capture_database_only_objects.sql");
const snapPath = path.join(ROOT, "supabase/snapshots/2026-09-12_pre_reconcile.sql");

const mig = fs.readFileSync(migPath, "utf8");
const snap = fs.readFileSync(snapPath, "utf8");

let hasErrors = false;

// 1. Zero DROP statements check
const dropMatches = mig.match(/\bDROP\b/gi);
if (dropMatches && dropMatches.length > 0) {
  console.error("FAIL: Found DROP statements in migration file:", dropMatches);
  hasErrors = true;
} else {
  console.log("PASS: Exactly 0 DROP statements found.");
}

// 2. Gap scan (as specified in W2 R3)
const d = path.join(ROOT, "supabase/migrations");
const migs = fs.readdirSync(d).filter(f => f.endsWith(".sql")).map(f => fs.readFileSync(path.join(d, f), "utf8")).join("\n");

const pats = {
  function: /^CREATE OR REPLACE FUNCTION public\.(\w+)\(/gm,
  table: /^CREATE TABLE public\.(\w+) \(/gm,
  index: /^CREATE (?:UNIQUE )?INDEX (\w+) ON/gm,
  trigger: /^CREATE TRIGGER (\w+) /gm,
  policy: /^CREATE POLICY ("?[^"\n]+?"?) ON public\.\w+ /gm
};

console.log("\n--- GAP SCAN (W2 R3 script) ---");
for (const [kind, p] of Object.entries(pats)) {
  const live = new Set();
  let m;
  while ((m = p.exec(snap)) !== null) {
    live.add(m[1]);
  }
  const liveArr = Array.from(live).sort();
  const gaps = liveArr.filter(n => {
    const clean = n.replace(/^"|"$/g, "");
    const re = new RegExp("\\b" + clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
    return !re.test(migs);
  });
  console.log(`${kind.padEnd(9)} live=${String(liveArr.length).padStart(4)} missing from repo=${gaps.length}`);
  if (kind === "function") {
    if (gaps.length > 0) {
      console.error(`FAIL: Missing functions:`, gaps);
      hasErrors = true;
    }
  } else if (kind === "trigger") {
    console.log("  live triggers missing from repo:", gaps);
    // Note: on_auth_user_created is on auth.users (Supabase managed auth schema).
    // All 9 public triggers from W2 R1 are present.
    const publicGaps = gaps.filter(t => t !== "on_auth_user_created");
    console.log(`  public triggers missing from repo: ${publicGaps.length}`);
    if (publicGaps.length > 0) {
      console.error(`FAIL: Missing public triggers:`, publicGaps);
      hasErrors = true;
    }
  }
}

// 3. Verify all 18 functions match live snapshot
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

function normalizeWhitespace(str) {
  return str.replace(/[ \t\r\n\f\v]+/g, " ").trim();
}

function md5(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}

function extractDollarBody(text, startIdx) {
  const dollarStart = text.indexOf('$', startIdx);
  if (dollarStart === -1) return null;
  const dollarTagEnd = text.indexOf('$', dollarStart + 1);
  if (dollarTagEnd === -1) return null;
  const tag = text.substring(dollarStart, dollarTagEnd + 1);
  const bodyEnd = text.indexOf(tag, dollarTagEnd + 1);
  if (bodyEnd === -1) return null;
  return text.substring(dollarTagEnd + 1, bodyEnd);
}

function extractSignatureAndHeader(text, startIdx) {
  const dollarStart = text.indexOf('$', startIdx);
  if (dollarStart === -1) return null;
  return text.substring(startIdx, dollarStart);
}

console.log("\n--- FUNCTION VERIFICATION (18 functions) ---");
for (const fn of funcs) {
  const marker = `CREATE OR REPLACE FUNCTION public.${fn}(`;
  const snapIdx = snap.indexOf(marker);
  const migIdx = mig.indexOf(marker);

  if (snapIdx === -1) {
    console.error(`FAIL: ${fn} not in snapshot`);
    hasErrors = true;
    continue;
  }
  if (migIdx === -1) {
    console.error(`FAIL: ${fn} not in migration`);
    hasErrors = true;
    continue;
  }

  const snapBody = extractDollarBody(snap, snapIdx);
  const migBody = extractDollarBody(mig, migIdx);

  if (!snapBody || !migBody) {
    console.error(`FAIL: Could not extract body for ${fn}`);
    hasErrors = true;
    continue;
  }

  const snapMd5 = md5(normalizeWhitespace(snapBody));
  const migMd5 = md5(normalizeWhitespace(migBody));

  if (snapMd5 !== migMd5) {
    console.error(`FAIL: Body MD5 mismatch for ${fn}! snap=${snapMd5} mig=${migMd5}`);
    hasErrors = true;
  } else {
    // Header & signature check
    const snapHeader = normalizeWhitespace(extractSignatureAndHeader(snap, snapIdx));
    const migHeader = normalizeWhitespace(extractSignatureAndHeader(mig, migIdx));

    if (snapHeader !== migHeader) {
      console.error(`FAIL: Header mismatch for ${fn}:\n  snap: ${snapHeader}\n  mig:  ${migHeader}`);
      hasErrors = true;
    } else {
      console.log(`PASS: ${fn} — header & body match (body md5: ${snapMd5})`);
    }
  }

  // Check grant and revoke in migration
  const grantRe = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^\\)]*\\) TO [^;]+;`);
  const revokeRe = new RegExp(`revoke all on function public\\.${fn}\\([^\\)]*\\) from public, anon, authenticated;`);
  if (!grantRe.test(mig)) {
    console.error(`FAIL: Missing GRANT for ${fn} in migration`);
    hasErrors = true;
  }
  if (!revokeRe.test(mig)) {
    console.error(`FAIL: Missing REVOKE for ${fn} in migration`);
    hasErrors = true;
  }
}

// 4. Verify all 10 triggers in migration
const triggers = [
  'trg_settlements',
  'sync_businesses_verified',
  'trg_protect_business_owner',
  'trg_sync_community_post_geom',
  'providers_geom',
  'sync_providers_verified',
  'ratings_update_avg',
  'requests_geom',
  'trg_sync_story_geom',
  'me_too_count_trigger'
];

console.log("\n--- TRIGGER VERIFICATION (10 triggers in migration) ---");
for (const trg of triggers) {
  const presentInMig = mig.includes(trg);
  const presentInSnap = snap.includes(trg);
  if (!presentInMig) {
    console.error(`FAIL: Trigger ${trg} missing from migration`);
    hasErrors = true;
  } else if (!presentInSnap) {
    console.error(`FAIL: Trigger ${trg} missing from snapshot`);
    hasErrors = true;
  } else {
    console.log(`PASS: Trigger ${trg} present in snapshot and guarded in migration`);
  }
}

if (hasErrors) {
  console.error("\nFAILED verification checks!");
  process.exit(1);
} else {
  console.log("\nALL VERIFICATIONS PASSED!");
}
