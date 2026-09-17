import { readFileSync } from "fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// Bakes package.json's version into the bundle at build time — this is the
// same field the OTA workflow bumps and publishes, so the running app can
// show/report exactly which bundle it is without needing an env var (the
// previous VITE_APP_VERSION never got set by any workflow, so the one place
// that referenced it — src/lib/monitoring.ts — always saw null).
const appVersion = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")).version as string;
// Unique per deploy even when package.json version is unchanged. Vercel injects
// the git SHA at build time; local/dev falls back to a timestamp so the PWA
// freshness check still works against a freshly built dist/.
const appBuildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  `${appVersion}+${Date.now()}`;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_ID__: JSON.stringify(appBuildId),
  },
  plugins: [
    react(),
    // Emits /version.json so the running PWA can detect a new Vercel deploy
    // without waiting for the service worker's own update cycle alone.
    {
      name: "emit-version-json",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({
            version: appVersion,
            buildId: appBuildId,
            builtAt: new Date().toISOString(),
          }),
        });
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      // injectManifest (not generateSW): our own src/sw.js owns push +
      // notificationclick AND the Workbox caching. generateSW produced a
      // caching-only SW with no push handler, which then fought our separately
      // registered public/sw.js — so on the built app, web push silently died.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "og-image.png"],
      manifest: {
        name: "STRYT — Your Street Marketplace",
        short_name: "STRYT",
        description: "Discover shops, providers, and services on your street.",
        theme_color: "#8b47f5",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        categories: ["lifestyle", "shopping", "utilities"],
        screenshots: [],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // The Sentry SDK loads only when VITE_SENTRY_DSN is set. Precaching it would push ~350 KB to
        // every device for code that never runs without one — the opposite of what P11 spent a phase
        // achieving. Excluded here; it is fetched on demand on the one branch that needs it.
        globIgnores: ["**/sentry-*.js"],
      },
      devOptions: {
        // Enable SW in dev for easy testing (disable if it causes caching issues)
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Split the heavy, independently-cached vendors out of the main app chunk
    // (was ~844 kB). Each is a separate library that changes rarely, so a code
    // change no longer invalidates the whole vendor payload for returning users.
    // Function form (not the object map) because packages like `firebase` are
    // modular and have no bare root entry to resolve — we match by module path.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Firebase is deliberately NOT given a manual chunk: naming one pins it to the entry graph, and it was
          // being preloaded on every page load. Left alone, it lands in the chunk created by the dynamic import in
          // src/lib/firebaseWeb.ts and only downloads when someone signs in with Google (P11.B).
          // Leaflet likewise: main.tsx imports leaflet.css, and a manual chunk matching that path made the whole
          // leaflet JS a static dependency of the entry — 150 KB on every page, though only screens with a map use
          // it. Without the rule it follows those lazy screens (P11.B).
          // @sentry/react must NOT fall into the react rules below: its path contains "/react/", so it
          // was being pinned into vendor-react — the eagerly-loaded chunk — which undid the point of
          // importing it dynamically only when a DSN exists (src/lib/sentry.ts). Measured at +27 KB on
          // vendor-react. Naming it here keeps it a separate chunk with a predictable filename, which
          // is what lets the precache rule below exclude it.
          if (id.includes("@sentry")) return "sentry";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@phosphor-icons") || id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("react-router")) return "vendor-react";
          if (id.includes("/react-dom/")) return "vendor-react";
          if (id.includes("/react/")) return "vendor-react";
          if (id.includes("/scheduler/")) return "vendor-react";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
