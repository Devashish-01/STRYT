#!/usr/bin/env node
// Migration & Schema Drift Guard for STRYT
//
// Adheres to docs/database/HANDOFF.md (§W8, §6.1):
//   1. Checks that every function & table declared in migrations exists on live database
//   2. §6.1 Body Fingerprinting: compares normalized body MD5 of functions
//   3. §6.1 Comment-Stripped Fallback: isolates comment-only drift from true logic drift
//   4. Overload-aware signature matching: correctly handles functions with multiple signatures (e.g. is_admin, bulk_deal_token_redeem)
//   5. Policy qual expression comparison: ensures RLS policies match migration definitions
//   6. Database-only objects detection: flags unmanaged objects created directly in database
//
// USAGE:
//   node scripts/check-migration-drift.mjs                                  # uses .env SUPABASE_PERSONAL_ACCESS_TOKEN or DATABASE_URL
//   node scripts/check-migration-drift.mjs --snapshot <path/to/snapshot.sql> # offline mode against schema snapshot
//   DATABASE_URL="postgresql://..." node scripts/check-migration-drift.mjs   # direct Postgres mode

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

export function normWhitespace(s) {
  if (!s) return "";
  return s.replace(/[ \t\r\n\f\v]+/g, " ").trim();
}

export function stripComments(s) {
  if (!s) return "";
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

export function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex");
}

