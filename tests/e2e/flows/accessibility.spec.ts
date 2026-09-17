import { test, expect, openAs, type PersonaKey } from "../fixtures/staging";
import AxeBuilder from "@axe-core/playwright";
import { BUSINESS, PROVIDER } from "../../../scripts/staging/personas.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * An automated accessibility pass (P13 §13.D3).
 *
 * What this does and does not prove:
 *   - It reads the rendered markup and finds the machine-checkable failures: an image with no alt text, a
 *     button whose only content is an icon, a contrast ratio below the threshold, a form control with no
 *     label. Those are real and worth fixing.
 *   - It does **not** prove the app is usable with a screen reader. axe cannot tell you that the booking
 *     flow makes sense when read aloud, or that focus goes somewhere sensible after a sheet closes. That is
 *     §6 of docs/qa/DEVICE_QA_CHECKLIST.md, on a device, with TalkBack on.
 *
 * Roughly half of real accessibility problems are invisible to a tool like this. Treating a green run as
 * "accessible" would be the mistake; this is a floor, not a ceiling.
 *
 * Deliberately **reports rather than fails**. The findings go to a JSON file and the console so they can be
 * triaged into the ledger. Turning specific rules into hard failures is the right move once the current
 * count is known and driven down — failing the suite on day one would just get the spec skipped.
 */

type Who = PersonaKey | "guest";

/** The screens worth scanning: the ones a customer actually walks, plus one of each console. */
const SCREENS: { route: string; who: Who; name: string }[] = [
  { route: "/home", who: "guest", name: "home (guest)" },
  { route: "/home", who: "customer1", name: "home" },
  { route: "/explore", who: "customer1", name: "explore" },
  { route: "/search", who: "customer1", name: "search" },
  { route: `/business/${BUSINESS.id}`, who: "customer1", name: "business detail" },
  { route: `/provider/${PROVIDER.id}`, who: "customer1", name: "provider detail" },
  { route: "/appointments", who: "customer1", name: "my appointments" },
  { route: "/notifications", who: "customer1", name: "notifications" },
  { route: "/chats", who: "customer1", name: "conversations" },
  { route: "/community", who: "customer1", name: "community" },
  { route: "/account", who: "customer1", name: "account" },
  { route: "/legal", who: "guest", name: "legal index" },
  { route: `/business/${BUSINESS.id}/manage`, who: "owner1", name: "business console" },
];

/** WCAG 2.1 A and AA — the levels a store listing is normally judged against. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

type Finding = {
  screen: string;
  route: string;
  rule: string;
  impact: string;
  help: string;
  nodes: number;
  sample: string;
};

const findings: Finding[] = [];

for (const screen of SCREENS) {
  test(`a11y: ${screen.name}`, async ({ browser }) => {
    const { context, page } = await openAs(browser, screen.who);
    try {
      await page.goto(screen.route);
      // The breadth spec's own rule: a screen is not ready while a skeleton is on it.
      await page.waitForLoadState("networkidle").catch(() => {});
      await expect(page.locator(".skel")).toHaveCount(0, { timeout: 15_000 }).catch(() => {});

      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

      for (const v of results.violations) {
        findings.push({
          screen: screen.name,
          route: screen.route,
          rule: v.id,
          impact: v.impact ?? "unknown",
          help: v.help,
          nodes: v.nodes.length,
          sample: (v.nodes[0]?.html ?? "").slice(0, 160),
        });
      }

      const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      console.log(
        `[a11y] ${screen.name}: ${results.violations.length} rule(s), ${serious.length} serious/critical`,
      );
      for (const v of serious) {
        console.log(`  ${(v.impact ?? "").padEnd(8)} ${v.id} (${v.nodes.length}) — ${v.help}`);
      }

      // Reporting pass, not a gate — see the file header.
      expect(results.violations.length).toBeGreaterThanOrEqual(0);
    } finally {
      await context.close();
    }
  });
}

test.afterAll(() => {
  const out = "test-results-e2e/a11y-findings.json";
  try {
    mkdirSync(dirname(out), { recursive: true });
    const byRule = new Map<string, { rule: string; impact: string; help: string; screens: string[]; nodes: number }>();
    for (const f of findings) {
      const e = byRule.get(f.rule) ?? { rule: f.rule, impact: f.impact, help: f.help, screens: [], nodes: 0 };
      if (!e.screens.includes(f.screen)) e.screens.push(f.screen);
      e.nodes += f.nodes;
      byRule.set(f.rule, e);
    }
    const summary = [...byRule.values()].sort((a, b) => b.nodes - a.nodes);
    writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), summary, findings }, null, 2));

    console.log(`\n[a11y] ${findings.length} finding(s) across ${SCREENS.length} screens → ${out}`);
    for (const r of summary) {
      console.log(`  ${String(r.impact).padEnd(8)} ${r.rule.padEnd(32)} ${String(r.nodes).padStart(4)} node(s)  ${r.screens.length} screen(s)`);
    }
  } catch (err) {
    console.log("[a11y] could not write the findings file:", err);
  }
});
