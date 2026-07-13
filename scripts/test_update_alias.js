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

async function test() {
  const targetId = '54c0af07-8e5d-4fd2-844d-5d49225717d3';
  const { data, error } = await sb.from("users").select("*").eq("id", targetId).maybeSingle();
  console.log("Current user row:", data);
  if (error) console.error("Select error:", error);

  // Try updating the alias
  if (data && !data.alias) {
    console.log("Attempting to update alias...");
    const { error: updError } = await sb.from("users").update({ alias: "TestAlias123" }).eq("id", targetId);
    if (updError) {
      console.error("Update error:", updError);
    } else {
      console.log("Update successful!");
    }
  }
}

test();
