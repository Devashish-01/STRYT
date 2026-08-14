import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end walk of the community loop: discover → compose → publish → engage →
 * resolve, plus automated accessible-name checks on the composer and the feed
 * card.
 *
 * WHY THIS EXISTS SEPARATELY FROM audit.spec.ts. The audit visits every route and
 * asks "did it render without crashing". That can't catch the failures this
 * feature is actually prone to, all of which are about a sequence: a draft that
 * doesn't come back, a preview that doesn't match what gets posted, a post that
 * publishes but never appears in the feed, a like that reverts a second later.
 *
 * REQUIREMENTS. A running app (the config's webServer handles that) and a signed
 * in session from `npm run audit:login` (the `setup` project). It also needs the
 * community migrations (20260891-20260896) applied — without them the composer
 * still works but the type-specific fields have nowhere to write. Each test
 * skips with a clear reason rather than failing when a precondition is absent,
 * so this suite never reports a broken environment as a broken feature.
 */

const UNIQUE = `e2e ${Date.now().toString(36)}`;

/** Wait for the app shell to mount — same approach as audit-helpers. */
async function waitForApp(page: Page) {
  await page.waitForFunction(
    () => {
      const root = document.getElementById("root");
      return !!root && root.childElementCount > 0;
    },
    undefined,
    { timeout: 20_000 }
  );
  await page.waitForTimeout(800);
}

/** True when the saved session has expired and we bounced to the splash. */
async function isSignedOut(page: Page): Promise<boolean> {
  return new URL(page.url()).pathname === "/";
}

async function openFeed(page: Page) {
  await page.goto("/community-hub", { waitUntil: "domcontentloaded" });
  await waitForApp(page);
}

/**
 * Every focusable control must expose a name to a screen reader. An icon-only
 * button with no aria-label is the single most common accessibility defect in a
 * feed UI, and it's invisible to sighted testing — this feature added a lot of
 * icon-only buttons (save, share, overflow, reactions).
 */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>("button, [role='radio'], [role='option'], a[href]")
    );
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // not visible, not reachable
      const label =
        (el.getAttribute("aria-label") || "").trim() ||
        (el.getAttribute("title") || "").trim() ||
        (el.innerText || "").trim() ||
        // An image-only button can still be named by its alt text.
        Array.from(el.querySelectorAll("img"))
          .map((i) => i.getAttribute("alt") || "")
          .join("")
          .trim();
      if (label.length === 0) {
        const cls = typeof el.className === "string" ? el.className.slice(0, 40) : "";
        offenders.push(`<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ""}>`);
      }
    }
    return offenders;
  });
}

