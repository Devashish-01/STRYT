import { test, expect, openAs, knownBug, type PersonaKey } from "../fixtures/staging";
import { BUSINESS, PROVIDER, PERSONAS } from "../../../scripts/staging/personas.mjs";

// Breadth coverage: every flow's screens, opened by the persona that uses them, on staging.
// Each route must land where it should (including guards that redirect), finish loading (no `.skel`
// skeletons left), throw no page errors, make no failing Supabase call and show no "Couldn't load" toast.
// Known bugs are `fixme` with their E2E id (tracked in docs/gaps/GAP_LEDGER.csv).

type Who = PersonaKey | "guest";
type Row = { flow: string; who: Who; route: string; lands?: string; fixme?: string };

const B = `/business/${BUSINESS.id}`;
const P = `/provider/${PROVIDER.id}`;
const OWNER_ID = PERSONAS.find((p: { key: string }) => p.key === "owner1").id;

const ROWS: Row[] = [
  // Domain 0 — onboarding & guest
  { flow: "0.2", who: "customer1", route: "/onboard/business" },
  { flow: "0.3", who: "customer1", route: "/onboard/provider" },
  { flow: "0.4", who: "guest", route: "/home" },
  { flow: "0.4", who: "guest", route: "/explore" },
  { flow: "0.4", who: "guest", route: B },
  { flow: "0.4", who: "guest", route: P },
  { flow: "0.4", who: "guest", route: "/requests", lands: "/explore" },
  { flow: "0.4", who: "guest", route: "/appointments", lands: "/auth/phone" },
  { flow: "0.4", who: "guest", route: "/legal" },
  { flow: "0.4", who: "guest", route: "/guide" },
  // Domain 1 — discovery
  { flow: "1.1", who: "customer1", route: "/home" },
  { flow: "1.1", who: "customer1", route: "/explore" },
  { flow: "1.2", who: "customer1", route: "/search" },
  { flow: "1.2", who: "guest", route: "/search" },
  { flow: "1.3", who: "customer1", route: "/map" },
  { flow: "1.3", who: "guest", route: "/map" },
  { flow: "1.4", who: "customer1", route: "/categories" },
  { flow: "1.4", who: "customer1", route: "/category/c-beauty-salon" },
  { flow: "1.4", who: "guest", route: "/category/c-beauty-salon" },
  { flow: "1.5", who: "customer1", route: "/place/new" },
  // Domain 2 — booking
  { flow: "2.1", who: "customer1", route: B },
  { flow: "2.1", who: "customer1", route: P },
  { flow: "2.2", who: "customer1", route: "/appointments" },
  { flow: "2.3", who: "owner1", route: `${B}/manage/appointments` },
  { flow: "2.3", who: "staff_appointments", route: `${B}/manage/appointments` },
  { flow: "2.4", who: "provider1", route: `${P}/manage/jobs` },
  { flow: "2.5", who: "owner1", route: `${B}/manage/hours` },
  // Domain 3 — queue
  { flow: "3.1", who: "customer1", route: "/queues" },
  { flow: "3.2", who: "owner1", route: `${B}/manage/queue` },
  { flow: "3.2", who: "staff_queue", route: `${B}/manage/queue` },
  // Domain 4 — requests & agreements
  { flow: "4.1", who: "customer1", route: "/ask" },
  { flow: "4.1", who: "customer1", route: "/explore?tab=requests" },
  { flow: "4.2", who: "owner1", route: `${B}/manage/requests` },
  { flow: "4.2", who: "provider1", route: `${P}/manage/find-work` },
  { flow: "4.3", who: "customer1", route: "/agreements" },
  // Domain 5 — delivery (deferred to v1.1 by D2: routes must stay hidden)
  { flow: "5.1", who: "owner1", route: `${B}/manage/deliveries`, lands: `${B}/manage` },
  { flow: "5.2", who: "customer1", route: "/delivery", lands: "/home" },
  // Domain 6 — chat
  { flow: "6.1", who: "customer1", route: "/chats" },
  { flow: "6.1", who: "owner1", route: "/chats" },
  // Domain 7 — merchant console
  { flow: "7.1", who: "owner1", route: "/account/business-access" },
  { flow: "7.1", who: "staff_queue", route: "/account/business-access" },
  { flow: "7.1", who: "staff_queue", route: `${B}/manage/appointments`, lands: `${B}/manage` },
  { flow: "7.1", who: "staff_queue", route: `${B}/manage/settings`, lands: `${B}/manage` },
  { flow: "7.1", who: "staff_appointments", route: `${B}/manage/queue`, lands: `${B}/manage` },
  { flow: "7.2", who: "owner1", route: `${B}/manage/catalog` },
  { flow: "7.2", who: "owner1", route: `${B}/manage/store` },
  { flow: "7.3", who: "owner1", route: `${B}/manage/hours` },
  { flow: "7.4", who: "owner1", route: `${B}/manage/bulk-deals` },
  { flow: "7.4", who: "customer1", route: "/community/activity" },
  { flow: "7.5", who: "owner1", route: `${B}/manage/profile` },
  { flow: "7.5", who: "owner1", route: `${B}/manage/edit-profile` },
  { flow: "7.6", who: "owner1", route: `${B}/manage/portfolio` },
  { flow: "7.7", who: "owner1", route: `${B}/manage/qna` },
  { flow: "7.8", who: "owner1", route: `${B}/manage/inventory` },
  { flow: "7.9", who: "owner1", route: `${B}/manage/broadcast` },
  { flow: "7.10", who: "owner1", route: `${B}/manage/verify` },
  { flow: "7.x", who: "owner1", route: `${B}/manage` },
  { flow: "7.x", who: "owner1", route: `${B}/manage/business` },
  { flow: "7.x", who: "owner1", route: `${B}/manage/inbox` },
  { flow: "7.x", who: "owner1", route: `${B}/manage/payments` },
  { flow: "7.x", who: "owner1", route: `${B}/manage/settings` },
  { flow: "7.x", who: "owner1", route: `${B}/manage/community` },
  // Domain 8 — provider console
  { flow: "8.x", who: "provider1", route: `${P}/manage` },
  { flow: "8.x", who: "provider1", route: `${P}/manage/profile` },
  { flow: "8.x", who: "provider1", route: `${P}/manage/edit-profile` },
  { flow: "8.1", who: "provider1", route: `${P}/manage/catalog` },
  { flow: "8.1", who: "provider1", route: `${P}/manage/inventory` },
  { flow: "8.2", who: "provider1", route: `${P}/manage/availability` },
  { flow: "8.3", who: "provider1", route: `${P}/manage/portfolio` },
  { flow: "8.4", who: "provider1", route: `${P}/manage/inbox` },
  { flow: "8.5", who: "provider1", route: `${P}/manage/money` },
  { flow: "8.6", who: "provider1", route: `${P}/manage/verify` },
  { flow: "8.x", who: "provider1", route: `${P}/manage/community` },
  { flow: "8.x", who: "provider1", route: `${P}/manage/settings` },
  { flow: "8.x", who: "provider1", route: `${P}/manage/reviews` },
  // Domain 9 — community & trust
  { flow: "9.1", who: "customer1", route: "/community-hub" },
  { flow: "9.1", who: "guest", route: "/community-hub" },
  { flow: "9.1", who: "customer1", route: "/community/new" },
  { flow: "9.1", who: "customer1", route: "/story/new" },
  { flow: "9.3", who: "owner1", route: `${B}/manage/reviews` },
  { flow: "9.5", who: "customer1", route: "/bookmarks" },
  { flow: "9.5", who: "customer1", route: "/lists" },
  // Domain 10 — safety
  { flow: "10.1", who: "customer1", route: "/safety/contacts" },
  { flow: "10.2", who: "customer1", route: "/safety" },
  // Domain 11 — account & platform
  { flow: "11.1", who: "owner1", route: "/manage" },
  { flow: "11.2", who: "customer1", route: "/profile" },
  { flow: "11.2", who: "customer1", route: "/profile/edit" },
  { flow: "11.2", who: "customer1", route: "/settings/privacy" },
  { flow: "11.2", who: "customer1", route: `/u/${OWNER_ID}` },
  { flow: "11.2", who: "customer1", route: "/followers" },
  { flow: "11.2", who: "customer1", route: "/my-activity" },
  { flow: "11.2", who: "customer1", route: "/achievements" },
  { flow: "11.3", who: "customer1", route: "/notifications" },
  { flow: "11.3", who: "owner1", route: `/notifications?scope=BUSINESS&id=${BUSINESS.id}` },
  { flow: "11.3", who: "customer1", route: "/settings/notifications" },
  { flow: "11.4", who: "customer1", route: "/settings/security" },
  { flow: "11.5", who: "customer1", route: "/settings/data" },
  { flow: "11.5", who: "customer1", route: "/account" },
  { flow: "11.x", who: "customer1", route: "/settings/discovery" },
  { flow: "11.x", who: "customer1", route: "/settings/language" },
  { flow: "11.x", who: "customer1", route: "/settings/location" },
  { flow: "11.x", who: "customer1", route: "/support" },
  { flow: "11.6", who: "admin1", route: "/admin" },
];

