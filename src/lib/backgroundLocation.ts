import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

// One continuous location watcher used while a live share is active. It pushes
// throttled fixes to `onFix` (the caller forwards them to update_live_share).
//
// Three tiers, best available wins:
//   1. @capacitor-community/background-geolocation — TRUE background: keeps
//      updating when the app is backgrounded / the screen is locked (the
//      safety-grade path). Loaded via a guarded dynamic import so the web
//      build and un-synced native builds don't require the module to exist.
//   2. @capacitor/geolocation watchPosition — native foreground watch.
//   3. navigator.geolocation.watchPosition — web.
//
// NATIVE SETUP (one-time, done outside the web build):
//   npm i @capacitor-community/background-geolocation && npx cap sync
//   + ACCESS_BACKGROUND_LOCATION in AndroidManifest (already added) + the
//   Play Store background-location disclosure.

export interface Fix {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
}
type FixCb = (f: Fix) => void;

const MIN_INTERVAL_MS = 12000; // ~1 push / 12s — enough for "live", easy on battery

let webWatchId: number | null = null;
let capWatchId: string | null = null;
let bgRemove: (() => Promise<void>) | null = null;
let lastPush = 0;

function throttled(cb: FixCb): FixCb {
  return (f) => {
    const now = Date.now();
    if (now - lastPush < MIN_INTERVAL_MS) return;
    lastPush = now;
    cb(f);
  };
}

export const backgroundLocation = {
  async start(onFix: FixCb): Promise<void> {
    await this.stop();
    lastPush = 0;
    const push = throttled(onFix);

    if (Capacitor.isNativePlatform()) {
      // Tier 1 — true background. Specifier kept in a string variable so the
      // web/un-synced build neither type-resolves nor bundles the native module.
      try {
        const spec: string = "@capacitor-community/background-geolocation";
        const mod: any = await import(/* @vite-ignore */ spec);
        const BG = mod.BackgroundGeolocation ?? mod.default;
        const id: string = await BG.addWatcher(
          {
            requestPermissions: true,
            stale: false,
            distanceFilter: 15,
            backgroundTitle: "STRYT live location",
            backgroundMessage: "Sharing your live location with your emergency contacts",
          },
          (loc: any, err: any) => {
            if (err || !loc) return;
            push({ lat: loc.latitude, lng: loc.longitude, accuracy: loc.accuracy, heading: loc.bearing });
          }
        );
        bgRemove = () => BG.removeWatcher({ id });
        return;
      } catch {
        // Plugin not installed/synced yet — fall through to foreground watch.
      }
      // Tier 2 — native foreground.
      capWatchId = await Geolocation.watchPosition({ enableHighAccuracy: true }, (pos, err) => {
        if (err || !pos) return;
        push({
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy, heading: pos.coords.heading ?? undefined,
        });
      });
      return;
    }

    // Tier 3 — web.
    if ("geolocation" in navigator) {
      webWatchId = navigator.geolocation.watchPosition(
        (pos) => push({
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy, heading: pos.coords.heading ?? undefined,
        }),
        undefined,
        { enableHighAccuracy: true, maximumAge: 10000 }
      );
    }
  },

  async stop(): Promise<void> {
    if (bgRemove) { try { await bgRemove(); } catch { /* ignore */ } bgRemove = null; }
    if (capWatchId) { try { await Geolocation.clearWatch({ id: capWatchId }); } catch { /* ignore */ } capWatchId = null; }
    if (webWatchId !== null) { navigator.geolocation.clearWatch(webWatchId); webWatchId = null; }
  },
};
