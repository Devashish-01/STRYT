import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const prefixes = ["20260947", "20260948", "20260949", "20260950", "20260951", "20260952", "20260953", "20260954", "20260955", "20260956"];
const files = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter(f => prefixes.some(p => f.startsWith(p)) && f.endsWith(".sql")).sort();

console.log("=== UPDATED FILE HASHES (POST-W3) ===");
for (const f of files) {
  const content = fs.readFileSync(path.join(ROOT, "supabase/migrations", f));
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  console.log(`${f.slice(0, 8)}: ${hash.slice(0, 12)} (${hash})`);
}
