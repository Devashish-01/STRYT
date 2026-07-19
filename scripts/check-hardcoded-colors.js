import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, "..", "src");

// Whitelist: ONLY add values here if they CANNOT be expressed as a CSS variable.
// Rule of thumb:
//   ✅ External brand colors (Google, WhatsApp) — you don't own them, so no token
//   ✅ Pure grayscales (#fff, #000) used in SVG fills or rgba() channels
//   ✅ SVG path defaults (white fill on a dark panel)
//   ❌ Do NOT add STRYT brand colors — those MUST use var(--brand-*) tokens
//   ❌ Do NOT add semantic color shades — those MUST use var(--green-100) etc.
const WHITELISTED_HEX = new Set([
  // Pure grayscales — no token equivalent, acceptable in SVG fills / rgba base values
  "fff", "ffffff",
  "000", "000000",
  "eee", "eeeeee",
  "ddd", "dddddd",
  "ccc", "cccccc",

  // App shell / page background (structural, set in body rule of index.css already)
  "ece5f8",

  // Fallback SVG illustrations — inline SVG path fills that can't use CSS variables
  "ece8f5", "b5add0",

  // Social & Platform Brand Colors (externally dictated, cannot be changed)
  "25d366",           // WhatsApp
  "107c41",           // Excel green
  "ff8400", "ec4899", // Instagram gradient stops
  "4285f4", "34a853", "fbbc05", "ea4335", // Google logo (4 distinct brand colors)
  "5f259f",           // PhonePe brand purple
  "00baf2",           // Paytm brand blue
  "e87722",           // BHIM brand orange
  
  // Dark admin/special screen backgrounds (DeletionPending, AdminLogin)
  // These are intentionally off-palette, dark-mode-adjacent screens not in the main token system
  "0f0d17", "1a1625", "180c02", "1e1104", "100600", "290d4f", "1e0a38",

  // Story viewer fallback background gradient (shown behind a story whose image
  // failed to load) — dark neutral stops, not part of the brand token system.
  "2b2b3a", "14141c",

  // Native bridge APIs cannot consume CSS variables; Capacitor StatusBar
  // needs the resolved brand colors as actual platform color strings.
  "8b47f5", "7c2fe8", "6b21cc",

  // Ambient Weather Themes dynamic gradient stops (useAmbientTheme.ts)
  "9a3412", "b45309", "94a3b8", "c2410c", "f97316", "fdba74", "d97706", "93c5fd",
  "ea580c", "f59e0b", "fef08a", "7c2d12", "64748b", "b91c1c", "cbd5e1", "431407",
  "1e1b4b", "475569", "e2e8f0", "4c1d95", "db2777", "0f0703", "0f172a", "020617",
  "1a0b02", "2a170c", "030712", "fcd34d", "ec4899", "8b5cf6", "f43f5e", "dc2626",
  "065f46", "10b981", "a7f3d0", "16a34a", "f3f4f6",
]);

// Helper to recursively list files in directory
function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, fileList);
    } else {
      if (file.endsWith(".tsx") || file.endsWith(".ts") || file.endsWith(".jsx") || file.endsWith(".js")) {
        // Exclude test/audit files, node_modules, git, and useAmbientTheme.ts (dedicated dynamic weather gradient stops)
        if (!name.includes("node_modules") && !name.includes(".git") && !name.includes("useAmbientTheme.ts")) {
          fileList.push(name);
        }
      }
    }
  }
  return fileList;
}

const hexRegex = /#([0-9a-fA-F]{3,6})\b/g;
let violations = [];

const files = getFiles(SRC_DIR);

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // Strip comments to avoid checking disabled code or developer notes
    const cleanedLine = line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");

    let match;
    // reset regex
    hexRegex.lastIndex = 0;
    while ((match = hexRegex.exec(cleanedLine)) !== null) {
      const hex = match[1].toLowerCase();
      if (!WHITELISTED_HEX.has(hex)) {
        violations.push({
          file: path.relative(path.join(__dirname, ".."), file),
          line: idx + 1,
          content: line.trim(),
          hex: match[0]
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error("\x1b[31mError: Hardcoded hex colors found outside index.css!\x1b[0m");
  console.error("Please sweep these to brand tokens or add them to the whitelist in scripts/check-hardcoded-colors.js:\n");
  violations.forEach((v) => {
    console.error(`  \x1b[33m${v.file}:${v.line}\x1b[0m -> Found \x1b[36m${v.hex}\x1b[0m in line:`);
    console.error(`    "${v.content}"`);
    console.error();
  });
  process.exit(1);
} else {
  console.log("\x1b[32m✔ No hardcoded brand color leaks found outside index.css!\x1b[0m");
  process.exit(0);
}
