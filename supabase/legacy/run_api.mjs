// Runs the SQL files against your Supabase project via the Management API
// (the same API the Supabase MCP server uses). Reads SUPABASE_AT and the
// project ref from .env so no secret is hard-coded here.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readEnv() {
  const envPath = join(__dirname, "..", "..", ".env");
  const out = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

const env = readEnv();
const token = env.SUPABASE_AT;
const urlMatch = (env.VITE_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
const ref = urlMatch?.[1];

if (!token || !ref) {
  console.error("✗ Need SUPABASE_AT and VITE_SUPABASE_URL in .env");
  process.exit(1);
}

const FILES = [
  "schema.sql",
  "functions.sql",
  "rls.sql",
  "seed_core.sql",
  "seed_listings.sql",
  "migration_writes.sql",
];

const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function runSql(query) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text;
}

console.log(`→ Project: ${ref}\n`);
for (const file of FILES) {
  const sql = readFileSync(join(__dirname, file), "utf8");
  process.stdout.write(`→ Running ${file} ... `);
  try {
    await runSql(sql);
    console.log("done");
  } catch (err) {
    console.log("FAILED");
    console.error(`\n✗ ${file}: ${err.message}\n`);
    process.exit(1);
  }
}
console.log("\n✓ All SQL files ran successfully.");
