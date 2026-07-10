#!/usr/bin/env node
// Publishes an OTA bundle for @capgo/capacitor-updater (self-hosted, no
// third-party update service). Zips dist/, uploads it plus an updated
// latest.json manifest to the public "app-updates" Supabase Storage bucket.
// The native plugin polls that manifest and compares the "version" field
// client-side — no server-side logic needed, a static file is enough.
//
// Usage:
//   npm run build
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/publish-ota-update.mjs
//
// Version comes from package.json — bump it before publishing.
//
// IMPORTANT: OTA only replaces JS/CSS/HTML (the web bundle). It can NEVER add
// a native permission, a new Capacitor plugin, or anything requiring a native
// rebuild — devices still on an older APK that lacks a plugin you now call
// will crash on that call. Only publish OTA updates that are pure web-layer
// changes; anything touching native code/plugins needs a new APK release.

import { createReadStream, createWriteStream, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import archiver from "archiver";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gnswxlfmcwyhmzlfipql.supabase.co";
const BUCKET = "app-updates";
const DIST_DIR = join(process.cwd(), "dist");

async function main() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var (Project Settings -> API -> service_role).");
    process.exit(1);
  }

  if (!existsSync(DIST_DIR) || !existsSync(join(DIST_DIR, "index.html"))) {
    console.error(`dist/index.html not found. Run "npm run build" first.`);
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  const version = pkg.version;
  if (!version) {
    console.error("package.json has no version field.");
    process.exit(1);
  }
  console.log(`Publishing OTA bundle version ${version}...`);

  const zipPath = join(tmpdir(), `stryt-ota-${version}.zip`);
  await zipDir(DIST_DIR, zipPath);
  console.log(`Zipped dist/ -> ${zipPath}`);

  const checksum = await sha256File(zipPath);
  console.log(`SHA256: ${checksum}`);

  const sb = createClient(SUPABASE_URL, serviceRoleKey);
  const bundleObjectPath = `bundle-${version}.zip`;

  const zipBuffer = readFileSync(zipPath);
  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(bundleObjectPath, zipBuffer, { contentType: "application/zip", upsert: true });
  if (uploadErr) {
    console.error("Bundle upload failed:", uploadErr.message);
    process.exit(1);
  }
  console.log(`Uploaded ${bundleObjectPath} to bucket "${BUCKET}".`);

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

  console.log("\nlatest.json now points to:");
  console.log(JSON.stringify(manifest, null, 2));
  console.log("\nDone. Devices will pick this up on their next foreground->background cycle.");
}

function zipDir(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    // index.html must sit at the zip root per the plugin's contract.
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
