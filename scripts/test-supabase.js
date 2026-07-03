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

console.log("URL:", url);
console.log("AnonKey:", anonKey ? "EXISTS" : "MISSING");

const sb = createClient(url, anonKey);

async function test() {
  try {
    const { data, error } = await sb.from("categories").select("*").eq("status", "ACTIVE");
    if (error) {
      console.error("Error fetching categories:", error);
    } else {
      console.log(`Successfully fetched ${data?.length} categories:`);
      console.log(data);
    }
  } catch (e) {
    console.error("Exception:", e);
  }
}

test();