const WHO: Who[] = ["guest", "customer1", "owner1", "staff_queue", "staff_appointments", "provider1", "admin1"];

for (const who of WHO) {
  test.describe(`screens as ${who}`, () => {
    for (const row of ROWS.filter((r) => r.who === who)) {
      test(`${row.flow} ${row.route}`, async ({ browser }) => {
        if (row.fixme) knownBug(row.fixme);
        const { context, page } = await openAs(browser, who);
        const failed: string[] = [];
        const pageErrors: string[] = [];
        page.on("response", (r) => {
          if (r.status() >= 400 && /supabase\.co/.test(r.url())) failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
        });
        page.on("pageerror", (e) => pageErrors.push(e.message));
        // The error toast disappears after ~2s, so record it whenever it shows up during the load (E2E-005 was a
        // toast that appeared ~1s after the skeletons were gone and slipped past a one-off check).
        await page.addInitScript(() => {
          const seen: string[] = ((window as unknown as { __e2eErrorToasts: string[] }).__e2eErrorToasts = []);
          const watch = () =>
            new MutationObserver(() => {
              const text = document.body?.innerText ?? "";
              const m = text.match(/Couldn.t load[^\n]*/);
              if (m && !seen.includes(m[0])) seen.push(m[0]);
            }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
          if (document.documentElement) watch();
          else document.addEventListener("DOMContentLoaded", watch);
        });

        await page.goto(row.route);
        const expected = row.lands ?? row.route.split("?")[0];
        await expect(page).toHaveURL((u) => u.pathname === expected, { timeout: 20_000 });
        await expect(page.locator(".skel")).toHaveCount(0, { timeout: 25_000 });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        const errorToasts = await page.evaluate(() => (window as unknown as { __e2eErrorToasts?: string[] }).__e2eErrorToasts ?? []);
        expect(errorToasts, "error toasts shown while loading").toEqual([]);
        expect(pageErrors, "page errors").toEqual([]);
        expect(failed, "failing Supabase calls").toEqual([]);
        await context.close();
      });
    }
  });
}
