#!/usr/bin/env node
// Rolls the OTA "latest.json" pointer back to a previously-published bundle,
// without needing a fresh dist/ rebuild. publish-ota-update.mjs already
// uploads each version to its own object (bundle-<version>.zip, never
// overwritten by a later version — only latest.json moves), so a bad publish
// is recoverable: just repoint latest.json at an older bundle that's still
// sitting in Storage.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/rollback-ota-update.mjs 0.1.15

import { createWriteStream, existsSync, readFileSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Auto-load .env from project root, same as publish-ota-update.mjs.
try {
  const envPath = join(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !(key in process.env)) process.env[key] = val;
    }
  }
} catch { /* ignore — env vars set in terminal still work */ }

const SUPABASE_URL = "https://gnswxlfmcwyhmzlfipql.supabase.co";
const BUCKET = "app-updates";

async function main() {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: node scripts/rollback-ota-update.mjs <version>");
    console.error("Example: node scripts/rollback-ota-update.mjs 0.1.15");
    process.exit(1);
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var (Project Settings -> API -> service_role).");
    process.exit(1);
  }

  const sb = createClient(SUPABASE_URL, serviceRoleKey);
  const bundleObjectPath = `bundle-${version}.zip`;

  console.log(`Looking for ${bundleObjectPath} in bucket "${BUCKET}"...`);
  const { data: downloaded, error: downloadErr } = await sb.storage.from(BUCKET).download(bundleObjectPath);
  if (downloadErr) {
    console.error(`Couldn't find/download ${bundleObjectPath}: ${downloadErr.message}`);
    console.error("Nothing was published for that version, or it's already been pruned — pick a version you know was published.");
    process.exit(1);
  }

  // Recompute the checksum from the actual stored bytes rather than trusting
  // any cached value — this is the source of truth latest.json should point at.
  const tmpPath = join(tmpdir(), `stryt-ota-rollback-${version}.zip`);
  const buf = Buffer.from(await downloaded.arrayBuffer());
  await new Promise((resolve, reject) => {
    const out = createWriteStream(tmpPath);
    out.on("finish", resolve);
    out.on("error", reject);
    out.end(buf);
  });
  const checksum = createHash("sha256").update(buf).digest("hex");
  unlinkSync(tmpPath);
  console.log(`SHA256: ${checksum}`);

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(bundleObjectPath);
  const manifest = { version, url: pub.publicUrl, checksum };

  const { error: manifestErr } = await sb.storage
    .from(BUCKET)
    .upload("latest.json", Buffer.from(JSON.stringify(manifest, null, 2)), {
      contentType: "application/json",
      upsert: true,
    });
  if (manifestErr) {
    console.error("Manifest upload failed:", manifestErr.message);
    process.exit(1);
  }

  console.log(`\nRolled back. latest.json now points to:`);
  console.log(JSON.stringify(manifest, null, 2));
  console.log("\nNote: this only rolls back which bundle new update-checks are offered.");
  console.log("Devices already running a newer bundle are NOT downgraded automatically.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
