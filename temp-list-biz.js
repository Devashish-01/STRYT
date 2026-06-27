import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

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

async function list() {
  try {
    const { data, error } = await sb.from("businesses").select("id, name, category_name, sub_category").limit(5);
    if (error) {
      console.error(error);
    } else {
      console.log("Sample businesses:", data);
    }
  } catch (e) {
    console.error(e);
  }
}

list();
