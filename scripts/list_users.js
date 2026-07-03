import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Simple manual .env parser — resolved relative to this file, not cwd, so it
// still finds the repo-root .env when run from anywhere (moved into scripts/).
const envContent = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"), "utf8");
const envVars = {};
for (const line of envContent.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+)\s*$/);
  if (m) {
    envVars[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const url = envVars.VITE_SUPABASE_URL || "";
const anonKey = envVars.VITE_SUPABASE_ANON_KEY || "";

const sb = createClient(url, anonKey);

async function check() {
  const { data, error } = await sb.from("users").select("*").order("created_at", { ascending: false }).limit(5);
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Latest users in database:", data);
  }
}

check();
