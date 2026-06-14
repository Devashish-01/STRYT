import { test } from "@playwright/test";
import { auditRoute, discoverIds } from "./audit-helpers";
import {
  STATIC_ROUTES,
  DYNAMIC_ROUTES,
  BUSINESS_MANAGE_SUBPATHS,
  PROVIDER_MANAGE_SUBPATHS,
} from "./routes";

const isMobile = () => test.info().project.name === "mobile";

// One independent test per static screen → each shows up in the report with its
// own pass/fail status and screenshot.
test.describe("Static screens", () => {
  for (const route of STATIC_ROUTES) {
    test(route.label, async ({ page }) => {
      await auditRoute(page, test.info(), route, { mobile: isMobile() });
    });
  }
});

// Detail screens (business/provider/request/etc.) using real ids discovered
// from the list pages. Owner consoles (business/provider manage) use ids found
// on the Manage hub so we only test entities the logged-in user can open.
test.describe("Detail & owner screens", () => {
  test("Detail + manage screens", async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);

    const ids = await discoverIds(page);

    for (const d of DYNAMIC_ROUTES) {
      const list = ids[d.id];
      if (!list.length) {
        test.info().annotations.push({
          type: "skipped",
          description: `No id found for ${d.label} — no records linked on the list pages.`,
        });
        continue;
      }
      for (const id of list) {
        await test.step(`${d.label} (${id})`, async () => {
          await auditRoute(page, test.info(), { path: d.build(id), label: `${d.label} ${id}` }, {
            mobile: isMobile(),
          });
        });
      }
    }

    // Find owned business / provider ids from the Manage hub + profile.
    const manageIds = await collectManageIds(page);

    if (manageIds.business) {
      for (const m of BUSINESS_MANAGE_SUBPATHS) {
        await test.step(m.label, async () => {
          await auditRoute(
            page,
            test.info(),
            { path: `/business/${manageIds.business}/${m.sub}`, label: m.label },
            { mobile: isMobile() }
          );
        });
      }
    } else {
      test.info().annotations.push({
        type: "skipped",
        description: "No owned business found — business console screens not tested.",
      });
    }

    if (manageIds.provider) {
      for (const m of PROVIDER_MANAGE_SUBPATHS) {
        await test.step(m.label, async () => {
          await auditRoute(
            page,
            test.info(),
            { path: `/provider/${manageIds.provider}/${m.sub}`, label: m.label },
            { mobile: isMobile() }
          );
        });
      }
    } else {
      test.info().annotations.push({
        type: "skipped",
        description: "No owned provider found — provider console screens not tested.",
      });
    }
  });
});

async function collectManageIds(
  page: import("@playwright/test").Page
): Promise<{ business?: string; provider?: string }> {
  const result: { business?: string; provider?: string } = {};
  for (const path of ["/manage", "/profile"]) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(1500);
    } catch {
      continue;
    }
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") || "")
    );
    for (const href of hrefs) {
      let p = href;
      try {
        if (href.startsWith("http")) p = new URL(href).pathname;
      } catch {
        /* ignore */
      }
      const b = /^\/business\/([^/]+)\/manage/.exec(p);
      if (b && !result.business) result.business = b[1];
      const pr = /^\/provider\/([^/]+)\/manage/.exec(p);
      if (pr && !result.provider) result.provider = pr[1];
    }
    if (result.business && result.provider) break;
  }
  return result;
}
