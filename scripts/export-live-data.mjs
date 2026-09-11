// Live DATA export — a restore point for production rows, without Docker.
//
// WHY THIS EXISTS: the project is on Supabase's Free plan, which has no
// restorable backups. scripts/snapshot-live-schema.mjs records the schema;
// this records the rows. Run it before any risky database change.
//
// WHAT IT DOES
//   * Reads every public table (extension-owned tables excluded) in ONE
//     statement, so all tables come from the same instant.
//   * Writes one INSERT file per table, values as text literals — the same
//     text round-trip COPY uses — plus manifest.json with row counts and a
//     per-table checksum computed inside that same statement.
//   * --verify: restores every table into a throwaway TEMP table inside a
//     forced rollback and requires the checksum to match the export exactly.
//     Nothing is ever written to a real table.
//
// SAFETY
//   * The output contains personal data. The script refuses to write anywhere
//     inside a git repository, and prints only counts — never row contents.
//   * Read-only against the database, except the --verify temp tables, which
//     are rolled back.
//
// USAGE
//   node scripts/export-live-data.mjs <output-dir-outside-any-repo> [--verify]
//
// Reads SUPABASE_PERSONAL_ACCESS_TOKEN from .env and never prints it.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const VERIFY = args.includes("--verify");
const OUT = args.find((a) => !a.startsWith("--"));
if (!OUT) {
  console.error("usage: node scripts/export-live-data.mjs <output-dir-outside-any-repo> [--verify]");
  process.exit(1);
}

// ── Refuse to write personal data anywhere git could pick it up ─────────────
const outDir = path.resolve(OUT);
for (let dir = outDir; ; dir = path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, ".git"))) {
    console.error(`Refusing to write personal data inside a git repository: ${dir}`);
    process.exit(1);
  }
  if (path.dirname(dir) === dir) break;
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

const env = readEnv();
const TOKEN = env.SUPABASE_PERSONAL_ACCESS_TOKEN;
const REF = (env.VITE_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!TOKEN || !REF) {
  console.error("Missing SUPABASE_PERSONAL_ACCESS_TOKEN or VITE_SUPABASE_URL in .env");
  process.exit(1);
}
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function query(sql) {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
async function rows(sql) {
  const r = await query(sql);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 300)}`);
  return JSON.parse(r.text);
}

const ident = (s) => `"${s.replace(/"/g, '""')}"`;
// One row rendered as the inside of a VALUES tuple: every column as a quoted
// text literal (NULL stays NULL). Postgres casts each literal back to the
// column type on insert — the same text round-trip COPY relies on.
const rowText = (alias, cols) => `concat_ws(', ', ${cols.map((c) => `quote_nullable(${alias}.${ident(c)}::text)`).join(", ")})`;
const orderBy = (alias, pk) => pk.map((c) => `${alias}.${ident(c)}`).join(", ");
const checksum = (alias, cols, pk) => `md5(coalesce(string_agg(${rowText(alias, cols)}, '|' order by ${orderBy(alias, pk)}), ''))`;

