import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { BackgroundGeolocation } from "@capgo/background-geolocation";

/**
 * Continuous location watcher for live share (Cap 8).
 *
 * Native (preferred): @capgo/background-geolocation with backgroundMessage →
 * foreground-service notification so fixes continue while backgrounded /
 * screen locked. Show BackgroundLocationDisclosure BEFORE start().
 *
 * Fallback: @capacitor/geolocation watchPosition (foreground only).
 * Web: navigator.geolocation.watchPosition.
 */

export interface Fix {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
}
type FixCb = (f: Fix) => void;

const MIN_INTERVAL_MS = 12000;

let webWatchId: number | null = null;
let capWatchId: string | null = null;
let bgActive = false;
let lastPush = 0;

function throttled(cb: FixCb): FixCb {
  return (f) => {
    const now = Date.now();
    if (now - lastPush < MIN_INTERVAL_MS) return;
    lastPush = now;
    cb(f);
  };
}

/** Notification permission so the Android FGS notification can display. */
export async function ensureLocationNotificationPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let status = await PushNotifications.checkPermissions();
    if (status.receive === "prompt") {
      status = await PushNotifications.requestPermissions();
    }
  } catch {
    /* optional */
  }
}

export const backgroundLocation = {
  async start(onFix: FixCb): Promise<"background" | "foreground" | "web"> {
    await this.stop();
    lastPush = 0;
    const push = throttled(onFix);

    if (Capacitor.isNativePlatform()) {
      await ensureLocationNotificationPermission();
      try {
        // Prefer Capgo's permission helper when available (fine + background + notify).
        // After in-app disclosure: fine location → background/Always → notification.
        await BackgroundGeolocation.requestPermissions({
          permissions: ["location", "backgroundLocation", "notification"],
        });

        await BackgroundGeolocation.start(
          {
            backgroundMessage:
              "Sharing your live location with My People. Open STRYT to stop.",
            backgroundTitle: "STRYT live location",
            requestPermissions: false,
            stale: false,
            distanceFilter: 15,
          },
          (loc, err) => {
            if (err || !loc) return;
            push({
              lat: loc.latitude,
              lng: loc.longitude,
              accuracy: loc.accuracy,
              heading: loc.bearing ?? undefined,
            });
          },
        );
        bgActive = true;
        return "background";
      } catch (err) {
        console.warn("[backgroundLocation] Capgo watcher failed, using foreground:", err);
        bgActive = false;
      }

      capWatchId = await Geolocation.watchPosition({ enableHighAccuracy: true }, (pos, err) => {
        if (err || !pos) return;
        push({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading ?? undefined,
        });
      });
      return "foreground";
    }

    if ("geolocation" in navigator) {
      webWatchId = navigator.geolocation.watchPosition(
        (pos) =>
          push({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading ?? undefined,
          }),
        undefined,
        { enableHighAccuracy: true, maximumAge: 10000 },
      );
    }
    return "web";
  },

  async stop(): Promise<void> {
    if (bgActive) {
      try {
        await BackgroundGeolocation.stop();
      } catch {
        /* ignore */
      }
      bgActive = false;
    }
    if (capWatchId) {
      try {
        await Geolocation.clearWatch({ id: capWatchId });
      } catch {
        /* ignore */
      }
      capWatchId = null;
    }
    if (webWatchId !== null) {
      navigator.geolocation.clearWatch(webWatchId);
      webWatchId = null;
    }
  },

  openSettings(): void {
    if (!Capacitor.isNativePlatform()) return;
    void BackgroundGeolocation.openSettings();
  },
};
