import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readEnv() {
  const envContent = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
  const out = {};
  for (const line of envContent.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

async function run() {
  const env = readEnv();
  const url = env.VITE_SUPABASE_URL;
  // Use the service role key we retrieved
  const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imduc3d4bGZtY3d5aG16bGZpcHFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUxMjU3MiwiZXhwIjoyMDk2MDg4NTcyfQ.jmtNOU1_SgNOvqRlztZNENVl1ZvZ7Xjk2jDmY5cYCF0";

  if (!url || !serviceRoleKey) {
    console.error("Missing supabase URL or service role key");
    return;
  }

  const pathsToTry = [
    path.join(__dirname, "..", "release-artifacts", "stryt.apk"),
    path.join(__dirname, "..", "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
    path.join(__dirname, "..", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"),
    path.join(__dirname, "..", "public", "stryt.apk")
  ];

  let apkPath = null;
  for (const p of pathsToTry) {
    if (fs.existsSync(p)) {
      apkPath = p;
      break;
    }
  }

  if (!apkPath) {
    console.error("Error: Could not find any stryt.apk or app-debug.apk to upload!");
    return;
  }

  console.log(`Found APK to upload at: ${apkPath}`);
  const fileBuffer = fs.readFileSync(apkPath);

  const sb = createClient(url, serviceRoleKey);
  console.log("Uploading to Supabase Storage in 'uploads' bucket as 'stryt.apk'...");

  const { data, error } = await sb.storage
    .from("uploads")
    .upload("stryt.apk", fileBuffer, {
      contentType: "application/vnd.android.package-archive",
      upsert: true
    });

  if (error) {
    console.error("Upload failed:", error);
    return;
  }

  console.log("Upload successful!", data);
  const { data: publicUrlData } = sb.storage.from("uploads").getPublicUrl("stryt.apk");
  console.log("Public URL:", publicUrlData.publicUrl);
}

run();
