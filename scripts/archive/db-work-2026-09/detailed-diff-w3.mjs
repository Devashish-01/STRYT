import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const snapPath = path.join(ROOT, "supabase/snapshots/2026-09-13_after_20260958.sql");
const snap = fs.readFileSync(snapPath, "utf8");

function norm(str) {
  if (!str) return "";
  return str.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function parseLiveFunctions(snapshotText) {
  const funcs = new Map();
  const funcRegex = /CREATE OR REPLACE FUNCTION public\.([a-zA-Z0-9_]+)\(([\s\S]*?)\)\s+RETURNS\s+([\s\S]*?)\s+LANGUAGE\s+([a-zA-Z0-9_]+)/gim;
  let m;
  while ((m = funcRegex.exec(snapshotText)) !== null) {
    const name = m[1];
    const argsRaw = norm(m[2]);
    const returnType = norm(m[3]);
    const language = m[4].trim();

    const startIdx = m.index;
    const dollarStart = snapshotText.indexOf("$", startIdx);
    let body = "";
    let fullDefinition = "";

    if (dollarStart !== -1) {
      const dollarTagEnd = snapshotText.indexOf("$", dollarStart + 1);
      if (dollarTagEnd !== -1) {
        const tag = snapshotText.substring(dollarStart, dollarTagEnd + 1);
        const bodyEnd = snapshotText.indexOf(tag, dollarTagEnd + 1);
        if (bodyEnd !== -1) {
          body = snapshotText.substring(dollarTagEnd + 1, bodyEnd);
          const semi = snapshotText.indexOf(";", bodyEnd + tag.length);
          if (semi !== -1) {
            fullDefinition = snapshotText.substring(startIdx, semi + 1);
          }
        }
      }
    }

    funcs.set(name, {
      name,
      argsRaw,
      returnType,
      language,
      body,
      fullDefinition,
    });
  }
  return funcs;
}

const liveFuncs = parseLiveFunctions(snap);

const targetPrefixes = [
  "20260947", "20260948", "20260949", "20260950", "20260951",
  "20260952", "20260953", "20260954", "20260955", "20260956"
];

const migFiles = fs
  .readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => targetPrefixes.some(p => f.startsWith(p)) && f.endsWith(".sql"))
  .sort();

console.log("Auditing line differences for all 46 replaced functions...\n");

const diffs = [];

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

    const live = liveFuncs.get(name);
    if (!live) continue; // brand new function

    // Extract all SQL statements / conditions from live.body and migBody
    // Check if any `raise exception`, `if ...`, or table `update` / `insert` in live is missing in migration
    const liveLines = live.body.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith("--"));
    const migLines = migBody.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith("--"));

    // Check raise exceptions
    const extractExceptions = (b) => {
      const res = [];
      const r = /raise exception '([^']+)'/gi;
      let match;
      while ((match = r.exec(b)) !== null) {
        res.push(match[1]);
      }
      return res;
    };

    const liveEx = extractExceptions(live.body);
    const migEx = extractExceptions(migBody);
    const droppedEx = liveEx.filter(e => !migEx.includes(e));

    // Check if live has updates/inserts to tables other than notifications that are missing in mig
    const extractUpdates = (b) => {
      const res = [];
      const r = /update\s+public\.([a-zA-Z0-9_]+)/gi;
      let match;
      while ((match = r.exec(b)) !== null) {
        res.push(match[1]);
      }
      return res;
    };
    const liveUpdates = extractUpdates(live.body);
    const migUpdates = extractUpdates(migBody);
    const droppedUpdates = liveUpdates.filter(u => !migUpdates.includes(u));

    diffs.push({
      file,
      name,
      droppedEx,
      droppedUpdates,
      liveExCount: liveEx.length,
      migExCount: migEx.length,
      isExactMatch: norm(live.body) === norm(migBody),
    });
  }
}

console.log("Functions with dropped exceptions:");
diffs.filter(d => d.droppedEx.length > 0).forEach(d => {
  console.log(`  [${d.file}] ${d.name}: dropped [${d.droppedEx.join(", ")}]`);
});

console.log("\nFunctions with dropped table updates:");
diffs.filter(d => d.droppedUpdates.length > 0).forEach(d => {
  console.log(`  [${d.file}] ${d.name}: dropped updates to [${d.droppedUpdates.join(", ")}]`);
});

console.log(`\nExact body matches: ${diffs.filter(d => d.isExactMatch).length} / ${diffs.length}`);
