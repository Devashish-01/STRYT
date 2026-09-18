#!/usr/bin/env node
/**
 * Applies the pending release migrations to PRODUCTION, one at a time, in order — for the OWNER to run.
 * (RELEASE_RUNBOOK part 1. The agent is not permitted to run production changes; this script is how the owner
 * does it in one command instead of nineteen.)
 *
 *   node scripts/release/apply-production-migrations.mjs --backup <folder>            # dry run: shows the plan
 *   node scripts/release/apply-production-migrations.mjs --backup <folder> --apply    # applies
 *
 * --backup is required: the folder of a fresh `node scripts/export-live-data.mjs <folder> --verify` run. It is
 * the only way back, so the script refuses to start without one that exists.
 *
 * For each migration still missing on production, in file order:
 *   1. its file must match the sha256 recorded for it in supabase/APPLY_LOG.md — a changed file stops everything;
 *   2. it is applied through the Management API migrations endpoint with name = file name (what MCP
 *      apply_migration does; never pasted SQL, APPLY_LOG rule 3);
 *   3. the ledger row must then exist on production.
 * The first failure stops the run: nothing after it is applied, and the message says where it stopped.
 *
 * It does not run the forced-rollback tests of HANDOFF §5 — the owner chose to apply directly (19 Sept 2026).
 * Needs SUPABASE_PERSONAL_ACCESS_TOKEN in .env.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const PRODUCTION = "gnswxlfmcwyhmzlfipql";
const FIRST = "20260973";
const LAST = "20260991";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const backup = args[args.indexOf("--backup") + 1];
if (!args.includes("--backup") || !backup || backup.startsWith("--") || !existsSync(backup) || readdirSync(backup).length === 0) {
  console.error("REFUSED: pass --backup <folder> — a fresh, non-empty export from scripts/export-live-data.mjs --verify.");
  process.exit(2);
}

const env = readFileSync(".env", "utf8").split(/\r?\n/);
const pat = env.map((l) => l.match(/^\s*SUPABASE_PERSONAL_ACCESS_TOKEN\s*=\s*"?([^"]*)"?\s*$/)).find(Boolean)?.[1];
if (!pat) {
  console.error("SUPABASE_PERSONAL_ACCESS_TOKEN is not set in .env");
  process.exit(2);
}
const api = (path, body) =>
  fetch(`https://api.supabase.com/v1/projects/${PRODUCTION}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
async function query(sql) {
  const r = await api("/database/query", { query: sql });
  const text = await r.text();
  if (!r.ok) throw new Error(`query failed (HTTP ${r.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// The release set, from the files themselves.
const files = readdirSync("supabase/migrations")
  .filter((f) => /^\d{8}_.+\.sql$/.test(f) && f.slice(0, 8) >= FIRST && f.slice(0, 8) <= LAST)
  .sort();
const log = readFileSync("supabase/APPLY_LOG.md", "utf8");
const recorded = (file) => log.match(new RegExp("`supabase/migrations/" + file.replace(/\./g, "\\.") + "`<br>sha256 `([0-9a-f]{64})`"))?.[1];

const applied = new Set(
  (await query("set transaction read only; select name from supabase_migrations.schema_migrations")).map((r) => r.name),
);
const pending = files.filter((f) => !applied.has(f.replace(/\.sql$/, "")));

console.log(`Production ${PRODUCTION}: ${files.length - pending.length} of ${files.length} release migrations already applied.`);
if (pending.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}
// Applying out of order would skip a migration that a later one depends on.
const firstPendingIndex = files.indexOf(pending[0]);
if (files.slice(firstPendingIndex).some((f) => !pending.includes(f))) {
  console.error("REFUSED: a later migration is applied while an earlier one is not. Stop and look at the ledger.");
  process.exit(2);
}

for (const file of pending) {
  const want = recorded(file);
  const got = createHash("sha256").update(readFileSync(`supabase/migrations/${file}`)).digest("hex");
  const ok = want === got;
  console.log(`${ok ? "  " : "!!"} ${file}  ${ok ? "hash matches APPLY_LOG" : `HASH MISMATCH (log ${want ?? "none"}, file ${got})`}`);
  if (!ok) {
    console.error("\nREFUSED: a file differs from what was tested on staging. Nothing was applied.");
    process.exit(1);
  }
}

if (!apply) {
  console.log(`\nDry run. ${pending.length} migration(s) would be applied in the order above. Add --apply to apply them.`);
  process.exit(0);
}

console.log(`\nApplying ${pending.length} migration(s) to PRODUCTION. Backup: ${backup}\n`);
for (const file of pending) {
  const name = file.replace(/\.sql$/, "");
  const started = Date.now();
  const r = await api("/database/migrations", { query: readFileSync(`supabase/migrations/${file}`, "utf8"), name });
  const text = await r.text();
  if (!r.ok) {
    console.error(`FAILED ${name} (HTTP ${r.status}): ${text.slice(0, 500)}`);
    console.error(`\nStopped. ${name} and everything after it are NOT applied. Earlier ones are.`);
    process.exit(1);
  }
  const [row] = await query(
    `set transaction read only; select version from supabase_migrations.schema_migrations where name = '${name}'`,
  );
  if (!row) {
    console.error(`FAILED ${name}: applied without error, but no ledger row. Stopped.`);
    process.exit(1);
  }
  console.log(`applied ${name}  ledger ${row.version}  (${Date.now() - started} ms)`);
}
await query("notify pgrst, 'reload schema'");
console.log("\nAll applied. Next (RELEASE_RUNBOOK): snapshot after (1.4), move the rows in supabase/APPLY_LOG.md from Pending to applied with these ledger versions, run the security advisor, then part 2 (functions).");
