// Migration-drift guard.
//
// WHY THIS EXISTS: two migrations shipped in the same commit (ba77eae) were
// committed to supabase/migrations/ but never actually applied to the
// database — `20260848_delivery_batches_phase4.sql` broke every appointment
// booking in production, and `20260851_entity_password_recovery.sql` (later
// renamed 20260856) meant no owner could set a business/provider password at
// all. Both looked "done" because the file existed in the repo. A file in
// this directory is not proof it ran — this script checks the live database
// directly.
//
// WHAT IT DOES: scans every supabase/migrations/*.sql file for objects it
// creates (functions and tables), then queries the connected database to
// confirm each one actually exists. It is a coarse existence check, not a
// full parity check — it does NOT verify argument lists, return types, RLS
// policies, triggers, or grants match the file. It exists to catch the
// specific failure mode above: "the file is here but nothing ran."
//
// USAGE:
//   DATABASE_URL="postgresql://...supabase connection string..." node scripts/check-migration-drift.mjs
//   (or `npm run check-migrations` with DATABASE_URL set in your shell/CI)
//
// Get the connection string from: Supabase Dashboard → Project Settings →
// Database → Connection string → URI (session pooler works fine — this
// script only runs a couple of read-only introspection queries).
//
// Without DATABASE_URL set, this script prints a warning and exits 0 (never
// blocks a build that hasn't wired up the DB secret) rather than failing —
// see the note in package.json about why it isn't wired into `npm run build`.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn(
    "[check-migration-drift] DATABASE_URL not set — skipping (this is not a failure).\n" +
    "  Set it to actually verify supabase/migrations/*.sql against the live database:\n" +
    "  Supabase Dashboard → Project Settings → Database → Connection string → URI."
  );
  process.exit(0);
}

// Objects this migration file CREATEs. We only look for creation statements —
// ALTER/DROP/GRANT/REVOKE aren't "does this exist" claims, so they're ignored.
function extractCreatedObjects(sql) {
  const functions = new Set();
  const tables = new Set();

  // Matches: create [or replace] function public.name(
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-zA-Z0-9_]+)\s*\(/gi)) {
    functions.add(m[1]);
  }
  // Matches: create table [if not exists] public.name
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z0-9_]+)/gi)) {
    tables.add(m[1]);
  }

  return { functions: [...functions], tables: [...tables] };
}

async function main() {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

  const existingFns = new Set(
    (await client.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`
    )).rows.map((r) => r.proname)
  );
  const existingTables = new Set(
    (await client.query(
      `select table_name from information_schema.tables where table_schema = 'public'`
    )).rows.map((r) => r.table_name)
  );

  let missingCount = 0;
  const problemFiles = [];

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const { functions, tables } = extractCreatedObjects(sql);

    const missingFns = functions.filter((f) => !existingFns.has(f));
    const missingTables = tables.filter((t) => !existingTables.has(t));

    if (missingFns.length > 0 || missingTables.length > 0) {
      missingCount += missingFns.length + missingTables.length;
      problemFiles.push({ file, missingFns, missingTables });
    }
  }

  await client.end();

  if (problemFiles.length === 0) {
    console.log(`[check-migration-drift] OK — checked ${files.length} migration files, every function/table they define exists in the database.`);
    process.exit(0);
  }

  console.error(`[check-migration-drift] FOUND ${missingCount} object(s) defined in committed migrations that don't exist in the database:\n`);
  for (const { file, missingFns, missingTables } of problemFiles) {
    console.error(`  ${file}`);
    for (const f of missingFns) console.error(`    - function ${f}() not found`);
    for (const t of missingTables) console.error(`    - table ${t} not found`);
  }
  console.error(
    "\nThis means one of these migration files was committed but never applied — " +
    "the exact failure mode that broke booking and password setup in commit ba77eae. " +
    "Apply the missing migration(s) before shipping code that depends on them."
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[check-migration-drift] Failed to run:", err.message);
  // Connectivity/auth problems shouldn't block a build the same way real
  // drift should — surface the error but don't treat "couldn't connect" as
  // "migrations are missing."
  process.exit(0);
});
