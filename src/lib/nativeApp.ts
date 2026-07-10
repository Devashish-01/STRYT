import { Capacitor } from "@capacitor/core";

/**
 * One-time native wrapper setup (Android/iOS). No-ops on the web build.
 *
 * NOTE: hardware back-button + status-bar styling are already owned by
 * App.tsx's own useEffect (registered there before this file existed) — do
 * NOT duplicate them here. An earlier version of this file did, which meant
 * every back-press fired two listeners (double navigation-pop) and two
 * conflicting StatusBar.setStyle calls (Dark vs Light) raced on boot.
 *
 * Plugins are imported dynamically so a missing/uninstalled optional plugin
 * (e.g. on web) can never crash bootstrap.
 */
export async function initNativeApp(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // ── Kill any leftover service worker inside the WebView ──────────────────
  // Older builds registered a SW (a caching-only Workbox SW + a hand-written
  // push SW). Inside Capacitor that SW precaches the APK's bundled assets, and
  // its Cache Storage SURVIVES APK updates — so after installing a new APK the
  // old cached shell keeps being served, showing the stale screen until the app
  // is force-killed a few times. We never want a SW natively, so unregister any
  // that exist and wipe their caches. Safe no-op once none remain.
  void (async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* best-effort cleanup — never block boot */ }
  })();

  // ── OTA updater: confirm this bundle booted successfully ─────────────────
  // @capgo/capacitor-updater auto-rolls back to the previous bundle if
  // notifyAppReady() isn't called within appReadyTimeout (10s default) of
  // launch — its safety net against a bad OTA update bricking the app. Call it
  // as early as possible (before React even mounts) so a slow first render
  // never eats into that budget and triggers a false rollback.
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    await CapacitorUpdater.notifyAppReady();
  } catch { /* updater plugin absent — ignore */ }

  // Start listening for downloaded OTA bundles so the "Update available" button
  // on the profile screens can light up. Registered here (early) so the
  // updateAvailable event is never missed if it fires before a screen mounts.
  try {
    const { initAppUpdates } = await import("./appUpdate");
    await initAppUpdates();
  } catch { /* ignore */ }

  // Enables the native safe-area floor in index.css so headers never sit under
  // the status bar / notch even when the WebView reports a zero inset.
  document.documentElement.classList.add("native-safe");

  // ── Keyboard: resize the web view so inputs aren't hidden behind it ──────
  try {
    const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
  } catch { /* keyboard plugin absent — ignore */ }

  // ── Splash: hide once React has mounted (called after initNativeApp) ─────
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch { /* splash plugin absent — ignore */ }
}
