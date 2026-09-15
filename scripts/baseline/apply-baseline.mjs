// Applies a baseline file (from dump-baseline.mjs) or migration files to a NON-production project,
// item by item, through the Management API. Stops at the first error and prints which item failed.
//
// Hard guard: refuses the production ref, and refuses any ref other than the staging ref recorded in
// docs/plan/DECISIONS.md (D6), before sending anything.
//
// Usage:
//   node scripts/baseline/apply-baseline.mjs <staging ref> supabase/baseline/<date>_schema.sql [--from N]
//   node scripts/baseline/apply-baseline.mjs <staging ref> --migrations-after <version>
//   node scripts/baseline/apply-baseline.mjs <production ref> --dry-run   (prints the refusal, sends nothing)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROD = "gnswxlfmcwyhmzlfipql";
const [ref, target, ...rest] = process.argv.slice(2);

const decisions = fs.readFileSync(path.join(ROOT, "docs", "plan", "DECISIONS.md"), "utf8");
const staging = decisions.match(/\*\*D6\*\*[^\n]*ref:\s*([a-z0-9]{20})/)?.[1];
if (!ref) { console.error("usage: apply-baseline.mjs <staging ref> <file | --migrations-after VERSION> [--from N]"); process.exit(1); }
if (ref === PROD) { console.error(`REFUSED: ${ref} is PRODUCTION. This script never writes to production.`); process.exit(2); }
if (!staging || ref !== staging) { console.error(`REFUSED: ${ref} is not the staging ref recorded in DECISIONS.md D6 (${staging ?? "none found"}).`); process.exit(2); }
if (!target || target === "--dry-run") { console.log(`target ${ref} is staging; nothing to apply`); process.exit(0); }

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
async function run(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_PERSONAL_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  return { ok: r.ok, text: await r.text() };
}

let items = [];
if (target === "--migrations-after") {
  const after = rest[0];
  if (!/^\d{14}$/.test(after || "")) { console.error("--migrations-after needs a 14-digit ledger version"); process.exit(1); }
  console.error("Migration files are numbered 202609NN, not by ledger version; pass the list explicitly instead.");
  process.exit(1);
} else {
  const body = fs.readFileSync(path.resolve(ROOT, target), "utf8");
  const parts = body.split(/^-- @@item /m).slice(1);
  items = parts.map((p) => {
    const nl = p.indexOf("\n");
    return { label: p.slice(0, nl).trim(), sql: p.slice(nl + 1).trim() };
  }).filter((i) => i.sql);
}
const fromIdx = rest.includes("--from") ? Number(rest[rest.indexOf("--from") + 1]) : 0;
console.log(`target ${ref} (staging) | ${target} | ${items.length} items | starting at ${fromIdx}`);

// check_function_bodies is per session; prepend it to every function item.
const BATCH = 40;
for (let i = fromIdx; i < items.length; ) {
  const batch = [];
  while (i < items.length && batch.length < BATCH) batch.push(items[i++]);
  const sql = "set check_function_bodies = false;\n" + batch.map((b) => b.sql).join("\n\n");
  const res = await run(sql);
  if (!res.ok) {
    // re-run one by one to find the failing item
    for (const [k, b] of batch.entries()) {
      const one = await run("set check_function_bodies = false;\n" + b.sql);
      if (!one.ok) {
        const idx = i - batch.length + k;
        console.error(`FAILED at item ${idx} "${b.label}": ${one.text.slice(0, 400)}`);
        console.error(`resume after fixing with: --from ${idx}`);
        process.exit(3);
      }
    }
  }
  process.stdout.write(`  applied ${i}/${items.length}\r`);
}
console.log(`\ndone: ${items.length - fromIdx} items applied to ${ref}`);
