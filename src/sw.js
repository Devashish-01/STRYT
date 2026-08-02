// STRYT service worker (vite-plugin-pwa injectManifest source).
// One SW that does BOTH: (1) Workbox precache/runtime caching for the PWA
// shell, and (2) web-push receive + notification tap routing. Previously these
// were split across a generated caching-only SW and a separate hand-written
// push SW that fought each other, which killed web push on the built app.

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { clientsClaim } from "workbox-core";

// ── Take over immediately ───────────────────────────────────────────────────
// REQUIRED, and the reason deployed users were stuck on old builds.
//
// vite-plugin-pwa injects skipWaiting/clientsClaim automatically ONLY for
// `strategies: "generateSW"`. This project uses `injectManifest` (so one SW can
// own both caching and push), which means the plugin injects nothing and these
// have to be written by hand. They weren't. And `registerType: "autoUpdate"`
// never calls `onNeedRefresh`, so ServiceWorkerUpdater's `updateSW(true)` never
// ran either, and nothing in the app ever posted the SKIP_WAITING message the
// handler at the bottom of this file listens for.
//
// Net effect: every new deploy installed a SW that sat in `waiting` forever.
// The old worker kept serving the old bundle until the user closed every tab /
// fully killed the PWA — which on a phone is close to never. That is the
// "sometimes I get the old version" report.
//
// Safe because the client reloads on `controllerchange` (see
// ServiceWorkerUpdater): the new worker claims the page and the page
// immediately reloads, so old JS never runs against new assets.
self.skipWaiting();
clientsClaim();

// ── Precache (self.__WB_MANIFEST is injected at build time) ──────────────────
// Drop precaches from previous Workbox versions/deploys so storage doesn't grow
// forever and a stale shell can't be resurrected.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// SPA navigation fallback → Network-First with cached index.html fallback
registerRoute(
  new NavigationRoute(
    async ({ event }) => {
      try {
        // Try network first to get the latest index.html from Vercel
        const networkPromise = fetch(event.request);
        // Timeout after 3 seconds to avoid hanging on slow/flaky networks
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 3000)
        );
        return await Promise.race([networkPromise, timeoutPromise]);
      } catch (error) {
        // Fall back to the cached index.html if offline/network fails.
        // `ignoreSearch` matters: Workbox stores precached entries under a
        // revisioned URL (`/index.html?__WB_REVISION__=…`), so a bare
        // caches.match("/index.html") missed it and the offline fallback
        // silently did nothing.
        const cache = await caches.match("/index.html", { ignoreSearch: true });
        if (cache) return cache;
        throw error;
      }
    },
    { denylist: [/^\/api\//, /^\/supabase\//] }
  )
);

// Supabase REST — network-first with a short cache fallback
registerRoute(
  /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
  new NetworkFirst({
    cacheName: "supabase-api-cache",
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 5 * 60 })],
  })
);

// Google Fonts — cache-first, long-lived
registerRoute(
  /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
  new CacheFirst({
    cacheName: "google-fonts-cache",
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 })],
  })
);

// ── Web push ────────────────────────────────────────────────────────────────
self.addEventListener("push", function (event) {
  let data = { title: "STRYT", body: "You have a new notification", url: "/", type: "SYSTEM" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    try { data.body = event.data.text(); } catch { /* use defaults */ }
  }

  const deepLink = data.url || data.deepLink || "/";

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      // PNG, not SVG — several browsers silently drop SVG notification icons.
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Group by type so a burst of the same kind coalesces into one banner.
      tag: data.type || "STRYT",
      renotify: true, // still alerts (sound/vibrate) when a tagged banner updates
      vibrate: [200, 100, 200],
      requireInteraction: false,
      data: { deepLink },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const deepLink = (event.notification.data && event.notification.data.deepLink) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if (c.url.includes(self.location.origin) && "focus" in c) {
          c.postMessage({ type: "NAVIGATE", path: deepLink });
          return c.focus();
        }
      }
      return self.clients.openWindow(deepLink);
    })
  );
});

// Kept as a manual escape hatch (and for any older client still posting it).
// The real activation path is the top-level skipWaiting()/clientsClaim() above
// — this message was never sent by anything in the app.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
