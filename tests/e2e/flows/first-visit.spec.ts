import { test, expect } from "../fixtures/staging";

// A first-time visitor's page must not reload by itself (E2E-008). The service worker takes control a few seconds after
// the first load; ServiceWorkerUpdater used to reload on that `controllerchange`, wiping whatever the visitor had
// started (an open booking sheet, a typed OTP). A reload is only needed when a *previous* worker was in control.
test("first visit: the page does not reload when the service worker first takes control", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  // Count real document loads; same-document route changes (history.replaceState) also fire framenavigated.
  let loads = 0;
  page.on("load", () => loads++);
  await page.goto("/home");
  await page.evaluate(() => ((window as unknown as { __firstLoad?: boolean }).__firstLoad = true));
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30_000 });
  // A controllerchange reload starts within milliseconds; watch a bounded window for the page being replaced.
  const reloaded = await page
    .waitForFunction(() => !(window as unknown as { __firstLoad?: boolean }).__firstLoad, null, { timeout: 5_000 })
    .then(() => true, () => false);
  expect(reloaded, "page reloaded after the service worker took control").toBe(false);
  expect(loads, "document loads").toBe(1);
  await context.close();
});
