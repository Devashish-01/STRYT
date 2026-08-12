import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { registerSW } from "virtual:pwa-register";

/** Re-check for a new deploy this often while the app stays open. */
const UPDATE_POLL_MS = 5 * 60 * 1000; // 5m

type VersionPayload = { version?: string; buildId?: string };

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
 * component owns the page-side duties:
 *
 *   1. Reload once the new worker takes control, so the running tab isn't left
 *      executing old JS against newly-cached assets (mismatched lazy chunks
 *      404 — the failure mode that makes people wary of skipWaiting).
 *   2. Poll for SW updates + compare /version.json to the baked-in
 *      __APP_BUILD_ID__. A PWA that's never closed would otherwise only check
 *      at startup and could sit on an old MapView (or any screen) for hours.
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
    const reloadOnce = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    const onControllerChange = () => reloadOnce();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    /** Fetch the deploy stamp Vercel just published; reload if we are behind. */
    const checkDeployVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as VersionPayload;
        if (!data.buildId || data.buildId === __APP_BUILD_ID__) return;
        // One reload attempt per target build in this tab — avoids a loop if
        // the SW update is slow but version.json is already on the new deploy.
        const guardKey = "stry-build-reload";
        if (sessionStorage.getItem(guardKey) === data.buildId) return;
        sessionStorage.setItem(guardKey, data.buildId);
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
        // Give skipWaiting a brief window; then reload so a version.json
        // mismatch never leaves the tab on the old map shell.
        window.setTimeout(reloadOnce, 400);
      } catch {
        // Offline / blocked — leave the current build alone.
      }
    };

    let poll: ReturnType<typeof setInterval> | undefined;
    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        const tick = () => {
          void registration.update();
          void checkDeployVersion();
        };
        poll = setInterval(tick, UPDATE_POLL_MS);
        // Also check the moment the user comes back to the app — the common
        // real-world case is a phone waking after a deploy went out.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") tick();
        });
        // First check shortly after boot so a tab left open overnight is not
        // the only path that catches a midday deploy.
        window.setTimeout(tick, 15_000);
      },
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (poll) clearInterval(poll);
    };
  }, []);

  return null;
}
