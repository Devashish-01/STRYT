// IDOR sweep — STAGING ONLY.
//
// Why this exists: `tracking_tokens` shipped with `FOR SELECT TO PUBLIC USING (true)` and sat there for
// two years (GAPS_LOG #30). It was found by reading a file, not by a test. This is the test. 206 policies
// and 248 functions had never been exercised from a second account.
//
// What it does, in four phases, WITHOUT WRITING ANY DATA:
//   A. Discovery — asks PostgREST itself which tables are exposed (its OpenAPI document) rather than
//      carrying a hardcoded list that goes stale the next time someone adds a table.
//   B. Read reach — for every identity (anon + each persona), how many rows does a bare SELECT return?
//   C. Cross-user read — for every table with an owner column, can identity A read rows owned by B?
//      This is the actual IDOR question, and it needs no hand-written expectations matrix.
//   D. Write authorization — can `anon` get past authorization on INSERT? Probed with a deliberately
//      empty payload: 401/403 means blocked, 400 means it reached validation, i.e. writes are permitted.
//      Nothing is ever inserted.
//
// Findings are compared against idor-allowlist.json. A table is only "allowed" to be world-readable if
// it is listed there WITH a reason. Anything unlisted is a finding and exits non-zero.
//
// NOT the same job as scripts/check-policy-grants.mjs, and neither replaces the other:
//   check-policy-grants asks "does this policy CRASH?" (a policy calling a function the role cannot
//     EXECUTE aborts the whole statement — it has shipped three times and broke guest browsing);
//   this asks "does this policy LEAK?" — can one account reach another's rows.
// A policy can pass one and fail the other.
//
// COVERAGE, honestly: an empty table passes every access test ever written. The first run of this sweep
// could only test cross-user reads on 2 of the 49 owned tables because the other 47 had no rows, so
// idor-fixtures.sql exists to give the privacy-sensitive ones one row per persona. Run the fixtures
// before trusting a clean result, and the teardown after.
//
// Usage:
//   1. apply scripts/db-tests/idor-fixtures.sql to staging
//   2. node scripts/db-tests/idor-sweep.mjs [--json]
//   3. apply scripts/db-tests/idor-fixtures-teardown.sql

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PERSONAS } from "../staging/personas.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRODUCTION_REF = "gnswxlfmcwyhmzlfipql";
const ALLOWLIST_PATH = path.join(ROOT, "scripts", "db-tests", "idor-allowlist.json");
const asJson = process.argv.includes("--json");

// ── Environment, with the same production guard the other staging scripts use ────────────────────
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.staging"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
if (!env.STAGING_REF || env.STAGING_REF === PRODUCTION_REF || !env.VITE_SUPABASE_URL.includes(env.STAGING_REF)) {
  console.error("REFUSED: .env.staging does not point at the staging project.");
  process.exit(2);
}
const URL_BASE = env.VITE_SUPABASE_URL;
const APIKEY = env.VITE_SUPABASE_ANON_KEY;

// Columns that name the row's owner. Kept here rather than inferred from a name pattern so that adding a
// new convention is a deliberate edit — a silently unrecognised owner column would mean a silently
// unswept table, which is the failure mode this script exists to prevent.
const OWNER_COLUMNS = [
  "user_id", "owner_user_id", "payer_user_id", "author_user_id", "requester_user_id",
  "responder_user_id", "agent_user_id", "blocker_user_id", "recipient_user_id",
  "sender_user_id", "created_by", "customer_user_id",
];

const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
const publicReadOk = new Set(Object.keys(allowlist.publicRead || {}));
const crossUserReadOk = new Set(Object.keys(allowlist.crossUserRead || {}));

function headers(token) {
  const h = { apikey: APIKEY, "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** Sign a persona in with the staging test OTP. Returns a token; never prints one. */
async function signIn(persona) {
  await fetch(`${URL_BASE}/auth/v1/otp`, {
    method: "POST", headers: headers(), body: JSON.stringify({ phone: persona.phone }),
  });
  const verify = await fetch(`${URL_BASE}/auth/v1/verify`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ phone: persona.phone, token: env.STAGING_TEST_OTP, type: "sms" }),
  });
  const session = await verify.json().catch(() => ({}));
  if (!session.access_token) throw new Error(`sign-in failed for ${persona.key}`);
  if (session.user?.id !== persona.id) throw new Error(`wrong user id for ${persona.key}`);
  return session.access_token;
}

// ── Phase A: discover the exposed tables ─────────────────────────────────────────────────────────
//
// PostgREST's own OpenAPI document would be authoritative, but Supabase now answers `GET /rest/v1/`
// with "Only secret API keys can be used for this endpoint" — and a secret key has no business being
// in a harness that also signs in as ordinary users. So the table list comes from
// src/types/database.types.ts, which is generated from the live schema and committed.
//
// The staleness that costs us is a table added to the database but missing from the types file: it
// would go unswept and silently pass. checkTypesFreshness() below turns that into a loud warning by
// comparing the types file's mtime against the newest migration.
function discover() {
  const src = fs.readFileSync(path.join(ROOT, "src", "types", "database.types.ts"), "utf8");
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => l === "    Tables: {");
  if (start < 0) throw new Error("could not find the Tables block in database.types.ts");

  const tables = [];
  let current = null;
  let inRow = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^    \w+: \{/.test(line)) break; // Views: / Functions: — the Tables block is over

    const table = line.match(/^      (\w+): \{$/);
    if (table) { current = { name: table[1], columns: [] }; tables.push(current); inRow = false; continue; }
    if (!current) continue;

    if (line === "        Row: {") { inRow = true; continue; }
    if (inRow && line === "        }") { inRow = false; continue; }
    if (inRow) {
      const col = line.match(/^          (\w+)\??:/);
      if (col) current.columns.push(col[1]);
    }
  }

  for (const t of tables) t.ownerColumns = OWNER_COLUMNS.filter((c) => t.columns.includes(c));
  return tables.sort((a, b) => a.name.localeCompare(b.name));
}

