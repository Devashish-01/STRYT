#!/usr/bin/env node
// Empties the user-content Storage buckets for the production data reset
// (archive/docs/plans/PRODUCTION_DATA_RESET_PLAN.md, step 6).
//
// Why a script: deleting rows from storage.objects does NOT delete the files; only the Storage API does.
//
// Safe by default:
//   * DRY RUN unless you pass --confirm.
//   * Only the buckets in WIPE_BUCKETS can ever be touched. `app-updates` holds the OTA bundles + manifest and is
//     hard-blocked: even if someone edits WIPE_BUCKETS, the script refuses to run.
//   * --backup-dir <dir> downloads every object before it is removed (recommended; PII — keep it private).
//   * The project ref you type must match the URL, so staging cannot be wiped by pasting production's key.
//
// Usage (PowerShell/bash), from the repo root. The secret key never leaves your machine:
//   $env:SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_SECRET_KEY="sb_secret_..."
//   node scripts/ops/wipe-storage.mjs --project-ref <ref>                                  # dry run: counts only
//   node scripts/ops/wipe-storage.mjs --project-ref <ref> --backup-dir ./storage-backup     # dry run + shows what would be saved
//   node scripts/ops/wipe-storage.mjs --project-ref <ref> --backup-dir ./storage-backup --confirm   # real run

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const WIPE_BUCKETS = ["uploads", "verification-docs"];
const NEVER_TOUCH = ["app-updates"];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const projectRef = opt("--project-ref");
const backupDir = opt("--backup-dir");
const confirm = flag("--confirm");

function die(msg) { console.error("✖ " + msg); process.exit(1); }

if (WIPE_BUCKETS.some((b) => NEVER_TOUCH.includes(b))) die(`Refusing to run: WIPE_BUCKETS contains a protected bucket (${NEVER_TOUCH.join(", ")}).`);
if (!url || !key) die("Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
if (!projectRef) die("Pass --project-ref <ref> (it must match SUPABASE_URL).");
if (!url.includes(`//${projectRef}.supabase.co`)) die(`--project-ref ${projectRef} does not match SUPABASE_URL ${url}.`);
if (confirm && !backupDir) console.warn("⚠ No --backup-dir: files will be deleted with no local copy.");

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** Recursively list every file path in a bucket (the API lists one folder level at a time). */
async function listAll(bucket, prefix = "") {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) die(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await listAll(bucket, full))); // a "folder"
      else out.push(full);
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return out;
}

console.log(`${confirm ? "REAL RUN" : "DRY RUN"} on ${url}`);
let total = 0;
for (const bucket of WIPE_BUCKETS) {
  const files = await listAll(bucket);
  total += files.length;
  console.log(`• ${bucket}: ${files.length} object(s)`);
  if (!confirm) continue;

  if (backupDir) {
    for (const f of files) {
      const { data, error } = await sb.storage.from(bucket).download(f);
      if (error) die(`backup ${bucket}/${f}: ${error.message} — nothing was deleted from this bucket`);
      const dest = path.join(backupDir, bucket, f);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
    }
    console.log(`  saved ${files.length} file(s) to ${path.join(backupDir, bucket)}`);
  }

  for (let i = 0; i < files.length; i += 100) {
    const { error } = await sb.storage.from(bucket).remove(files.slice(i, i + 100));
    if (error) die(`remove ${bucket}: ${error.message}`);
  }
  const left = (await listAll(bucket)).length;
  console.log(`  removed. ${bucket} now has ${left} object(s).${left ? "  ← expected 0, investigate" : ""}`);
}
console.log(confirm ? `Done: ${total} object(s) processed.` : `Dry run only — ${total} object(s) would be removed. Re-run with --confirm.`);
