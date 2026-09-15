import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the STAGING Supabase project only (P06/P07).
// - globalSetup refuses to run unless .env.staging points at the staging ref, then reseeds staging.
// - The dev server runs in `--mode staging`, so the app talks to staging, never production.
// Run: npm run e2e   (see tests/e2e/README.md)

const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /\.spec\.ts$/,
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-e2e" }]],
  outputDir: "test-results-e2e",
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // A production build served by `vite preview`: the dev server compiles on first load and made sign-in flaky.
    command: `npm run build:staging && npm run preview:staging -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 420_000,
  },
});
