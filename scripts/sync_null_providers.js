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

async function sync() {
  const { data: providers, error: pErr } = await sb.from("providers").select("id, user_id, lat, lng");
  if (pErr) {
    console.error("Error fetching providers:", pErr);
    return;
  }
  
  for (const p of providers || []) {
    if (p.lat == null || p.lng == null) {
      if (p.user_id) {
        const { data: u, error: uErr } = await sb.from("users").select("lat, lng").eq("id", p.user_id).maybeSingle();
        if (uErr) {
          console.error(`Error fetching user ${p.user_id}:`, uErr);
        } else if (u && u.lat != null && u.lng != null) {
          console.log(`Syncing provider ${p.id} to user coordinates ${u.lat}, ${u.lng}`);
          const { error: updErr } = await sb.from("providers").update({ lat: u.lat, lng: u.lng }).eq("id", p.id);
          if (updErr) {
            console.error(`Error updating provider ${p.id}:`, updErr);
          } else {
            console.log(`Successfully synced provider ${p.id}`);
          }
        } else {
          console.log(`User ${p.user_id} has no coordinates`);
        }
      } else {
        console.log(`Provider ${p.id} has no user_id`);
      }
    }
  }
}

sync();
