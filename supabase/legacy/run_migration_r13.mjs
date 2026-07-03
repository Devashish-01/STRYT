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

console.log(`→ Project Ref: ${ref}`);
try {
  const sql = readFileSync(join(__dirname, "migration_r13.sql"), "utf8");
  process.stdout.write("→ Running migration_r13.sql ... ");
  await runSql(sql);
  console.log("done");
  console.log("\n✓ Migration applied successfully!");
} catch (err) {
  console.log("FAILED");
  console.error(`\n✗ Error: ${err.message}\n`);
  process.exitCode = 1;
}
