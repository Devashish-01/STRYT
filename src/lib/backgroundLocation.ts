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

/** The persistent notification Android shows while location is collected in the background. */
export interface ForegroundNotice {
  title: string;
  message: string;
}

/**
 * What the notification says during a My People live share — the only background-location use declared to
 * Google Play for v1.0. It must describe that feature: a reviewer watches this notification in the demo video,
 * and it used to read "Sharing live location for active deliveries", a feature that is off in this release.
 * Keep it in step with docs/launch/play-console/BACKGROUND_LOCATION_VIDEO_SCRIPT.md.
 */
export const LIVE_SHARE_NOTICE: ForegroundNotice = {
  title: "STRYT live location",
  message: "Sharing your live location with My People until you stop. Open STRYT to stop sharing.",
};

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
  async start(onFix: FixCb, notice: ForegroundNotice = LIVE_SHARE_NOTICE): Promise<"background" | "foreground" | "web"> {
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
            backgroundMessage: notice.message,
            backgroundTitle: notice.title,
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

  /**
   * Whether background ("Allow all the time") location is actually granted right now. Read from the OS,
   * not remembered: the user can revoke it in Settings at any time. False when it cannot be read.
   */
  async hasBackgroundPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const status = await BackgroundGeolocation.checkPermissions();
      return status.backgroundLocation === "granted" || status.backgroundLocation === "always";
    } catch {
      return false;
    }
  },

  /**
   * Whether the in-app prominent disclosure must be shown before start() asks for background location.
   *
   * Google Play requires the disclosure immediately before the runtime request. It used to be shown once
   * per install behind a localStorage flag, so a user who denied the system dialog was asked again with no
   * disclosure in front of it. Now: shown whenever the permission is not granted. If the check fails, the
   * answer is "show it" — the safe direction for a compliance gate. Web never asks for background location.
   */
  async needsBackgroundDisclosure(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    return !(await this.hasBackgroundPermission());
  },

  openSettings(): void {
    if (!Capacitor.isNativePlatform()) return;
    void BackgroundGeolocation.openSettings();
  },
};
