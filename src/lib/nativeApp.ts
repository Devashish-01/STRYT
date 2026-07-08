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
