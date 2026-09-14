import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const snapPath = path.join(ROOT, "supabase/snapshots/2026-09-13_after_20260958.sql");
const snap = fs.readFileSync(snapPath, "utf8");

const targetPrefixes = [
  "20260947", "20260948", "20260949", "20260950", "20260951",
  "20260952", "20260953", "20260954", "20260955", "20260956"
];

console.log("=== VERIFYING W3 PHASE 2 FIXES & ROLLBACKS ===");

// 1. Verify all 10 rollback files exist
const rollbackFiles = fs.readdirSync(path.join(ROOT, "supabase/rollbacks"));
let allRollbacksPresent = true;
for (const prefix of targetPrefixes) {
  const match = rollbackFiles.find(f => f.startsWith(prefix) && f.endsWith(".rollback.sql"));
  if (match) {
    console.log(`✓ Found rollback: ${match}`);
  } else {
    console.error(`✗ Missing rollback for ${prefix}!`);
    allRollbacksPresent = false;
  }
}

// 2. Check for missing search_path across all 10 migration files
let missingSearchPathCount = 0;
const migFiles = fs
  .readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => targetPrefixes.some(p => f.startsWith(p)) && f.endsWith(".sql"))
  .sort();

for (const file of migFiles) {
  const content = fs.readFileSync(path.join(ROOT, "supabase/migrations", file), "utf8");
  const funcRegex = /create or replace function public\.([a-zA-Z0-9_]+)\(([\s\S]*?)\)\s*(?:returns\s+([\s\S]*?))?\s*as\s+(\$[a-zA-Z0-9_]*\$)/gi;
  let m;
  while ((m = funcRegex.exec(content)) !== null) {
    const name = m[1];
    const tag = m[4];
    const bodyStart = funcRegex.lastIndex;
    const bodyEnd = content.indexOf(tag, bodyStart);
    let trailer = "";
    if (bodyEnd !== -1) {
      const semi = content.indexOf(";", bodyEnd + tag.length);
      if (semi !== -1) {
        trailer = content.substring(bodyEnd + tag.length, semi + 1);
      }
    }
    const header = content.substring(m.index, bodyStart - tag.length);
    const fullOptions = (header + " " + trailer).toLowerCase();
    const isSecDef = /security definer/.test(fullOptions);
    const hasSearchPath = /set search_path\b/.test(fullOptions);

    if (isSecDef && !hasSearchPath) {
      console.error(`✗ [${file}] ${name} is SECURITY DEFINER but missing search_path!`);
      missingSearchPathCount++;
    }
  }
}

if (missingSearchPathCount === 0) {
  console.log("\n✓ All SECURITY DEFINER functions in all 10 migrations have search_path pinned!");
}

// 3. Check agreement_claim_payment signature in 20260955
const mig20260955 = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260955_proposal_notifications_v2.sql"), "utf8");
if (mig20260955.includes("agreement_claim_payment(\n  p_id text,\n  p_method text,\n  p_amount integer default null,\n  p_reference text default null\n)")) {
  console.log("✓ agreement_claim_payment signature verified with 4 arguments!");
} else {
  console.error("✗ agreement_claim_payment signature mismatch!");
}

if (mig20260955.includes("revoke execute on function public.agreement_claim_payment(text, text, integer, text) from public, anon;")) {
  console.log("✓ agreement_claim_payment revoke verified with (text, text, integer, text)!");
} else {
  console.error("✗ agreement_claim_payment revoke mismatch!");
}

// 4. Check brand-new functions in 20260954
const mig20260954 = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260954_discovery_notifications_v2.sql"), "utf8");
if (mig20260954.includes("revoke execute on function public.broadcast_offer_to_nearby(text, double precision) from public, anon;")) {
  console.log("✓ broadcast_offer_to_nearby revokes from public, anon verified!");
} else {
  console.error("✗ broadcast_offer_to_nearby revoke mismatch!");
}

if (mig20260954.includes("revoke execute on function public.broadcast_new_listing(text, text) from public, anon;")) {
  console.log("✓ broadcast_new_listing revokes from public, anon verified!");
} else {
  console.error("✗ broadcast_new_listing revoke mismatch!");
}

console.log("\nPhase 2 verification script complete.");
