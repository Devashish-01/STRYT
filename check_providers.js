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
  const { data: users, error: uErr } = await sb.from("users").select("*");
  if (uErr) {
    console.error("Users Error:", uErr);
  } else {
    console.log("Users count:", users.length);
    users.forEach(u => {
      console.log(`User ID: ${u.id}, name: ${u.name}, phone: ${u.phone}, lat/lng: ${u.lat}/${u.lng}`);
    });
  }

  const { data: providers, error: pErr } = await sb.from("providers").select("*");
  if (pErr) {
    console.error("Providers Error:", pErr);
  } else {
    console.log("Providers count:", providers.length);
    providers.forEach(p => {
      console.log(`Provider ID: ${p.id}, name: ${p.display_name}, user_id: ${p.user_id}, status: ${p.status}, is_available_now: ${p.is_available_now}, available_until: ${p.available_until}, lat/lng: ${p.lat}/${p.lng}`);
    });
  }
}

check();
