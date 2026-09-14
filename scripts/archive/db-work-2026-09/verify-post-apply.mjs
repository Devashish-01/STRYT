import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const beforeSnapPath = path.join(ROOT, "supabase/snapshots/2026-09-13_pre_20260958.sql");
const afterSnapPath = path.join(ROOT, "supabase/snapshots/2026-09-13_after_20260958.sql");

const before = fs.readFileSync(beforeSnapPath, "utf8");
const after = fs.readFileSync(afterSnapPath, "utf8");

function getSections(content) {
  const sections = {};
  const regex = /-- ═+\r?\n-- ([^\n\r]+?)(?: \(\d+\))?\r?\n-- ═+/g;
  let match;
  const indices = [];
  while ((match = regex.exec(content)) !== null) {
    indices.push({ name: match[1].trim(), headerStart: match.index, bodyStart: match.index + match[0].length });
  }
  for (let i = 0; i < indices.length; i++) {
    const nextStart = i + 1 < indices.length ? indices[i + 1].headerStart : content.length;
    sections[indices[i].name] = content.substring(indices[i].bodyStart, nextStart).trim();
  }
  return sections;
}

const beforeSections = getSections(before);
const afterSections = getSections(after);

let hasErrors = false;

console.log("=== SECTION DIFF CHECK ===");
const allSectionNames = Array.from(new Set([...Object.keys(beforeSections), ...Object.keys(afterSections)]));

for (const name of allSectionNames) {
  const b = beforeSections[name];
  const a = afterSections[name];

  if (b === undefined || a === undefined) {
    console.error(`FAIL: Section [${name}] missing from one snapshot! (before=${b !== undefined}, after=${a !== undefined})`);
    hasErrors = true;
    continue;
  }

  if (name.startsWith("Migration ledger")) {
    console.log(`Checking [${name}]:`);
    const bLines = b.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const aLines = a.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const diff = aLines.filter(l => !bLines.includes(l));
    console.log("  New ledger rows:", diff);
    const expected = diff.some(l => l.includes("20260958_capture_database_only_objects"));
    if (!expected) {
      console.error("FAIL: 20260958_capture_database_only_objects not found in ledger!");
      hasErrors = true;
    } else if (diff.length !== 1) {
      console.error("FAIL: More than 1 new ledger row found:", diff);
      hasErrors = true;
    } else {
      console.log("  PASS: Exactly 1 new ledger row added: 20260958_capture_database_only_objects");
    }
  } else {
    if (b === a) {
      console.log(`PASS: [${name}] is IDENTICAL before and after.`);
    } else {
      console.error(`FAIL: Diff detected in [${name}]!`);
      const bLines = b.split(/\r?\n/);
      const aLines = a.split(/\r?\n/);
      console.log(`  Lines: before=${bLines.length}, after=${aLines.length}`);
      for (let i = 0; i < Math.max(bLines.length, aLines.length); i++) {
        if (bLines[i] !== aLines[i]) {
          console.log(`  First diff at line ${i}:`);
          console.log(`    before: ${bLines[i]}`);
          console.log(`    after:  ${aLines[i]}`);
          break;
        }
      }
      hasErrors = true;
    }
  }
}

console.log("\n=== FUNCTION EXECUTE GRANTS CHECK ===");
const grantsSection = afterSections["Function EXECUTE grants (effective)"];
if (!grantsSection) {
  console.error("FAIL: Could not find Function EXECUTE grants section");
  hasErrors = true;
} else {
  const canManageMatch = grantsSection.match(/GRANT EXECUTE ON FUNCTION public\.can_manage_business\(p_business_id text\) TO ([^;]+);/);
  console.log("can_manage_business grant:", canManageMatch ? canManageMatch[0] : "NOT FOUND");
  if (canManageMatch && canManageMatch[1].includes("anon")) {
    console.log("PASS: can_manage_business is still executable by anon!");
  } else {
    console.error("FAIL: can_manage_business is NOT executable by anon!");
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error("\nPOST-APPLY VERIFICATION FAILED!");
  process.exit(1);
} else {
  console.log("\nPOST-APPLY VERIFICATION PASSED: ONLY THE LEDGER ROW CHANGED!");
}