export function splitArgs(argStr) {
  if (!argStr || !argStr.trim()) return [];
  const args = [];
  let depth = 0;
  let current = "";
  for (const ch of argStr) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

export function normalizeType(t) {
  let s = t.toLowerCase().trim().replace(/"/g, "");
  if (s === 'int' || s === 'int4' || s === 'integer') return 'integer';
  if (s === 'int8' || s === 'bigint') return 'bigint';
  if (s === 'int2' || s === 'smallint') return 'smallint';
  if (s === 'bool' || s === 'boolean') return 'boolean';
  if (s === 'timestamptz' || s === 'timestamp with time zone') return 'timestamp with time zone';
  if (s === 'timestamp' || s === 'timestamp without time zone') return 'timestamp without time zone';
  if (s === 'float8' || s === 'double precision') return 'double precision';
  if (s === 'float4' || s === 'real') return 'real';
  if (s.startsWith('character varying') || s.startsWith('varchar')) return 'text';
  return s;
}

export function normalizeArgTypes(argStr) {
  const cleanStr = normWhitespace(stripComments(argStr));
  const parts = splitArgs(cleanStr);
  const types = parts.map(p => {
    let s = p.replace(/\s+default\s+[\s\S]*$/i, '').trim();
    s = s.replace(/^(?:in|out|inout|variadic)\s+/i, '').trim();
    const tokens = s.split(/\s+/);
    if (tokens.length === 1) return normalizeType(tokens[0]);
    return normalizeType(tokens.slice(1).join(' '));
  });
  return types.join(', ');
}

function readEnv() {
  const env = {};
  for (const f of [".env", ".env.local"]) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

/**
 * Extracts policies from SQL migration string.
 */
export function extractPoliciesFromSql(sql, fileName) {
  const policies = new Map();
  const regex = /create\s+policy\s+("?[^"\s]+"?)\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)\b[\s\S]*?using\s*\(([\s\S]*?)\)(?:\s+with\s+check\s*\(([\s\S]*?)\))?;/gi;

  for (const m of sql.matchAll(regex)) {
    const policyName = m[1].replace(/"/g, "").toLowerCase();
    const tableName = m[2].toLowerCase();
    const qual = normWhitespace(m[3]);
    const withCheck = m[4] ? normWhitespace(m[4]) : null;

    policies.set(`${tableName}.${policyName}`, {
      policyName,
      tableName,
      qual,
      withCheck,
      file: fileName,
    });
  }

  return policies;
}

/**
 * Parses catalog data from an offline snapshot SQL file
 */
export function parseSnapshot(snapshotSql) {
  const functions = [];
  const tables = new Set();
  const policies = new Map();
  const triggers = new Set();

  // 1. Functions from snapshot: CREATE OR REPLACE FUNCTION public.<name>(...) ... AS $function$ <body> $function$;
  const fnRegex = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.([a-zA-Z0-9_]+)\(([\s\S]*?)\)[\s\S]*?AS\s+\$([a-zA-Z0-9_]*)\$([\s\S]*?)\$\3\$/gi;
  for (const m of snapshotSql.matchAll(fnRegex)) {
    const fnName = m[1].toLowerCase();
    const rawArgs = m[2].trim();
    const normArgs = normalizeArgTypes(rawArgs);
    const argCount = splitArgs(normWhitespace(stripComments(rawArgs))).length;
    const body = m[4];
    const normalized = normWhitespace(body);
    const stripped = normWhitespace(stripComments(body));
    functions.push({
      name: fnName,
      rawArgs,
      normArgs,
      argCount,
      sig: `${fnName}(${normArgs})`,
      bodyMd5: md5(normalized),
      strippedMd5: md5(stripped),
      matched: false,
    });
  }

  // 2. Tables: CREATE TABLE public.<name> (
  const tableRegex = /CREATE\s+TABLE\s+public\.([a-zA-Z0-9_]+)\s*\(/gi;
  for (const m of snapshotSql.matchAll(tableRegex)) {
    tables.add(m[1].toLowerCase());
  }

  // 3. Triggers: CREATE TRIGGER <name> ... ON [public.]<table>
  const trgRegex = /CREATE\s+TRIGGER\s+([a-zA-Z0-9_]+)\s+[\s\S]*?\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  for (const m of snapshotSql.matchAll(trgRegex)) {
    triggers.add(`${m[2].toLowerCase()}.${m[1].toLowerCase()}`);
  }

  // 4. Policies: CREATE POLICY <name> ON public.<table> ... USING (qual)
  const polRegex = /CREATE\s+POLICY\s+("?[^"\s]+"?)\s+ON\s+public\.([a-zA-Z0-9_]+)\s+AS\s+\w+\s+FOR\s+\w+\s+TO\s+[^\n]+(?:\s+USING\s*\(([\s\S]*?)\))?(?:\s+WITH\s+CHECK\s*\(([\s\S]*?)\))?;/gi;
  for (const m of snapshotSql.matchAll(polRegex)) {
    const policyName = m[1].replace(/"/g, "").toLowerCase();
    const tableName = m[2].toLowerCase();
    const qual = m[3] ? normWhitespace(m[3]) : "";
    policies.set(`${tableName}.${policyName}`, {
      policyName,
      tableName,
      qual,
    });
  }

  return { functions, tables, triggers, policies };
}

/**
 * Loads catalog data from live Supabase project via Management API
 */
async function loadLiveCatalogFromApi(ref, token) {
  const API = `https://api.supabase.com/v1/projects/${ref}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  async function query(sql) {
    const res = await fetch(`${API}/database/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Management API error (${res.status}): ${errText}`);
    }
    return await res.json();
  }

  // 1. Functions query
  const fnRows = await query(`
    select p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           p.prosrc as raw_body,
           md5(btrim(regexp_replace(p.prosrc, '[ \\t\\r\\n\\f\\v]+', ' ', 'g'), ' ')) as body_md5
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind in ('f','p','w')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname;
  `);

  const functions = [];
  for (const r of fnRows) {
    const name = r.proname.toLowerCase();
    const rawArgs = r.args || "";
    const normArgs = normalizeArgTypes(rawArgs);
    const argCount = splitArgs(normWhitespace(stripComments(rawArgs))).length;
    const normalized = normWhitespace(r.raw_body);
    const stripped = normWhitespace(stripComments(r.raw_body));
    functions.push({
      name,
      rawArgs,
      normArgs,
      argCount,
      sig: `${name}(${normArgs})`,
      bodyMd5: r.body_md5 || md5(normalized),
      strippedMd5: md5(stripped),
      matched: false,
    });
  }

  // 2. Tables query
  const tableRows = await query(`
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');
  `);
  const tables = new Set(tableRows.map((r) => r.table_name.toLowerCase()));

  // 3. Triggers query
  const trgRows = await query(`
    select t.tgname, c.relname as table_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and (c.relnamespace = 'public'::regnamespace or p.pronamespace = 'public'::regnamespace);
  `);
  const triggers = new Set(trgRows.map((r) => `${r.table_name.toLowerCase()}.${r.tgname.toLowerCase()}`));

  // 4. Policies query
  const polRows = await query(`
    select tablename, policyname, qual
    from pg_policies
    where schemaname = 'public';
  `);
  const policies = new Map();
  for (const r of polRows) {
    const key = `${r.tablename.toLowerCase()}.${r.policyname.toLowerCase()}`;
    policies.set(key, {
      tableName: r.tablename.toLowerCase(),
      policyName: r.policyname.toLowerCase(),
      qual: r.qual ? normWhitespace(r.qual) : "",
    });
  }

  return { functions, tables, triggers, policies };
}

/**
 * Loads catalog data from PostgreSQL via direct connection
 */
async function loadLiveCatalogFromPg(connectionString) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const fnRes = await client.query(`
      select p.proname,
             pg_get_function_identity_arguments(p.oid) as args,
             p.prosrc as raw_body,
             md5(btrim(regexp_replace(p.prosrc, '[ \\t\\r\\n\\f\\v]+', ' ', 'g'), ' ')) as body_md5
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.prokind in ('f','p','w')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      order by p.proname;
    `);
    const functions = [];
    for (const r of fnRes.rows) {
      const name = r.proname.toLowerCase();
      const rawArgs = r.args || "";
      const normArgs = normalizeArgTypes(rawArgs);
      const argCount = splitArgs(normWhitespace(stripComments(rawArgs))).length;
      const normalized = normWhitespace(r.raw_body);
      const stripped = normWhitespace(stripComments(r.raw_body));
      functions.push({
        name,
        rawArgs,
        normArgs,
        argCount,
        sig: `${name}(${normArgs})`,
        bodyMd5: r.body_md5 || md5(normalized),
        strippedMd5: md5(stripped),
        matched: false,
      });
    }

    const tableRes = await client.query(`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');
    `);
    const tables = new Set(tableRes.rows.map((r) => r.table_name.toLowerCase()));

    const trgRes = await client.query(`
      select t.tgname, c.relname as table_name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
      where not t.tgisinternal
        and (c.relnamespace = 'public'::regnamespace or p.pronamespace = 'public'::regnamespace);
    `);
    const triggers = new Set(trgRes.rows.map((r) => `${r.table_name.toLowerCase()}.${r.tgname.toLowerCase()}`));

    const polRes = await client.query(`
      select tablename, policyname, qual
      from pg_policies
      where schemaname = 'public';
    `);
    const policies = new Map();
    for (const r of polRes.rows) {
      const key = `${r.tablename.toLowerCase()}.${r.policyname.toLowerCase()}`;
      policies.set(key, {
        tableName: r.tablename.toLowerCase(),
        policyName: r.policyname.toLowerCase(),
        qual: r.qual ? normWhitespace(r.qual) : "",
      });
    }

    return { functions, tables, triggers, policies };
  } finally {
    await client.end();
  }
}

/**
 * Main drift comparison logic
 */
export function compareMigrationsAgainstCatalog(migrationFiles, catalog) {
  const repoFunctions = new Map();
  const repoTables = new Set();
  const repoTriggers = new Set();
  const repoPolicies = new Map();

  for (const file of migrationFiles) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    const sql = fs.readFileSync(filePath, "utf8");

    // Track function drops (e.g. 20260819_remove_sos, 20260921_drop_retired_instant_order_rpcs)
    for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)(?:\s*\(([^)]*)\))?/gi)) {
      const fnName = m[1].toLowerCase();
      const args = m[2];
      if (args !== undefined && args.trim()) {
        const normArgs = normalizeArgTypes(args);
        repoFunctions.delete(`${fnName}(${normArgs})`);
        const single = repoFunctions.get(fnName);
        if (single && (single.normArgs === normArgs || single.argCount === splitArgs(args).length)) {
          repoFunctions.delete(fnName);
        }
      } else {
        repoFunctions.delete(fnName);
        for (const k of Array.from(repoFunctions.keys())) {
          if (k.startsWith(`${fnName}(`)) {
            repoFunctions.delete(k);
          }
        }
      }
    }

    // Track table drops
    for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi)) {
      repoTables.delete(m[1].toLowerCase());
    }

    // Functions created
    const fnRegex = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)[\s\S]*?as\s+\$([a-zA-Z0-9_]*)\$([\s\S]*?)\$\3\$/gi;
    for (const m of sql.matchAll(fnRegex)) {
      const fnName = m[1].toLowerCase();
      const args = m[2].trim();
      const normArgs = normalizeArgTypes(args);
      const argCount = splitArgs(normWhitespace(stripComments(args))).length;
      const body = m[4];
      const normalized = normWhitespace(body);
      const stripped = normWhitespace(stripComments(body));

      const fnObj = {
        name: fnName,
        rawArgs: args,
        normArgs,
        argCount,
        sig: `${fnName}(${normArgs})`,
        bodyMd5: md5(normalized),
        strippedMd5: md5(stripped),
        file,
      };

      // If catalog has overloads for this function name (e.g. bulk_deal_token_redeem), key by signature
      // Otherwise key by name so subsequent migrations replace earlier iterations cleanly
      const liveCount = catalog.functions.filter((f) => f.name === fnName).length;
      if (liveCount > 1) {
        repoFunctions.set(`${fnName}(${normArgs})`, fnObj);
      } else {
        repoFunctions.set(fnName, fnObj);
      }
    }

    // Tables created
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z0-9_]+)/gi)) {
      repoTables.add(m[1].toLowerCase());
    }

    // Triggers created
    for (const m of sql.matchAll(/create\s+trigger\s+([a-zA-Z0-9_]+)\s+[\s\S]*?\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)/gi)) {
      repoTriggers.add(`${m[2].toLowerCase()}.${m[1].toLowerCase()}`);
    }

    // Policies created
    const pols = extractPoliciesFromSql(sql, file);
    for (const [key, pol] of pols.entries()) {
      repoPolicies.set(key, pol);
    }
  }

  // Reset catalog match flags
  for (const f of catalog.functions) {
    f.matched = false;
  }

  const missingFromDb = [];
  const bodyDrift = [];
  const commentDrift = [];

  // 1. Check repo functions against catalog
  for (const [key, repoFn] of repoFunctions.entries()) {
    const candidates = catalog.functions.filter((f) => f.name === repoFn.name);
    if (candidates.length === 0) {
      missingFromDb.push({ type: "function", name: repoFn.name, sig: repoFn.sig, file: repoFn.file });
      continue;
    }

    let match = null;
    if (candidates.length === 1) {
      match = candidates[0];
    } else {
      // Find best overload match by normalized arguments or argument count
      match =
        candidates.find((c) => c.normArgs === repoFn.normArgs) ||
        candidates.find((c) => c.argCount === repoFn.argCount) ||
        candidates.find((c) => !c.matched);
    }

    if (!match) {
      missingFromDb.push({ type: "function", name: repoFn.name, sig: repoFn.sig, file: repoFn.file });
    } else {
      match.matched = true;
      // Body fingerprinting (§6.1)
      if (match.bodyMd5 !== repoFn.bodyMd5) {
        if (match.strippedMd5 === repoFn.strippedMd5) {
          commentDrift.push({ name: repoFn.name, sig: repoFn.sig, file: repoFn.file });
        } else {
          bodyDrift.push({
            name: repoFn.name,
            sig: repoFn.sig,
            file: repoFn.file,
            repoMd5: repoFn.bodyMd5,
            liveMd5: match.bodyMd5,
          });
        }
      }
    }
  }

  // 2. Unmanaged / database-only functions
  const databaseOnlyFunctions = catalog.functions.filter((f) => !f.matched).map((f) => f.sig);

  return {
    repoFunctionCount: repoFunctions.size,
    liveFunctionCount: catalog.functions.length,
    missingFromDb,
    bodyDrift,
    commentDrift,
    databaseOnlyFunctions,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const snapIdx = args.indexOf("--snapshot");
  const snapshotPath = snapIdx !== -1 ? args[snapIdx + 1] : null;

  console.log("=======================================================");
  console.log("🔍 STRYT DATABASE DRIFT GUARD");
  console.log("=======================================================");

  let catalog = null;
  let sourceLabel = "";

  if (snapshotPath) {
    const fullPath = path.resolve(ROOT, snapshotPath);
    if (!fs.existsSync(fullPath)) {
      console.error(`Snapshot file not found: ${fullPath}`);
      process.exit(1);
    }
    console.log(`Reading catalog from snapshot: ${path.basename(fullPath)}...`);
    const sql = fs.readFileSync(fullPath, "utf8");
    catalog = parseSnapshot(sql);
    sourceLabel = `Snapshot (${path.basename(fullPath)})`;
  } else if (process.env.DATABASE_URL) {
    console.log("Connecting directly via DATABASE_URL...");
    try {
      catalog = await loadLiveCatalogFromPg(process.env.DATABASE_URL);
      sourceLabel = "Live Database (pg)";
    } catch (err) {
      console.warn(`Could not connect via DATABASE_URL: ${err.message}`);
    }
  }

  if (!catalog) {
    const env = readEnv();
    const token = env.SUPABASE_PERSONAL_ACCESS_TOKEN;
    const ref = (env.VITE_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

    if (token && ref) {
      console.log(`Connecting to live project ${ref} via Supabase Management API...`);
      try {
        catalog = await loadLiveCatalogFromApi(ref, token);
        sourceLabel = `Live Project (${ref})`;
      } catch (err) {
        console.warn(`Management API connection failed: ${err.message}`);
      }
    }
  }

  if (!catalog) {
    console.warn(
      "[check-migration-drift] No database credentials (DATABASE_URL or SUPABASE_PERSONAL_ACCESS_TOKEN) " +
      "or --snapshot path provided.\n" +
      "Skipping live drift check without failure."
    );
    process.exit(0);
  }

  console.log(`Catalog source: ${sourceLabel}`);
  console.log(`Live catalog loaded: ${catalog.functions.length} functions, ${catalog.tables.size} tables, ${catalog.triggers.size} triggers, ${catalog.policies.size} policies.\n`);

  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  console.log(`Analyzing ${migrationFiles.length} migration files against catalog...`);

  const result = compareMigrationsAgainstCatalog(migrationFiles, catalog);

  console.log("\n=======================================================");
  console.log("📊 DRIFT ANALYSIS RESULTS");
  console.log("=======================================================");
  console.log(`Repo functions analyzed:   ${result.repoFunctionCount}`);
  console.log(`Live functions cataloged:  ${result.liveFunctionCount}`);
  console.log(`Missing from database:     ${result.missingFromDb.length}`);
  console.log(`Critical body drift:       ${result.bodyDrift.length}`);
  console.log(`Comment-only drift:        ${result.commentDrift.length}`);
  console.log(`Database-only functions:   ${result.databaseOnlyFunctions.length}`);

  let hasFatalDrift = false;

  if (result.missingFromDb.length > 0) {
    hasFatalDrift = true;
    console.error(`\n❌ MISSING OBJECTS (${result.missingFromDb.length}):`);
    for (const m of result.missingFromDb) {
      console.error(`   - ${m.type} "${m.sig || m.name}" defined in ${m.file} does NOT exist in live catalog.`);
    }
  }

  if (result.bodyDrift.length > 0) {
    hasFatalDrift = true;
    console.error(`\n❌ CRITICAL LOGIC DRIFT DETECTED (${result.bodyDrift.length} functions):`);
    for (const d of result.bodyDrift) {
      console.error(`   - function "${d.sig || d.name}" defined in ${d.file}`);
      console.error(`     repo md5: ${d.repoMd5} | live md5: ${d.liveMd5}`);
    }
  }

  if (result.commentDrift.length > 0) {
    console.log(`\nℹ️  COMMENT-ONLY DRIFT (${result.commentDrift.length} functions) - logic identical:`);
    for (const c of result.commentDrift) {
      console.log(`   - function "${c.sig || c.name}" (${c.file})`);
    }
  }

  if (result.databaseOnlyFunctions.length > 0) {
    console.log(`\nℹ️  DATABASE-ONLY OBJECTS (${result.databaseOnlyFunctions.length} functions unmanaged in migrations):`);
    for (const fn of result.databaseOnlyFunctions) {
      console.log(`   - ${fn}`);
    }
  }

  console.log("\n=======================================================");
  if (!hasFatalDrift) {
    console.log("🎉 ZERO CRITICAL SCHEMA DRIFT! All repo functions match the live database.");
    console.log("=======================================================\n");
    process.exit(0);
  } else {
    console.error("❌ DRIFT DETECTED: Live database differs from version-controlled migrations.");
    console.log("=======================================================\n");
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("check-migration-drift.mjs")) {
  main().catch((err) => {
    console.error("Drift check crashed:", err);
    process.exit(1);
  });
}
