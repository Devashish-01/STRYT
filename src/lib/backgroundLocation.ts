import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { BackgroundGeolocation } from "@capgo/background-geolocation";

/**
 * Continuous location watcher for live share (Cap 8) and delivery tracking.
 *
 * Native (preferred): @capgo/background-geolocation with backgroundMessage →
 * foreground-service notification so fixes continue while backgrounded /
 * screen locked. Show BackgroundLocationDisclosure BEFORE start().
 *
 * Fallback: @capacitor/geolocation watchPosition (foreground only).
 * Web: navigator.geolocation.watchPosition.
 *
 * There is one device position, so there is one watcher. Features subscribe to it as an *owner*: the watcher starts with the
 * first owner and stops when the last one leaves, so a rider who is also live-sharing with My People keeps both going and
 * ending one never silences the other. Each owner has its own callback and its own throttle.
 */

export interface Fix {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
}
type FixCb = (f: Fix) => void;

/** Who is listening. Starting the same owner again replaces its callback (it does not restart the watcher). */
export type LocationOwner = "live-share" | "delivery";

/** The persistent notification Android shows while location is collected in the background. */
export interface ForegroundNotice {
  title: string;
  message: string;
}

/**
 * What the notification says during a My People live share — the only background-location use declared to
 * Google Play for v1.0. It must describe that feature: a reviewer watches this notification in the demo video,
 * and it used to read "Sharing live location for active deliveries", a feature that is off in this release.
 * Keep it in step with archive/docs/launch/play-console/BACKGROUND_LOCATION_VIDEO_SCRIPT.md.
 */
export const LIVE_SHARE_NOTICE: ForegroundNotice = {
  title: "STRYT live location",
  message: "Sharing your live location with My People until you stop. Open STRYT to stop sharing.",
};

const MIN_INTERVAL_MS = 12000;
/** A fix this fresh is handed to an owner that joins a watcher already running, instead of making it wait for movement. */
const JOIN_FIX_MAX_AGE_MS = 30_000;

type Mode = "background" | "foreground" | "web";
interface Sub {
  onFix: FixCb;
  notice: ForegroundNotice;
  lastPush: number;
}

let webWatchId: number | null = null;
let capWatchId: string | null = null;
let bgActive = false;

const subs = new Map<LocationOwner, Sub>();
let runningMode: Mode | null = null;
let runningNotice: ForegroundNotice | null = null;
let lastFix: { fix: Fix; at: number } | null = null;
/** start/stop touch native state across awaits, so they run one at a time. */
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

function deliver(sub: Sub, f: Fix, now: number) {
  if (now - sub.lastPush < MIN_INTERVAL_MS) return;
  sub.lastPush = now;
  try {
    sub.onFix(f);
  } catch (err) {
    console.warn("[backgroundLocation] a listener threw:", err);
  }
}

function dispatch(f: Fix) {
  const now = Date.now();
  lastFix = { fix: f, at: now };
  for (const sub of subs.values()) deliver(sub, f, now);
}

/** Live share is the use declared to Play, so when it is among the owners the notification describes it. */
function pickNotice(): ForegroundNotice {
  return subs.get("live-share")?.notice ?? subs.values().next().value?.notice ?? LIVE_SHARE_NOTICE;
}

const sameNotice = (a: ForegroundNotice | null, b: ForegroundNotice) => !!a && a.title === b.title && a.message === b.message;

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

async function startWatcher(notice: ForegroundNotice): Promise<Mode> {
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
          dispatch({
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
      dispatch({
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
        dispatch({
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
}

async function stopWatcher(): Promise<void> {
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
  runningMode = null;
  runningNotice = null;
}

export const backgroundLocation = {
  /**
   * Subscribe `owner` to device position. Starts the watcher if nothing else is using it; otherwise joins the one that is
   * running (restarting it only if the notification wording has to change), and is handed the latest fix if it is fresh.
   */
  start(onFix: FixCb, notice: ForegroundNotice = LIVE_SHARE_NOTICE, owner: LocationOwner = "live-share"): Promise<Mode> {
    return serial(async () => {
      const sub: Sub = { onFix, notice, lastPush: 0 };
      subs.set(owner, sub);
      const wanted = pickNotice();
      try {
        if (runningMode && !sameNotice(runningNotice, wanted)) await stopWatcher();
        if (!runningMode) {
          runningMode = await startWatcher(wanted);
          runningNotice = wanted;
        } else if (lastFix && Date.now() - lastFix.at <= JOIN_FIX_MAX_AGE_MS) {
          deliver(sub, lastFix.fix, Date.now());
        }
        return runningMode;
      } catch (err) {
        subs.delete(owner);
        throw err;
      }
    });
  },

  /** `owner` no longer needs position. The watcher keeps running for any other owner, and stops with the last one. */
  stop(owner: LocationOwner = "live-share"): Promise<void> {
    return serial(async () => {
      subs.delete(owner);
      if (subs.size === 0) {
        lastFix = null;
        await stopWatcher();
        return;
      }
      // Someone is still listening; if the notification should now describe them instead, restart with the right wording.
      const wanted = pickNotice();
      if (runningMode && !sameNotice(runningNotice, wanted)) {
        await stopWatcher();
        try {
          runningMode = await startWatcher(wanted);
          runningNotice = wanted;
        } catch {
          subs.clear();
        }
      }
    });
  },

  /** Owners currently subscribed — for tests and diagnostics. */
  owners(): LocationOwner[] {
    return Array.from(subs.keys());
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
