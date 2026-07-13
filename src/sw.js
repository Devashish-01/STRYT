// STRYT service worker (vite-plugin-pwa injectManifest source).
// One SW that does BOTH: (1) Workbox precache/runtime caching for the PWA
// shell, and (2) web-push receive + notification tap routing. Previously these
// were split across a generated caching-only SW and a separate hand-written
// push SW that fought each other, which killed web push on the built app.

import { precacheAndRoute } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

// ── Precache (self.__WB_MANIFEST is injected at build time) ──────────────────
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
        // Fall back to the cached index.html if offline/network fails
        const cache = await caches.match("/index.html");
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

// autoUpdate: activate a new SW immediately so push-handler fixes ship without
// waiting for every tab to close.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