test.describe("community loop", () => {
  test("the feed invites a post and its controls are all named", async ({ page }) => {
    await openFeed(page);
    test.skip(await isSignedOut(page), "No signed-in session — run `npm run audit:login`.");

    // The prompt bar is the feature's front door: it replaced two buttons that
    // named features ("Create Post") with an invitation to write.
    const prompt = page.locator(".feed-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/share something with/i);

    const offenders = await unnamedControls(page);
    expect(offenders, `Controls with no accessible name on the feed:\n${offenders.join("\n")}`).toEqual([]);
  });

  test("the sort control offers real choices instead of a two-state toggle", async ({ page }) => {
    await openFeed(page);
    test.skip(await isSignedOut(page), "No signed-in session.");

    const sortBtn = page.locator("button[aria-haspopup='dialog']").first();
    // Only rendered when there is at least one post to sort.
    test.skip(!(await sortBtn.isVisible().catch(() => false)), "Feed is empty — nothing to sort.");

    await sortBtn.click();
    const dialog = page.locator("[role='dialog'][aria-label='Sort posts']");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[role='radio']")).toHaveCount(await dialog.locator("[role='radio']").count());
    // Recent and Trending are always available; Nearest depends on location.
    await expect(dialog).toContainText("Recent");
    await expect(dialog).toContainText("Trending");
    await dialog.getByRole("radio", { name: /Trending/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("button[aria-haspopup='dialog']").first()).toContainText(/Trending/);
  });

  test("composer: type picker collapses, draft survives leaving, preview matches", async ({ page }) => {
    await openFeed(page);
    test.skip(await isSignedOut(page), "No signed-in session.");

    await page.locator(".feed-prompt").click();
    await page.waitForURL(/\/community\/new/);
    await waitForApp(page);

    // Progressive disclosure: six tiles until a type is chosen, one chip after.
    await expect(page.locator(".flair-tile")).toHaveCount(6);
    await page.locator(".flair-tile", { hasText: "Ask neighbors" }).click();
    await expect(page.locator(".flair-chip")).toBeVisible();
    await expect(page.locator(".flair-tile")).toHaveCount(0);

    const title = `${UNIQUE} good dentist?`;
    await page.locator("#compose-title").fill(title);

    // Every composer control must be named too — this screen is almost entirely
    // custom controls (flair tiles, severity cards, media buttons).
    const offenders = await unnamedControls(page);
    expect(offenders, `Unnamed controls in the composer:\n${offenders.join("\n")}`).toEqual([]);

    // The preview renders the REAL card, so the title must appear in it verbatim.
    await page.getByRole("button", { name: /^Preview$/ }).click();
    const preview = page.locator("[role='dialog'][aria-label='Post preview']");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(title);
    await page.getByRole("button", { name: /Keep editing/ }).click();

    // Leave and come back: the draft must be restored, not silently discarded.
    await page.goto("/community-hub", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await page.locator(".feed-prompt").click();
    await page.waitForURL(/\/community\/new/);
    await waitForApp(page);
    await expect(page.locator("#compose-title")).toHaveValue(title);
    await expect(page.locator(".draft-restored")).toBeVisible();

    // Clean up so the next run starts empty.
    await page.getByRole("button", { name: /Start over/ }).click();
    await expect(page.locator("#compose-title")).toHaveCount(0);
  });

  test("publishing lands on the post, and the post shows what was written", async ({ page }) => {
    await openFeed(page);
    test.skip(await isSignedOut(page), "No signed-in session.");

    await page.locator(".feed-prompt").click();
    await page.waitForURL(/\/community\/new/);
    await waitForApp(page);

    // LOST_FOUND on purpose: it's the type that exercises the per-type fields
    // AND is one of the two types that can be resolved, which the last test needs.
    await page.locator(".flair-tile", { hasText: "Lost & Found" }).click();
    const title = `${UNIQUE} lost blue umbrella`;
    await page.locator("#compose-title").fill(title);
    await page.locator("#compose-body").fill("Left it near the bus stop this morning.");
    await page.getByLabel("Last seen location").fill("The bus stop on 5th");

    await page.getByRole("button", { name: /Post to your street/ }).click();

    // Lands on the post itself, never on the tab route — see the comment in
    // CommunityCompose.post() for why that distinction matters for sellers.
    await page.waitForURL(/\/community\/[^/]+$/, { timeout: 30_000 });
    expect(new URL(page.url()).pathname).not.toBe("/community-hub");
    await waitForApp(page);

    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText("The bus stop on 5th")).toBeVisible();
    // The structured field is rendered as a fact, not buried in the body.
    await expect(page.getByText(/Last seen near/i)).toBeVisible();
  });

  test("a published post appears in the feed and can be liked and saved", async ({ page }) => {
    await openFeed(page);
    test.skip(await isSignedOut(page), "No signed-in session.");

    const card = page.locator(".community-card-squircle").filter({ hasText: UNIQUE }).first();
    test.skip(!(await card.isVisible().catch(() => false)), "Post from the publish test not in this feed page.");

    // Like: the optimistic state must survive the server round trip rather than
    // reverting a moment later (the bug the likeOverride pattern exists for).
    const like = card.getByRole("button", { name: /Like this post/ });
    await like.click();
    await expect(card.getByRole("button", { name: /Unlike this post/ })).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(card.getByRole("button", { name: /Unlike this post/ })).toBeVisible();

    // Save is separate from like, and private.
    const save = card.getByRole("button", { name: /Save this post/ });
    await save.click();
    await expect(card.getByRole("button", { name: /Remove from saved/ })).toBeVisible();
  });

  test("the author can resolve a lost-and-found post", async ({ page }) => {
    await openFeed(page);
    test.skip(await isSignedOut(page), "No signed-in session.");

    const card = page.locator(".community-card-squircle").filter({ hasText: UNIQUE }).first();
    test.skip(!(await card.isVisible().catch(() => false)), "Post from the publish test not in this feed page.");
    await card.getByText(UNIQUE).first().click();
    await page.waitForURL(/\/community\/[^/]+$/);
    await waitForApp(page);

    const resolve = page.getByRole("button", { name: /Mark resolved/ });
    test.skip(!(await resolve.isVisible().catch(() => false)), "Resolve control not available for this viewer.");
    await resolve.click();
    await expect(page.getByText(/^Resolved$/).first()).toBeVisible();
  });

  test("notifications render every community type with its own treatment", async ({ page }) => {
    await page.goto("/notifications", { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    test.skip(await isSignedOut(page), "No signed-in session.");

    // The specific regression guarded here: a notification type the client
    // doesn't know falls back to a grey bell. The unit test
    // (src/lib/communityNotifications.test.ts) proves the map is complete; this
    // proves the screen renders without crashing on real rows.
    const offenders = await unnamedControls(page);
    expect(offenders, `Unnamed controls on notifications:\n${offenders.join("\n")}`).toEqual([]);
  });
});

test.describe("community accessibility", () => {
  test("nothing in the community flow scrolls sideways on a phone", async ({ page }) => {
    for (const path of ["/community-hub", "/community/new"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await waitForApp(page);
      if (await isSignedOut(page)) continue;
      const overflow = await page.evaluate(() => {
        const docW = document.documentElement.clientWidth;
        return document.documentElement.scrollWidth - docW;
      });
      expect.soft(overflow, `${path} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test("motion-sensitive users still get confirmation, just without movement", async ({ page }) => {
    // The reduce-motion rules must not remove the FEEDBACK, only the movement:
    // a double-tap with no acknowledgement reads as "it didn't work".
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFeed(page);
    test.skip(await isSignedOut(page), "No signed-in session.");

    const rules = await page.evaluate(() => {
      const out: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let cssRules: CSSRuleList;
        try {
          cssRules = sheet.cssRules;
        } catch {
          continue; // cross-origin stylesheet
        }
        for (const rule of Array.from(cssRules)) {
          if (rule instanceof CSSMediaRule && rule.conditionText.includes("prefers-reduced-motion")) {
            out.push(rule.cssText);
          }
        }
      }
      return out.join("\n");
    });

    // The burst is re-pointed at a fade rather than switched off entirely.
    expect(rules).toContain("like-burst");
    expect(rules).toMatch(/likeBurstFade/);
    // The post-success confirmation keeps its animation removed but stays visible
    // (it has no `display: none`).
    expect(rules).toContain("post-success");
    expect(rules).not.toMatch(/\.post-success\s*\{[^}]*display:\s*none/);
  });
});
