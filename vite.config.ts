import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // injectManifest (not generateSW): our own src/sw.js owns push +
      // notificationclick AND the Workbox caching. generateSW produced a
      // caching-only SW with no push handler, which then fought our separately
      // registered public/sw.js — so on the built app, web push silently died.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
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
          if (id.includes("firebase")) return "vendor-firebase";
          if (id.includes("leaflet")) return "vendor-map"; // leaflet + react-leaflet
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
