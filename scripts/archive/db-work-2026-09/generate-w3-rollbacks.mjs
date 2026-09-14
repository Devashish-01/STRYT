import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const snapPath = path.join(ROOT, "supabase/snapshots/2026-09-13_after_20260958.sql");
const snap = fs.readFileSync(snapPath, "utf8");

// Parse all functions and grants from live snapshot
function extractLiveFunctionDef(funcName, snapshotText) {
  // Find "CREATE OR REPLACE FUNCTION public.<funcName>("
  const target = `CREATE OR REPLACE FUNCTION public.${funcName}(`;
  let idx = snapshotText.indexOf(target);
  if (idx === -1) return null;

  // Find the closing $function$; or $$;
  const dollarStart = snapshotText.indexOf("$", idx);
  if (dollarStart === -1) return null;
  const tagEnd = snapshotText.indexOf("$", dollarStart + 1);
  if (tagEnd === -1) return null;
  const tag = snapshotText.substring(dollarStart, tagEnd + 1);
  const bodyEnd = snapshotText.indexOf(tag, tagEnd + 1);
  if (bodyEnd === -1) return null;
  const semi = snapshotText.indexOf(";", bodyEnd + tag.length);
  if (semi === -1) return null;

  const fullDef = snapshotText.substring(idx, semi + 1);

  // Look for grants in snapshot
  const grantTarget = `GRANT EXECUTE ON FUNCTION public.${funcName}(`;
  let grantStmt = "";
  const gIdx = snapshotText.indexOf(grantTarget);
  if (gIdx !== -1) {
    const gEnd = snapshotText.indexOf(";", gIdx);
    if (gEnd !== -1) grantStmt = snapshotText.substring(gIdx, gEnd + 1);
  }

  // Look for revokes in snapshot
  const revokeTarget = `REVOKE ALL ON FUNCTION public.${funcName}(`;
  let revokeStmt = "";
  const rIdx = snapshotText.indexOf(revokeTarget);
  if (rIdx !== -1) {
    const rEnd = snapshotText.indexOf(";", rIdx);
    if (rEnd !== -1) revokeStmt = snapshotText.substring(rIdx, rEnd + 1);
  }

  return { fullDef, grantStmt, revokeStmt };
}

const targetPrefixes = [
  "20260947", "20260948", "20260949", "20260950", "20260951",
  "20260952", "20260953", "20260954", "20260955", "20260956"
];

const migFiles = fs
  .readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => targetPrefixes.some(p => f.startsWith(p)) && f.endsWith(".sql"))
  .sort();

console.log(`Generating rollback files for ${migFiles.length} migration files...\n`);

for (const file of migFiles) {
  const filePath = path.join(ROOT, "supabase/migrations", file);
  const content = fs.readFileSync(filePath, "utf8");

  const baseName = file.replace(/\.sql$/, "");
  const rollbackFileName = `${baseName}.rollback.sql`;
  const rollbackFilePath = path.join(ROOT, "supabase/rollbacks", rollbackFileName);

  // Extract functions in file
  const funcRegex = /create or replace function public\.([a-zA-Z0-9_]+)\(([\s\S]*?)\)/gi;
  let m;
  const funcsInMig = [];
  while ((m = funcRegex.exec(content)) !== null) {
    funcsInMig.push({ name: m[1], args: m[2].replace(/\s+/g, " ").trim() });
  }

  const sections = [];
  sections.push(`-- ============================================================`);
  sections.push(`-- Rollback for ${file}`);
  sections.push(`-- Restores all replaced objects to their exact production catalog definitions`);
  sections.push(`-- from supabase/snapshots/2026-09-13_after_20260958.sql.`);
  sections.push(`-- ============================================================\n`);

  for (const fn of funcsInMig) {
    const live = extractLiveFunctionDef(fn.name, snap);
    if (live) {
      sections.push(`-- ── Restore ${fn.name} ─────────────────────────`);
      sections.push(live.fullDef);
      if (live.revokeStmt) sections.push(live.revokeStmt);
      if (live.grantStmt) sections.push(live.grantStmt);
      sections.push("");
    } else {
      // Brand new function, drop it on rollback
      sections.push(`-- ── Drop brand new function ${fn.name} ─────────────────────────`);
      // normalize args for drop: e.g. "p_offer_id text, p_radius_km double precision default 5" -> "text, double precision"
      const cleanArgs = fn.args
        .split(",")
        .map(a => {
          let t = a.trim().replace(/\s+DEFAULT\s+[^,]+/i, "");
          const parts = t.split(/\s+/);
          return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
        })
        .join(", ");
      sections.push(`drop function if exists public.${fn.name}(${cleanArgs});\n`);
    }
  }

  sections.push(`notify pgrst, 'reload schema';\n`);

  const rollbackContent = sections.join("\n");
  fs.writeFileSync(rollbackFilePath, rollbackContent, "utf8");
  console.log(`Generated: ${rollbackFileName} (${funcsInMig.length} functions)`);
}

console.log("\nAll 10 rollback files successfully generated in supabase/rollbacks/.");