async function main() {
  const tables = await rows(`
    select c.relname as t,
           (select json_agg(a.attname order by a.attnum) from pg_attribute a
             where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = '') as cols,
           (select json_agg(a.attname order by array_position(i.indkey::int2[], a.attnum))
              from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
             where i.indrelid = c.oid and i.indisprimary) as pk
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    order by c.relname`);

  const noPk = tables.filter((t) => !t.pk?.length).map((t) => t.t);
  if (noPk.length) throw new Error(`tables without a primary key (row order undefined): ${noPk.join(", ")}`);

  // ONE statement for every table => one consistent snapshot across tables.
  const exportSql =
    `select '__taken_at' as t, to_json(now()::text) as data, null::text as checksum\n` +
    tables.map(({ t, cols, pk }) =>
      `union all select ${`'${t.replace(/'/g, "''")}'`}, ` +
      `(select coalesce(json_agg(${rowText("x", cols)} order by ${orderBy("x", pk)}), '[]'::json) from public.${ident(t)} x), ` +
      `(select ${checksum("x", cols, pk)} from public.${ident(t)} x)`).join("\n");
  const result = await rows(exportSql);
  const takenAt = result.find((r) => r.t === "__taken_at").data;
  const byTable = new Map(result.filter((r) => r.t !== "__taken_at").map((r) => [r.t, r]));

  fs.mkdirSync(outDir, { recursive: true });
  const manifest = { project: REF, taken_at: takenAt, method: "scripts/export-live-data.mjs (Management API, single statement)", tables: [] };
  let totalRows = 0;

  for (const { t, cols } of tables) {
    const { data, checksum: sum } = byTable.get(t);
    const values = data ?? [];
    totalRows += values.length;
    const entry = { table: `public.${t}`, rows: values.length, checksum_md5: sum, file: null, sha256: null };
    if (values.length) {
      const head = `INSERT INTO public.${ident(t)} (${cols.map(ident).join(", ")}) VALUES\n`;
      const parts = [
        `-- STRYT data export: public.${t} — ${values.length} rows`,
        `-- taken ${takenAt} from project ${REF}`,
        "-- CONTAINS PERSONAL DATA. Keep private; never commit or upload.",
        "-- Restore into a scratch table first — see README.txt. Replaying into live",
        "-- tables fires their triggers (notifications, push).",
        "",
      ];
      for (let i = 0; i < values.length; i += 500) {
        parts.push(head + values.slice(i, i + 500).map((v) => `  (${v})`).join(",\n") + ";\n");
      }
      const file = `public.${t}.sql`;
      const body = parts.join("\n");
      fs.writeFileSync(path.join(outDir, file), body, "utf8");
      entry.file = file;
      entry.sha256 = crypto.createHash("sha256").update(body).digest("hex");
    }
    manifest.tables.push(entry);
  }
  manifest.total_rows = totalRows;

  // ── Restore drill: every table round-trips through a TEMP copy ─────────────
  if (VERIFY) {
    const results = [];
    for (const { t, cols, pk } of tables) {
      const entry = manifest.tables.find((e) => e.table === `public.${t}`);
      if (!entry.rows) { results.push({ t, ok: true, note: "empty" }); continue; }
      const insert = fs.readFileSync(path.join(outDir, entry.file), "utf8")
        .split("\n").filter((l) => !l.startsWith("--")).join("\n")
        .replaceAll(`INSERT INTO public.${ident(t)} (`, "INSERT INTO pg_temp.__restore_check (");
      const tag = `$rc_${crypto.randomBytes(6).toString("hex")}$`;
      if (insert.includes(tag)) throw new Error("dollar tag collision");
      const r = await query(
        `do ${tag}\ndeclare v_n int; v_sum text;\nbegin\n` +
        `  create temp table __restore_check (like public.${ident(t)});\n` +
        `${insert}\n` +
        `  select count(*), ${checksum("x", cols, pk)} into v_n, v_sum from pg_temp.__restore_check x;\n` +
        `  raise exception 'RESTORE_CHECK n=% sum=%', v_n, v_sum;\n` +
        `end ${tag};`);
      const m = r.text.match(/RESTORE_CHECK n=(\d+) sum=([0-9a-f]{32})/);
      const ok = !!m && Number(m[1]) === entry.rows && m[2] === entry.checksum_md5;
      results.push({ t, ok, note: m ? `${m[1]} rows restored` : `unexpected: ${r.text.slice(0, 160)}` });
    }
    const failed = results.filter((x) => !x.ok);
    manifest.restore_drill = {
      ran_at: new Date().toISOString(),
      tables_checked: results.length,
      passed: results.length - failed.length,
      failed: failed.map((f) => `${f.t}: ${f.note}`),
    };
  }

  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "README.txt"), [
    `STRYT production data export — project ${REF}`,
    `Taken: ${takenAt} (all tables from one consistent snapshot)`,
    "",
    "CONTAINS PERSONAL DATA (names, phone numbers, messages, locations, payment references).",
    "Keep this folder private. Never commit it, email it, or upload it anywhere.",
    "",
    "What's here",
    "  public.<table>.sql  INSERT statements for that table's rows (empty tables have no file)",
    "  manifest.json       row counts, per-table checksums, file hashes, restore-drill result",
    "",
    "How to restore (always via a scratch table — never replay straight into live tables,",
    "their triggers send notifications and push messages):",
    "  1. create table public.<table>_restore (like public.<table>);",
    "  2. In public.<table>.sql, change  INSERT INTO public.\"<table>\"  to  INSERT INTO public.<table>_restore",
    "     and run it (SQL Editor or psql).",
    "  3. Compare/merge the rows you need back into public.<table>, then drop the _restore table.",
    "  4. Log the restore in supabase/APPLY_LOG.md.",
    "",
    "Schema for these rows: the repo's supabase/snapshots/ file taken closest to the time above.",
  ].join("\n"), "utf8");

  const nonEmpty = manifest.tables.filter((e) => e.rows).length;
  const bytes = fs.readdirSync(outDir).reduce((n, f) => n + fs.statSync(path.join(outDir, f)).size, 0);
  console.log(`export written: ${outDir}`);
  console.log(`taken_at: ${takenAt}`);
  console.log(`tables: ${tables.length} (${nonEmpty} with rows)   rows: ${totalRows}   size: ${(bytes / 1024).toFixed(0)} KB`);
  if (manifest.restore_drill) {
    const d = manifest.restore_drill;
    console.log(`restore drill: ${d.passed}/${d.tables_checked} tables restored with matching checksums`);
    for (const f of d.failed) console.log(`  FAILED ${f}`);
  }
}

main().catch((e) => {
  console.error("export failed:", e.message);
  process.exit(1);
});
