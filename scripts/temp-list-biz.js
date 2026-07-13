import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolved relative to this file, not cwd, so it still finds the repo-root
// .env when run from anywhere (moved into scripts/).
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

async function list() {
  try {
    const { data, error } = await sb.rpc("businesses_nearby", {
      in_lng: 73.891964,
      in_lat: 18.533094,
      in_radius_km: 25,
      in_category: null,
      in_limit: 20,
      in_offset: 0
    });
    if (error) {
      console.error(error);
    } else {
      console.log("RPC result:", data);
    }
  } catch (e) {
    console.error(e);
  }
}

list();
