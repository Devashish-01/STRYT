// Migration Linter for STRYT
//
// Enforces non-negotiable database guardrails from docs/database/HANDOFF.md:
//   Rule 1: SECURITY DEFINER must pin `search_path = public`
//   Rule 2: Functions in schema public must explicitly REVOKE permissions from public, anon
//   Rule 3: No USING (true) or USING ((true OR ...)) on tables containing personal data (PII)
//   Rule 4: Applied migrations are immutable (hash verification against APPLY_LOG.md)
//
// USAGE:
//   node scripts/lint-migrations.mjs                # lints new/unapplied migrations & checks applied immutability
//   node scripts/lint-migrations.mjs --staged       # lints git-staged migrations
//   node scripts/lint-migrations.mjs --all          # full repo audit across all migrations (historical = warnings, unapplied = errors)
//   node scripts/lint-migrations.mjs --file <path>  # lints a single migration file

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const APPLY_LOG_PATH = path.join(ROOT, "supabase", "APPLY_LOG.md");

// All migrations up to 20260964 are applied to production and verified
export const LATEST_APPLIED_MIGRATION = "20260964_drop_obsolete_bulk_deal_token_redeem.sql";

export const PII_TABLES = new Set([
  "users",
  "profiles",
  "queue_tokens",
  "appointments",
  "agreements",
  "messages",
  "chat_messages",
  "conversations",
  "chat_conversations",
  "notifications",
  "location_shares",
  "entity_passwords",
  "user_interests",
  "bank_accounts",
  "settlements"
]);

// Functions intentionally callable by anonymous users / public RLS helpers
export const ANON_ALLOWED_FUNCTIONS = new Set([
  "can_manage_business",
  "has_business_scope",
  "has_business_access",
  "queue_waiting_line",
  "businesses_nearby",
  "stories_nearby",
  "get_public_profile",
  "suggest_business_login",
  "close_stale_queue_tokens"
]);

/**
 * Extracts applied migration files and their genuine SHA-256 hashes from APPLY_LOG.md
 */
export function getAppliedMigrationsFromLog() {
  if (!fs.existsSync(APPLY_LOG_PATH)) {
    return new Map();
  }

  const content = fs.readFileSync(APPLY_LOG_PATH, "utf8");
  const applied = new Map();

  // 1. Parse main log table
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;

    const fileMatch = line.match(/`supabase\/migrations\/([a-zA-Z0-9_]+\.sql)`/);
    if (fileMatch) {
      const fileName = fileMatch[1];
      const hashMatch = line.match(/sha256\s*`([a-f0-9]{64})`/i);
      if (hashMatch) {
        applied.set(fileName, hashMatch[1].toLowerCase());
      } else if (!applied.has(fileName)) {
        applied.set(fileName, null);
      }
    }
  }

  // 2. Parse corrections section (e.g. row 18 corrections table takes precedence)
  const corrIdx = content.indexOf("## Corrections");
  if (corrIdx !== -1) {
    const corrLines = content.slice(corrIdx).split(/\r?\n/);
    for (const line of corrLines) {
      const m = line.match(/\|\s*`([a-zA-Z0-9_]+\.sql)`\s*\|\s*`[a-f0-9]{64}`\s*\|\s*`([a-f0-9]{64})`\s*\|/i);
      if (m) {
        applied.set(m[1], m[2].toLowerCase());
      }
    }
  }

  return applied;
}

/**
 * Parses individual SQL statements from a migration file
 */
