// One-shot runner: executes the SQL files against your Supabase Postgres in
// the correct order. Reads the connection string from SUPABASE_DB_URL so the
// secret never lives in this file.
//
// Usage (PowerShell):
//   $env:SUPABASE_DB_URL="postgresql://postgres:PASS@db.xxxx.supabase.co:5432/postgres"
//   node supabase/run.mjs
//   Remove-Item Env:SUPABASE_DB_URL
//
// Or put SUPABASE_DB_URL=... in .env (gitignored) and this will pick it up.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Allow the connection string to come from .env as a fallback.
function loadDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL.trim();
  const envPath = join(__dirname, "..", ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.+)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
  }
  return null;
}

const FILES = [
  "schema.sql",
  "functions.sql",
  "rls.sql",
  "seed_core.sql",
  "seed_listings.sql",
  "migration_writes.sql",
];

const dbUrl = loadDbUrl();
if (!dbUrl) {
  console.error(
    "\n✗ No connection string found.\n" +
      "  Set SUPABASE_DB_URL (env var) or add a SUPABASE_DB_URL=... line to .env.\n" +
      "  Get it from Supabase: Project Settings -> Database -> Connection string (URI).\n"
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }, // Supabase requires SSL
});

try {
  await client.connect();
  console.log("✓ Connected to database\n");
  for (const file of FILES) {
    const path = join(__dirname, file);
    const sql = readFileSync(path, "utf8");
    process.stdout.write(`→ Running ${file} ... `);
    await client.query(sql);
    console.log("done");
  }
  console.log("\n✓ All SQL files ran successfully.");
} catch (err) {
  console.error(`\n✗ Failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
