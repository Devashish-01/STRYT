import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readEnv() {
  const envPath = join(__dirname, "..", "..", ".env");
  const out = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

const env = readEnv();
const token = env.SUPABASE_AT;
const urlMatch = (env.VITE_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
const ref = urlMatch?.[1];

if (!token || !ref) {
  console.error("✗ Need SUPABASE_AT and VITE_SUPABASE_URL in .env");
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function runSql(query) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data;
}

console.log("=== R13 Database Smoke Test ===");

try {
  // 1. Insert test business
  console.log("→ Inserting test business with status 'NONE'...");
  const insertRes = await runSql(`
    INSERT INTO public.businesses (id, owner_user_id, name, slug, status, is_verified, verification_status)
    VALUES ('b_test_r13', 'u1', 'Test R13 Shop', 'test-r13-shop', 'PENDING', false, 'NONE')
    RETURNING is_verified, verification_status;
  `);
  
  const b1 = insertRes[0];
  if (!b1 || b1.is_verified !== false || b1.verification_status !== 'NONE') {
    throw new Error(`Invalid insert result: ${JSON.stringify(b1)}`);
  }
  console.log("   Inserted successfully. is_verified=false, verification_status='NONE'");

  // 2. Update status to UNDER_REVIEW
  console.log("→ Updating status to 'UNDER_REVIEW'...");
  const reviewRes = await runSql(`
    UPDATE public.businesses
    SET verification_status = 'UNDER_REVIEW', verification_document_url = 'https://mock.url/doc.pdf'
    WHERE id = 'b_test_r13'
    RETURNING is_verified, verification_status, verification_document_url;
  `);
  const b2 = reviewRes[0];
  if (!b2 || b2.is_verified !== false || b2.verification_status !== 'UNDER_REVIEW' || b2.verification_document_url !== 'https://mock.url/doc.pdf') {
    throw new Error(`Invalid review update result: ${JSON.stringify(b2)}`);
  }
  console.log("   Updated successfully. is_verified=false, verification_status='UNDER_REVIEW'");

  // 3. Update status to APPROVED (should trigger is_verified=true)
  console.log("→ Approving verification (setting status to 'APPROVED')...");
  const approveRes = await runSql(`
    UPDATE public.businesses
    SET verification_status = 'APPROVED'
    WHERE id = 'b_test_r13'
    RETURNING is_verified, verification_status;
  `);
  const b3 = approveRes[0];
  if (!b3 || b3.is_verified !== true || b3.verification_status !== 'APPROVED') {
    throw new Error(`Trigger failed: is_verified did not change to true: ${JSON.stringify(b3)}`);
  }
  console.log("   Approved! Trigger set is_verified=true automatically!");

  // 4. Update status back to NONE (should trigger is_verified=false)
  console.log("→ Resetting verification (setting status to 'NONE')...");
  const resetRes = await runSql(`
    UPDATE public.businesses
    SET verification_status = 'NONE'
    WHERE id = 'b_test_r13'
    RETURNING is_verified, verification_status;
  `);
  const b4 = resetRes[0];
  if (!b4 || b4.is_verified !== false || b4.verification_status !== 'NONE') {
    throw new Error(`Trigger failed: is_verified did not reset to false: ${JSON.stringify(b4)}`);
  }
  console.log("   Reset! Trigger set is_verified=false automatically!");

  // 5. Verify Check Constraint
  console.log("→ Verifying check constraint (trying to set invalid status)...");
  try {
    await runSql(`
      UPDATE public.businesses
      SET verification_status = 'INVALID_STATUS'
      WHERE id = 'b_test_r13';
    `);
    throw new Error("Check constraint failed to block invalid status!");
  } catch (err) {
    if (err.message.includes("violates check constraint")) {
      console.log("   Success! Invalid status was correctly blocked by check constraint.");
    } else {
      throw err;
    }
  }

} catch (err) {
  console.error(`\n✗ Smoke test failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  console.log("→ Cleaning up test items...");
  try {
    await runSql("DELETE FROM public.businesses WHERE id = 'b_test_r13';");
    console.log("   Cleaned up.");
  } catch (e) {
    console.error("Cleanup failed:", e.message);
  }
  
  if (process.exitCode !== 1) {
    console.log("\n✓ R13 database trigger and constraint smoke test passed!");
  }
}
