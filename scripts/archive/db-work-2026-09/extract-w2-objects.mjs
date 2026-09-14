import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const snapshot = fs.readFileSync(path.join(ROOT, "supabase/snapshots/2026-09-11_after_20260957.sql"), "utf8");

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

console.log("=== EXTRACTING FUNCTIONS ===");
const funcDefs = {};

// In snapshot, functions are in section "-- Functions"
// separated by "\n\n" or ending with "$$;"
for (const f of funcs) {
  const target = `CREATE OR REPLACE FUNCTION public.${f}(`;
  const idx = snapshot.indexOf(target);
  if (idx === -1) {
    console.error("Could not find:", target);
    continue;
  }
  // Find the end of function definition ($$;)
  const endIdx = snapshot.indexOf("$$;", idx);
  if (endIdx === -1) {
    console.error("Could not find end of:", target);
    continue;
  }
  const def = snapshot.substring(idx, endIdx + 3);
  funcDefs[f] = def;
}

console.log("Extracted", Object.keys(funcDefs).length, "functions.");

// Also find grants for each function
console.log("=== EXTRACTING GRANTS ===");
const grantDefs = {};
for (const f of funcs) {
  const grantTarget = `GRANT EXECUTE ON FUNCTION public.${f}(`;
  const gIdx = snapshot.indexOf(grantTarget);
  if (gIdx !== -1) {
    const gEnd = snapshot.indexOf(";", gIdx);
    grantDefs[f] = snapshot.substring(gIdx, gEnd + 1);
  } else {
    grantDefs[f] = `-- No explicit grant found for ${f}`;
  }
}

// Extract trigger
console.log("=== EXTRACTING TRIGGER ===");
let triggerDef = "";
const tIdx = snapshot.indexOf("CREATE TRIGGER me_too_count_trigger");
if (tIdx !== -1) {
  const tEnd = snapshot.indexOf(";", tIdx);
  triggerDef = snapshot.substring(tIdx, tEnd + 1);
}

// Extract indexes
console.log("=== EXTRACTING INDEXES ===");
const indexes = [
  'business_access_sessions_biz_status_idx',
  'business_view_logs_biz_time'
];
const indexDefs = {};
for (const idxName of indexes) {
  const iIdx = snapshot.indexOf(` ${idxName} ON `);
  if (iIdx !== -1) {
    const lineStart = snapshot.lastIndexOf("\n", iIdx);
    const lineEnd = snapshot.indexOf(";", iIdx);
    indexDefs[idxName] = snapshot.substring(lineStart + 1, lineEnd + 1);
  }
}

// Extract policies
console.log("=== EXTRACTING POLICIES ===");
const policies = [
  'upd_users',
  'mem_read',
  'mem_update',
  'queue_tokens_select_all'
];
const policyDefs = {};
for (const polName of policies) {
  const pTarget = `CREATE POLICY ${polName} ON `;
  const pIdx = snapshot.indexOf(pTarget);
  if (pIdx !== -1) {
    const pEnd = snapshot.indexOf(";", pIdx);
    policyDefs[polName] = snapshot.substring(pIdx, pEnd + 1);
  }
}

// Write out extracted raw data to a json or report for inspection
const report = {
  funcs: funcDefs,
  grants: grantDefs,
  trigger: triggerDef,
  indexes: indexDefs,
  policies: policyDefs
};

fs.writeFileSync(path.join(ROOT, "docs/database/extracted_w2_raw.json"), JSON.stringify(report, null, 2));
console.log("Report saved to docs/database/extracted_w2_raw.json");
