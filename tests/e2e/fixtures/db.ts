import fs from "node:fs";
import path from "node:path";
import { loadStagingEnv, PRODUCTION_REF } from "./staging";

// Read-only server-state checks for E2E tests, on STAGING only, through the Supabase Management API.
// Used where the UI can't show the state being asserted (e.g. a row that must not exist). Every query runs in a
// read-only transaction, so a test can never write through this helper.
// Token: SUPABASE_PERSONAL_ACCESS_TOKEN from the environment or .env (never committed).

function token(): string | undefined {
  if (process.env.SUPABASE_PERSONAL_ACCESS_TOKEN) return process.env.SUPABASE_PERSONAL_ACCESS_TOKEN;
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return undefined;
  return fs.readFileSync(file, "utf8").match(/^SUPABASE_PERSONAL_ACCESS_TOKEN=(.*)$/m)?.[1]?.trim();
}

export const hasDb = () => !!token();

export async function stagingQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const env = loadStagingEnv();
  if (env.STAGING_REF === PRODUCTION_REF) throw new Error("REFUSED: production ref");
  const pat = token();
  if (!pat) throw new Error("SUPABASE_PERSONAL_ACCESS_TOKEN is not set");
  const res = await fetch(`https://api.supabase.com/v1/projects/${env.STAGING_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `set transaction read only;\n${sql}` }),
  });
  const body = await res.json();
  if (!res.ok || !Array.isArray(body)) throw new Error(`staging query failed: ${JSON.stringify(body).slice(0, 300)}`);
  return body as T[];
}

/** Escapes a value for a single-quoted SQL literal (test-generated values only). */
export const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
