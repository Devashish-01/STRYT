import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://localhost:5173";
const SESSION_FILE = ".auth/session.json";

// One-click app audit: visits every screen on mobile + desktop, looks for
// broken layouts, crashes, console errors and failed API calls, and produces a
// visual HTML report. See README-AUDIT.md.
export default defineConfig({
  testDir: "./tests",
  // Pages are visited sequentially within a test; keep workers low so the
  // shared dev server + backend aren't hammered and screenshots stay stable.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    video: "off",
    ignoreHTTPSErrors: true,
  },

  projects: [
    // Step 1: ensure we have a logged-in session (opens a browser the 1st time).
    { name: "setup", testMatch: /auth\.setup\.ts/ },

    // Step 2: audit every screen at phone size.
    {
      name: "mobile",
      dependencies: ["setup"],
      testMatch: /audit\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        storageState: SESSION_FILE,
      },
    },

    // Step 3: audit every screen at desktop size.
    {
      name: "desktop",
      dependencies: ["setup"],
      testMatch: /audit\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 900 },
        storageState: SESSION_FILE,
      },
    },
  ],

  // Auto-start the app before testing and shut it down after. Reuses an already
  // running dev server if you happen to have one open.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