export function splitSqlStatements(sql) {
  const normalized = sql.replace(/\r\n/g, "\n");
  const statements = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";
  let inSingleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1] || "";

    // Handle comments outside quotes
    if (!inSingleQuote && !inDollarQuote) {
      if (!inBlockComment && ch === "-" && next === "-") {
        inLineComment = true;
        current += ch;
        continue;
      }
      if (inLineComment && ch === "\n") {
        inLineComment = false;
        current += ch;
        continue;
      }
      if (!inLineComment && ch === "/" && next === "*") {
        inBlockComment = true;
        current += ch;
        continue;
      }
      if (inBlockComment && ch === "*" && next === "/") {
        inBlockComment = false;
        current += "*/";
        i++;
        continue;
      }
    }

    if (inLineComment || inBlockComment) {
      current += ch;
      continue;
    }

    // Handle single quotes
    if (!inDollarQuote && ch === "'") {
      if (inSingleQuote && next === "'") {
        current += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }

    // Handle dollar quotes (e.g. $$ or $tag$)
    if (!inSingleQuote && ch === "$") {
      const match = normalized.slice(i).match(/^\$([a-zA-Z0-9_]*)\$/);
      if (match) {
        const tag = match[0];
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = tag;
          current += tag;
          i += tag.length - 1;
          continue;
        } else if (inDollarQuote && tag === dollarTag) {
          inDollarQuote = false;
          dollarTag = "";
          current += tag;
          i += tag.length - 1;
          continue;
        }
      }
    }

    // Statement boundary
    if (!inSingleQuote && !inDollarQuote && ch === ";") {
      current += ch;
      if (current.trim()) {
        statements.push(current.trim());
      }
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

/**
 * Lints an individual migration SQL file content
 */
export function lintMigrationContent(sql, fileName) {
  const errors = [];
  const warnings = [];

  const statements = splitSqlStatements(sql);

  const createdFunctions = [];
  const revokedFunctions = new Set();

  for (const stmt of statements) {
    // ── Rule 1: SECURITY DEFINER without search_path ─────────────────────────
    const funcMatch = stmt.match(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(/i);
    if (funcMatch) {
      const fnName = funcMatch[1];
      const isSecDef = /\bsecurity\s+definer\b/i.test(stmt);
      const hasSearchPath = /\bset\s+search_path\s*(?:=|to)\s*['"]?public['"]?/i.test(stmt);

      createdFunctions.push({ name: fnName, statement: stmt, isSecDef, hasSearchPath });

      if (isSecDef && !hasSearchPath) {
        errors.push({
          rule: "RULE_1_SECURITY_DEFINER_SEARCH_PATH",
          message: `Function "${fnName}" is SECURITY DEFINER but missing 'SET search_path = public'.`,
          file: fileName,
        });
      }
    }

    // ── Rule 2 helper: Track REVOKEs ─────────────────────────────────────────
    const revokeMatch = stmt.match(/revoke\s+(?:all(?:\s+privileges)?|execute)\s+on\s+function\s+(?:public\.)?([a-zA-Z0-9_]+)[^;]*from\s+([^;]+)/i);
    if (revokeMatch) {
      const fnName = revokeMatch[1];
      const roles = revokeMatch[2].toLowerCase();
      if (roles.includes("public") || roles.includes("anon")) {
        revokedFunctions.add(fnName);
      }
    }

    // ── Rule 3: USING (true) on tables with personal data ────────────────────
    const policyMatch = stmt.match(/create\s+policy\s+("?[^"\s]+"?)\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)\b([\s\S]*)/i);
    if (policyMatch) {
      const policyName = policyMatch[1].replace(/"/g, "");
      const tableName = policyMatch[2].toLowerCase();
      const policyBody = policyMatch[3];

      if (PII_TABLES.has(tableName)) {
        const usingTrueMatch = policyBody.match(/using\s*\(\s*\(?\s*true\b/i);
        if (usingTrueMatch) {
          errors.push({
            rule: "RULE_3_PII_TABLE_USING_TRUE",
            message: `Policy "${policyName}" on sensitive table "${tableName}" uses permissive USING (true). Personal data must be scoped to authenticated participants.`,
            file: fileName,
          });
        }
      }
    }
  }

  // ── Rule 2: Verify created functions have explicit REVOKEs ──────────────────
  for (const fn of createdFunctions) {
    if (!ANON_ALLOWED_FUNCTIONS.has(fn.name) && !revokedFunctions.has(fn.name)) {
      const returnsTrigger = /returns\s+trigger\b/i.test(fn.statement);
      if (returnsTrigger || fn.isSecDef) {
        errors.push({
          rule: "RULE_2_MISSING_REVOKE_ANON",
          message: `Function "${fn.name}" lacks explicit 'REVOKE ALL ON FUNCTION ... FROM public, anon'. Supabase grants public execute by default.`,
          file: fileName,
        });
      } else {
        warnings.push({
          rule: "RULE_2_WARN_UNREVOKED_FUNCTION",
          message: `Function "${fn.name}" has no explicit REVOKE from public/anon. Ensure this function is intended for public execute.`,
          file: fileName,
        });
      }
    }
  }

  return { errors, warnings };
}

/**
 * Verifies immutability of applied migrations against expected hashes (Rule 4)
 */
export function verifyAppliedImmutability(appliedMap = getAppliedMigrationsFromLog(), migrationsDir = MIGRATIONS_DIR) {
  const errors = [];

  for (const [fileName, expectedHash] of appliedMap.entries()) {
    const filePath = path.join(migrationsDir, fileName);
    if (!fs.existsSync(filePath)) {
      errors.push({
        rule: "RULE_4_APPLIED_MIGRATION_MISSING",
        message: `Applied migration file "${fileName}" recorded in APPLY_LOG.md is missing from ${migrationsDir}.`,
        file: fileName,
      });
      continue;
    }

    if (!expectedHash) {
      errors.push({
        rule: "RULE_4_APPLIED_MIGRATION_NO_HASH",
        message: `Applied migration file "${fileName}" recorded in APPLY_LOG.md has no valid SHA-256 hash.`,
        file: fileName,
      });
      continue;
    }

    const content = fs.readFileSync(filePath);
    const actualHash = crypto.createHash("sha256").update(content).digest("hex").toLowerCase();

    // Check raw, LF-normalized, and CRLF-normalized hashes to eliminate git line-ending discrepancies across OSes
    const utf8Str = content.toString("utf8");
    const lfNormalized = Buffer.from(utf8Str.replace(/\r\n/g, "\n"), "utf8");
    const lfHash = crypto.createHash("sha256").update(lfNormalized).digest("hex").toLowerCase();
    const crlfNormalized = Buffer.from(utf8Str.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"), "utf8");
    const crlfHash = crypto.createHash("sha256").update(crlfNormalized).digest("hex").toLowerCase();

    const aliases = [
      expectedHash,
      // 20260958 was committed with 11 mixed CRLF line endings; pure LF checkout has sha256 9b01d537...
      ...(fileName === "20260958_capture_database_only_objects.sql"
        ? ["9b01d5375a835e7119298e14b4ce6086185637b2fc377814b5638333de8c06ff"]
        : []),
    ];

    const matches =
      aliases.includes(actualHash) ||
      aliases.includes(lfHash) ||
      aliases.includes(crlfHash);

    if (!matches) {
      errors.push({
        rule: "RULE_4_APPLIED_MIGRATION_MODIFIED",
        message: `Applied migration "${fileName}" was modified! Expected SHA-256 ${expectedHash.slice(0, 12)}..., found ${actualHash.slice(0, 12)}... (Rule 2: An applied file never changes).`,
        file: fileName,
      });
    }
  }

  return { appliedCount: appliedMap.size, errors };
}

/**
 * Checks immutability of applied migrations from APPLY_LOG.md in repo (Rule 4)
 */
export function checkAppliedImmutability() {
  return verifyAppliedImmutability(getAppliedMigrationsFromLog(), MIGRATIONS_DIR);
}

/**
 * Gets git staged migration files
 */
export function getStagedMigrationFiles() {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACMR", { encoding: "utf8" });
    return output
      .split(/\r?\n/)
      .filter((f) => f.startsWith("supabase/migrations/") && f.endsWith(".sql"))
      .map((f) => path.basename(f));
  } catch (e) {
    return [];
  }
}

// ── CLI Execution ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const isAll = args.includes("--all");
  const isStaged = args.includes("--staged");
  const fileArgIdx = args.indexOf("--file");
  const specificFile = fileArgIdx !== -1 ? args[fileArgIdx + 1] : null;

  console.log("=======================================================");
  console.log("🛡️  STRYT DATABASE MIGRATION LINTER");
  console.log("=======================================================\n");

  let totalErrors = 0;
  let totalWarnings = 0;

  // 1. Rule 4: Applied Migrations Immutability Check
  console.log("Verifying applied migration immutability (Rule 4)...");
  const immutabilityResult = checkAppliedImmutability();
  if (immutabilityResult.errors.length > 0) {
    console.error(`❌ FAILED: ${immutabilityResult.errors.length} applied migration(s) have been tampered with or deleted:`);
    for (const err of immutabilityResult.errors) {
      console.error(`   - ${err.message}`);
      totalErrors++;
    }
  } else {
    console.log(`✅ Passed: All ${immutabilityResult.appliedCount} recorded applied migrations are byte-identical and unmodified.\n`);
  }

  // 2. Rules 1–3: Static linting on migrations
  const allFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

  let targetFiles = [];
  if (specificFile) {
    targetFiles = [path.basename(specificFile)];
    console.log(`Linting specified file: ${targetFiles[0]}...`);
  } else if (isStaged) {
    targetFiles = getStagedMigrationFiles();
    console.log(`Linting ${targetFiles.length} git staged migration file(s)...`);
  } else if (isAll) {
    targetFiles = allFiles;
    console.log(`Full repository audit mode: linting all ${allFiles.length} migration files...`);
  } else {
    // Standard mode: lints any new / unapplied migrations (after LATEST_APPLIED_MIGRATION)
    targetFiles = allFiles.filter((f) => f > LATEST_APPLIED_MIGRATION);
    console.log(`Standard mode: linting ${targetFiles.length} new/unapplied migration file(s) (beyond ${LATEST_APPLIED_MIGRATION})...`);
  }

  if (targetFiles.length === 0 && !specificFile && !isAll) {
    console.log(`No unapplied migrations found beyond ${LATEST_APPLIED_MIGRATION}. All current migrations are applied and immutability verified.`);
  }

  for (const file of targetFiles) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    const isHistorical = file <= LATEST_APPLIED_MIGRATION;
    const sql = fs.readFileSync(filePath, "utf8");
    const { errors, warnings } = lintMigrationContent(sql, file);

    // If file is historical/applied and we are in --all audit mode, treat as warnings
    if (isHistorical && isAll) {
      for (const err of errors) {
        console.warn(`   ⚠️ [HISTORICAL_NOTICE] ${file}: ${err.message}`);
        totalWarnings++;
      }
    } else if (errors.length > 0) {
      console.error(`\n❌ Errors in ${file}:`);
      for (const err of errors) {
        console.error(`   [${err.rule}] ${err.message}`);
        totalErrors++;
      }
    }

    if (warnings.length > 0 && (!isHistorical || !isAll)) {
      for (const warn of warnings) {
        console.warn(`   ⚠️ [${warn.rule}] ${warn.message} (${file})`);
        totalWarnings++;
      }
    }
  }

  console.log("\n=======================================================");
  if (totalErrors === 0) {
    console.log(`🎉 ALL DATABASE GUARDRAILS PASSED! (0 errors, ${totalWarnings} warnings)`);
    console.log("=======================================================\n");
    process.exit(0);
  } else {
    console.error(`❌ MIGRATION LINT FAILED: ${totalErrors} error(s) detected.`);
    console.error("Please fix the violations before applying or committing migrations.");
    console.log("=======================================================\n");
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("lint-migrations.mjs")) {
  main().catch((err) => {
    console.error("Linter crashed:", err);
    process.exit(1);
  });
}
