import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
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
      workbox: {
        // Cache page navigations + static assets
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Supabase REST API — network-first, fall back to cache
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api-cache",
              expiration: { maxEntries: 60, maxAgeSeconds: 5 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Google Fonts / external CDN assets
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
        // Return cached shell for all navigation requests (SPA routing)
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/supabase\//],
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
  server: {
    port: 5173,
    host: true,
  },
});
