/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** package.json's version, baked in at build time — see vite.config.ts. */
declare const __APP_VERSION__: string;
/** Per-deploy build id (Vercel git SHA when available) — see vite.config.ts. */
declare const __APP_BUILD_ID__: string;
