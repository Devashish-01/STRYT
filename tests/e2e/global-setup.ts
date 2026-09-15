import { execFileSync } from "node:child_process";
import { loadStagingEnv } from "./fixtures/staging";

// Runs once before the E2E suite: refuse anything but staging, then reset + reseed staging.
export default async function globalSetup() {
  const env = loadStagingEnv();
  console.log(`[e2e] target: staging ${env.STAGING_REF}`);
  if (process.env.E2E_SKIP_SEED === "1") {
    console.log("[e2e] E2E_SKIP_SEED=1 — not reseeding");
    return;
  }
  execFileSync(process.execPath, ["scripts/staging/seed-staging.mjs", "--reset"], { stdio: "inherit" });
}