/** A types file older than the newest migration may be missing tables, which would silently go unswept. */
function checkTypesFreshness() {
  const typesPath = path.join(ROOT, "src", "types", "database.types.ts");
  const migDir = path.join(ROOT, "supabase", "migrations");
  const typesAt = fs.statSync(typesPath).mtimeMs;
  let newest = 0;
  let newestName = "";
  for (const f of fs.readdirSync(migDir)) {
    const at = fs.statSync(path.join(migDir, f)).mtimeMs;
    if (at > newest) { newest = at; newestName = f; }
  }
  if (newest > typesAt) {
    return `database.types.ts is older than ${newestName} — regenerate it or newly added tables will go unswept`;
  }
  return null;
}

/** SELECT with an exact count, without pulling rows back. */
async function countRows(table, token, filter = "") {
  const url = `${URL_BASE}/rest/v1/${table}?select=*${filter}&limit=1`;
  const r = await fetch(url, { headers: { ...headers(token), Prefer: "count=exact" } });
  const range = r.headers.get("content-range") || "";
  const total = range.includes("/") ? range.split("/")[1] : null;
  return { status: r.status, count: total === "*" || total === null ? null : Number(total) };
}

/** Does this identity get past authorization on INSERT? Empty payload → nothing can be written. */
async function probeInsert(table, token) {
  const r = await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: "POST", headers: headers(token), body: "{}",
  });
  return r.status;
}

async function main() {
  const stale = checkTypesFreshness();
  if (stale) console.error(`WARNING: ${stale}\n`);

  const tables = discover();
  const identities = [{ key: "anon", id: null, token: null }];
  for (const p of PERSONAS) identities.push({ key: p.key, id: p.id, token: await signIn(p) });

  const findings = [];
  const matrix = [];

  for (const t of tables) {
    const row = { table: t.name, reach: {}, ownerColumns: t.ownerColumns };

    // Phase B — read reach per identity
    for (const id of identities) {
      const { status, count } = await countRows(t.name, id.token);
      row.reach[id.key] = status >= 400 ? `HTTP ${status}` : count;
    }

    // anon reading anything at all must be justified in the allowlist
    const anonReach = row.reach.anon;
    if (typeof anonReach === "number" && anonReach > 0 && !publicReadOk.has(t.name)) {
      findings.push({
        severity: "HIGH", kind: "public-read", table: t.name,
        detail: `anon can read ${anonReach} row(s) and ${t.name} is not in the allowlist`,
      });
    }

    // Phase C — cross-user read: can persona A see rows owned by persona B?
    for (const col of t.ownerColumns) {
      for (const a of identities.filter((i) => i.token)) {
        const others = PERSONAS.filter((p) => p.id !== a.id);
        for (const b of others) {
          const { status, count } = await countRows(t.name, a.token, `&${col}=eq.${b.id}`);
          if (status < 400 && count > 0) {
            const key = `${t.name}.${col}`;
            if (!crossUserReadOk.has(t.name) && !crossUserReadOk.has(key)) {
              findings.push({
                severity: "HIGH", kind: "cross-user-read", table: t.name,
                detail: `${a.key} can read ${count} row(s) where ${col} = ${b.key}`,
              });
            }
          }
        }
      }
    }

    // Phase D — anon write authorization (no data is written)
    const insertStatus = await probeInsert(t.name, null);
    row.anonInsert = insertStatus;
    if (insertStatus === 400) {
      findings.push({
        severity: "CRITICAL", kind: "anon-write", table: t.name,
        detail: `anon INSERT reached validation (HTTP 400), meaning authorization did not stop it`,
      });
    }

    matrix.push(row);
  }

  // De-duplicate: one finding per table+kind is enough to act on.
  const seen = new Set();
  const unique = findings.filter((f) => {
    const k = `${f.kind}:${f.table}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (asJson) {
    console.log(JSON.stringify({ matrix, findings: unique }, null, 2));
  } else {
    console.log(`\nIDOR sweep — ${env.STAGING_REF} (staging)`);
    console.log(`${tables.length} exposed tables x ${identities.length} identities\n`);
    for (const f of unique) {
      console.log(`  [${f.severity}] ${f.kind.padEnd(16)} ${f.table.padEnd(30)} ${f.detail}`);
    }
    console.log(unique.length ? `\n${unique.length} finding(s).` : "\nNo findings.");
    console.log("Full matrix: re-run with --json\n");
  }

  process.exit(unique.length ? 1 : 0);
}

main().catch((e) => { console.error("sweep failed:", e.message); process.exit(2); });
