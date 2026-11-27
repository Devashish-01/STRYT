import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_VERSION } from "../src/lib/legal";

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

/** Return the SQL migration body that most recently defines `fnName`. */
function latestFunctionMigrationSql(fnName: string): { file: string; sql: string } | null {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse();

  const fnRe = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${fnName}\\b`, "i");
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    if (fnRe.test(sql)) return { file, sql };
  }
  return null;
}

describe("LEGAL_VERSION stays synced with onboarding SQL RPCs", () => {
  it("matches the latest customer_onboarding migration", () => {
    const latest = latestFunctionMigrationSql("customer_onboarding");
    expect(latest).not.toBeNull();
    expect(latest!.sql).toContain(`terms_accepted_version is distinct from '${LEGAL_VERSION}'`);
  });

  it("matches the latest record_login_acceptance migration", () => {
    const latest = latestFunctionMigrationSql("record_login_acceptance");
    expect(latest).not.toBeNull();
    expect(latest!.sql).toContain(`p_version is distinct from '${LEGAL_VERSION}'`);
  });
});
