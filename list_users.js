import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

// Simple manual .env parser
const envContent = fs.readFileSync(".env", "utf8");
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
