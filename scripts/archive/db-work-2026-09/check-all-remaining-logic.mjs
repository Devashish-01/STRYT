import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const snapPath = path.join(ROOT, "supabase/snapshots/2026-09-13_after_20260958.sql");
const snap = fs.readFileSync(snapPath, "utf8");

function parseLiveFunctions(snapshotText) {
  const funcs = new Map();
  const funcRegex = /CREATE OR REPLACE FUNCTION public\.([a-zA-Z0-9_]+)\(([\s\S]*?)\)\s+RETURNS\s+([\s\S]*?)\s+LANGUAGE\s+([a-zA-Z0-9_]+)/gim;
  let m;
  while ((m = funcRegex.exec(snapshotText)) !== null) {
    const name = m[1];
    const startIdx = m.index;
    const dollarStart = snapshotText.indexOf("$", startIdx);
    if (dollarStart !== -1) {
      const dollarTagEnd = snapshotText.indexOf("$", dollarStart + 1);
      if (dollarTagEnd !== -1) {
        const tag = snapshotText.substring(dollarStart, dollarTagEnd + 1);
        const bodyEnd = snapshotText.indexOf(tag, dollarTagEnd + 1);
        if (bodyEnd !== -1) {
          funcs.set(name, snapshotText.substring(dollarTagEnd + 1, bodyEnd));
        }
      }
    }
  }
  return funcs;
}

const liveBodies = parseLiveFunctions(snap);

const targetPrefixes = [
  "20260947", "20260948", "20260949", "20260950", "20260951",
  "20260952", "20260953", "20260954", "20260955", "20260956"
];

const migFiles = fs
  .readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => targetPrefixes.some(p => f.startsWith(p)) && f.endsWith(".sql"))
  .sort();

console.log("Analyzing all checks and logic across the remaining migration files...");

for (const file of migFiles) {
  const filePath = path.join(ROOT, "supabase/migrations", file);
  const content = fs.readFileSync(filePath, "utf8");

  const funcRegex = /create or replace function public\.([a-zA-Z0-9_]+)\(([\s\S]*?)\)\s*(?:returns\s+([\s\S]*?))?\s*as\s+(\$[a-zA-Z0-9_]*\$)/gi;
  let m;

  while ((m = funcRegex.exec(content)) !== null) {
    const name = m[1];
    const tag = m[4];
    const bodyStart = funcRegex.lastIndex;
    const bodyEnd = content.indexOf(tag, bodyStart);
    if (bodyEnd === -1) continue;
    const migBody = content.substring(bodyStart, bodyEnd);

    const liveBody = liveBodies.get(name);
    if (!liveBody) continue; // new

    // Check for `raise exception` in live missing in mig
    const rEx = /raise exception '([^']+)'/gi;
    const liveEx = [];
    let match;
    while ((match = rEx.exec(liveBody)) !== null) liveEx.push(match[1]);

    const migEx = [];
    const rEx2 = /raise exception '([^']+)'/gi;
    while ((match = rEx2.exec(migBody)) !== null) migEx.push(match[1]);

    const dropped = liveEx.filter(e => !migEx.includes(e));
    if (dropped.length > 0) {
      console.log(`[${file}] ${name}: dropped exceptions [${dropped.join(", ")}]`);
    }

    // Check if live has `has_business_scope` or `is_admin` missing in mig
    if (liveBody.includes("has_business_scope") && !migBody.includes("has_business_scope")) {
      console.log(`[${file}] ${name}: DROPPED has_business_scope check!`);
    }
    if (liveBody.includes("is_admin") && !migBody.includes("is_admin")) {
      console.log(`[${file}] ${name}: DROPPED is_admin check!`);
    }
    if (liveBody.includes("has_business_access") && !migBody.includes("has_business_access")) {
      console.log(`[${file}] ${name}: DROPPED has_business_access check!`);
    }
  }
}

console.log("Check complete.");
