import { expect, type Page, type TestInfo } from "@playwright/test";
import { DISCOVERY_PAGES, DYNAMIC_ROUTES } from "./routes";

// Console messages we don't care about (3rd-party noise, dev warnings, etc).
const IGNORED_CONSOLE = [
  /favicon/i,
  /Download the React DevTools/i,
  /React Router Future Flag/i,
  /\[vite\]/i,
  /sourcemap/i,
  /preload/i,
  /Failed to load resource: net::ERR_/i, // map tiles, images going offline — handled by network check
];

// Network failures from these hosts are usually map tiles / 3rd-party images,
// not your app logic. They're still recorded, just not counted as hard failures.
const SOFT_NETWORK_HOSTS = [/tile/i, /mapbox/i, /openstreetmap/i, /unsplash/i, /gravatar/i, /googleapis/i];

export interface PageIssues {
  consoleErrors: string[];
  pageErrors: string[];
  networkErrors: string[]; // "<status> <url>"
}

export function attachListeners(page: Page): PageIssues {
  const issues: PageIssues = { consoleErrors: [], pageErrors: [], networkErrors: [] };

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    issues.consoleErrors.push(text);
  });

  page.on("pageerror", (err) => {
    issues.pageErrors.push(err.message);
  });

  page.on("response", (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (SOFT_NETWORK_HOSTS.some((re) => re.test(url))) return;
    // PGRST116 = "no rows" from a .single() query; common + harmless.
    issues.networkErrors.push(`${status} ${url}`);
  });

  return issues;
}

/**
 * Visit one route at the current viewport, gather problems, screenshot it,
 * and assert (softly, so every page is checked) that it's healthy.
 */
export async function auditRoute(
  page: Page,
  testInfo: TestInfo,
  route: { path: string; label: string },
  opts: { mobile: boolean }
) {
  const issues = attachListeners(page);

  let navError = "";
  try {
    await page.goto(route.path, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (e) {
    navError = String(e);
  }

  // Wait for the app to actually mount something (handles slow first compile /
  // data fetches) so we don't falsely report a "blank screen".
  try {
    await page.waitForFunction(
      () => {
        const root = document.getElementById("root");
        return !!root && root.childElementCount > 0;
      },
      undefined,
      { timeout: 15000 }
    );
  } catch {
    /* genuinely never rendered — caught by the blank-screen assertion below */
  }

  // Let data load + animations settle.
  await page.waitForTimeout(1500);
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    /* some screens keep a socket open; that's fine */
  }

  const finalUrl = new URL(page.url()).pathname;

  // Did a protected page bounce us back to the splash/login? That means the
  // saved session expired — tell the user clearly instead of flagging 80 pages.
  const bouncedToSplash =
    route.path !== "/" &&
    route.path !== "/auth/phone" &&
    finalUrl === "/" &&
    !route.path.startsWith("/auth");

  // Is the screen actually showing something, or is it a blank white page?
  const render = await page.evaluate(() => {
    const root = document.getElementById("root");
    const text = (document.body.innerText || "").trim();
    return {
      rootChildren: root ? root.childElementCount : 0,
      textLen: text.length,
    };
  });

  // Mobile-break detector: content wider than the screen (horizontal scroll).
  const overflow = await page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const scrollW = document.documentElement.scrollWidth;
    const offenders: string[] = [];
    if (scrollW > docW + 1) {
      const all = Array.from(document.querySelectorAll("body *"));
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > docW + 1) {
          const cls = typeof el.className === "string" ? el.className : "";
          offenders.push(
            `<${el.tagName.toLowerCase()}${cls ? ` class="${cls.slice(0, 50)}"` : ""}> right=${Math.round(
              r.right
            )}px (screen=${docW}px)`
          );
        }
        if (offenders.length >= 8) break;
      }
    }
    return { docW, scrollW, overflowPx: Math.max(0, scrollW - docW), offenders };
  });

  // Screenshot every page so the report is a visual catalog of the whole app.
  const shot = await page.screenshot({ fullPage: true });
  await testInfo.attach(`${route.label} (${opts.mobile ? "mobile" : "desktop"})`, {
    body: shot,
    contentType: "image/png",
  });

  if (issues.networkErrors.length) {
    await testInfo.attach("network-errors.txt", {
      body: issues.networkErrors.join("\n"),
      contentType: "text/plain",
    });
  }

  // ---- Assertions (soft = report all problems, never stop the run) ----
  expect.soft(navError, `Navigation failed: ${navError}`).toBe("");

  expect
    .soft(bouncedToSplash, "Session expired / redirected to login. Run `npm run audit:login` again.")
    .toBeFalsy();

  if (!bouncedToSplash) {
    expect
      .soft(render.rootChildren, `Blank screen — nothing rendered at ${route.path}`)
      .toBeGreaterThan(0);

    expect
      .soft(issues.pageErrors.join("\n"), `JS crash on ${route.path}:\n${issues.pageErrors.join("\n")}`)
      .toBe("");

    expect
      .soft(
        issues.consoleErrors.join("\n"),
        `Console errors on ${route.path}:\n${issues.consoleErrors.slice(0, 10).join("\n")}`
      )
      .toBe("");

    if (opts.mobile) {
      expect
        .soft(
          overflow.overflowPx,
          `MOBILE BREAK at ${route.path}: content is ${overflow.overflowPx}px wider than the screen.\nOffending elements:\n${overflow.offenders.join(
            "\n"
          )}`
        )
        .toBeLessThanOrEqual(1);
    }

    const serverErrors = issues.networkErrors.filter((n) => /^5\d\d /.test(n));
    expect
      .soft(serverErrors.join("\n"), `Server (5xx) errors on ${route.path}:\n${serverErrors.join("\n")}`)
      .toBe("");
  }
}

/**
 * Walk the list pages and collect real ids for detail routes
 * (business/provider/request/community/chat/user) so we can audit real records
 * instead of guessing ids.
 */
export async function discoverIds(page: Page): Promise<Record<string, string[]>> {
  const found: Record<string, Set<string>> = {};
  for (const d of DYNAMIC_ROUTES) found[d.id] = new Set();

  for (const path of DISCOVERY_PAGES) {
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
      for (const d of DYNAMIC_ROUTES) {
        const m = d.linkPattern.exec(p);
        if (m && m[1]) found[d.id].add(m[1]);
      }
    }
  }

  const out: Record<string, string[]> = {};
  for (const d of DYNAMIC_ROUTES) out[d.id] = Array.from(found[d.id]).slice(0, 3); // cap per type
  return out;
}
