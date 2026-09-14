import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const snapPath = path.join(ROOT, "supabase/snapshots/2026-09-13_after_20260958.sql");
const snap = fs.readFileSync(snapPath, "utf8");

const migPath = path.join(ROOT, "supabase/migrations/20260955_proposal_notifications_v2.sql");
const mig = fs.readFileSync(migPath, "utf8");

// Parse functions in 20260955
const funcRegex = /create or replace function public\.([a-zA-Z0-9_]+)\(([\s\S]*?)\)\s*(?:returns\s+([\s\S]*?))?\s*as\s+(\$[a-zA-Z0-9_]*\$)/gi;
let m;
const funcsIn20260955 = [];
while ((m = funcRegex.exec(mig)) !== null) {
  const name = m[1];
  const tag = m[4];
  const bodyStart = funcRegex.lastIndex;
  const bodyEnd = mig.indexOf(tag, bodyStart);
  if (bodyEnd !== -1) {
    funcsIn20260955.push({ name, body: mig.substring(bodyStart, bodyEnd) });
  }
}

for (const fn of funcsIn20260955) {
  console.log(`=== Function: ${fn.name} ===`);
  // Find in snapshot
  const liveRegex = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn.name}\\(([\\s\\S]*?)\\)[\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$`, "i");
  const lm = snap.match(liveRegex);
  if (!lm) {
    console.log("  Not found on live!");
    continue;
  }
  const liveBody = lm[2];
  
  // Extract all lines that do NOT touch notifications
  const cleanLive = liveBody.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.includes("notifications") && !l.startsWith("--"));
  const cleanMig = fn.body.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.includes("notifications") && !l.startsWith("--"));

  console.log(`  Live non-notif line count: ${cleanLive.length}, Mig non-notif line count: ${cleanMig.length}`);
}
