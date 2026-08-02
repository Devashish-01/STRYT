import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { registerSW } from "virtual:pwa-register";

/** Re-check for a new deploy this often while the app stays open. */
const UPDATE_POLL_MS = 60 * 60 * 1000; // 1h

/**
 * Keeps a deployed PWA on the current build.
 *
 * The previous version relied on `onNeedRefresh` to call `updateSW(true)`.
 * That callback only fires for `registerType: "prompt"`; this project uses
 * `"autoUpdate"`, so it never ran — and because the SW is built with
 * `injectManifest`, nothing injected `skipWaiting`/`clientsClaim` either. New
 * deploys installed a worker that waited forever behind the old one, which is
 * why users kept opening a stale build.
 *
 * The activation now happens in the service worker itself (src/sw.js). This
 * component owns the two things that must happen on the PAGE side:
 *
 *   1. Reload once the new worker takes control, so the running tab isn't left
 *      executing old JS against newly-cached assets (mismatched lazy chunks
 *      404 — the failure mode that makes people wary of skipWaiting).
 *   2. Poll for updates. A PWA that's never closed would otherwise only check
 *      at startup and could sit on an old build for days.
 */
export default function ServiceWorkerUpdater() {
  useEffect(() => {
    // Native builds deliberately run no service worker at all — nativeApp.ts
    // unregisters any leftovers, because a SW inside the WebView caches the
    // APK's assets and survives APK updates. Native updates come via
    // @capgo/capacitor-updater instead.
    if (Capacitor.isNativePlatform() || !("serviceWorker" in navigator)) return;

    // A new worker calling clientsClaim() fires `controllerchange`. Reload
    // exactly once — the guard matters because Chrome can fire this more than
    // once and an unguarded reload here is an infinite refresh loop.
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let poll: ReturnType<typeof setInterval> | undefined;
    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        poll = setInterval(() => { void registration.update(); }, UPDATE_POLL_MS);
        // Also check the moment the user comes back to the app — the common
        // real-world case is a phone waking after a deploy went out.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void registration.update();
        });
      },
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (poll) clearInterval(poll);
    };
  }, []);

  return null;
}
