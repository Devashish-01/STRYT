import { Capacitor } from "@capacitor/core";
import { Geolocation, type Position } from "@capacitor/geolocation";

/**
 * Getting the device's position, fast — and always getting an answer.
 *
 * Two phases, which is what makes Google apps feel instant:
 *   Phase 1: fused/network position, accepting a fix up to a minute old, 3s budget. Indoors or in a city this returns in
 *            well under a second.
 *   Phase 2: only if phase 1 failed — cold high-accuracy GPS with a real budget (a cold lock can take several seconds).
 *
 * What makes it dependable:
 *   - A hard deadline over both phases. The native plugin does not always honour its own timeout (a dismissed permission
 *     dialog or an unresponsive location provider can leave the promise pending forever), and a caller that never hears back
 *     leaves its spinner up for good. The callback now fires exactly once, whatever the plugin does.
 *   - Fast failure where waiting cannot help: permission denied, or the phone's Location switch is off. Phase 2 would only
 *     burn another ten seconds before reporting the same thing.
 *   - One request at a time. The app asks from several places at once (profile refresh, guest mode, the map), and each used
 *     to queue its own request behind the others. They now share one, and a fix under 15 seconds old is reused.
 */

const PHASE1: PositionOptions = { enableHighAccuracy: false, timeout: 3000, maximumAge: 60_000 };
/** A fix this fresh answers a new request straight away. */
export const FRESH_FIX_MS = 15_000;
/** Slack over the two phases before the watchdog gives up on the plugin altogether. */
const WATCHDOG_PAD_MS = 1500;
const PHASE2_MIN_MS = 6000;
const PHASE2_MAX_MS = 12_000;

export function phase2Opts(options?: PositionOptions): PositionOptions {
  const wanted = options?.timeout ?? 10_000;
  return { enableHighAccuracy: true, timeout: Math.min(PHASE2_MAX_MS, Math.max(PHASE2_MIN_MS, wanted)), maximumAge: 0 };
}

/** Longest a caller can be kept waiting. */
export function totalBudgetMs(options?: PositionOptions): number {
  return (PHASE1.timeout ?? 3000) + (phase2Opts(options).timeout ?? 10_000) + WATCHDOG_PAD_MS;
}

function toWebPosition(pos: Position): GeolocationPosition {
  return {
    coords: {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      altitudeAccuracy: pos.coords.altitudeAccuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
    },
    timestamp: pos.timestamp,
  } as GeolocationPosition;
}

type FailCode = 1 | 2 | 3;

function toWebError(code: FailCode, message: string): GeolocationPositionError {
  return { code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

const messageOf = (e: unknown): string =>
  typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");

/** Permission refused (web code 1, or the native plugin's wording). */
export function isPermissionDenied(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === 1 || /denied|permission/i.test(messageOf(e));
}

/** The phone's Location switch is off — retrying with GPS can't change that. */
export function isLocationServicesOff(e: unknown): boolean {
  return /not enabled|services? (is |are )?(off|disabled|not)|location (is )?disabled|disabled/i.test(messageOf(e));
}

export function classify(e: unknown): FailCode {
  if (isPermissionDenied(e)) return 1;
  if (isLocationServicesOff(e) || (e as { code?: unknown } | null)?.code === 2) return 2;
  return 3;
}

function once(opts: PositionOptions): Promise<GeolocationPosition> {
  if (Capacitor.isNativePlatform()) {
    return Geolocation.getCurrentPosition(opts as any).then(toWebPosition);
  }
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(toWebError(2, "Geolocation is not available on this device"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, opts);
  });
}

async function acquire(options?: PositionOptions): Promise<GeolocationPosition> {
  if (options?.enableHighAccuracy) {
    try {
      return await once(phase2Opts(options));
    } catch (e) {
      throw toWebError(classify(e), messageOf(e) || "Failed to retrieve location");
    }
  }
  try {
    return await once(PHASE1);
  } catch (e1) {
    if (isPermissionDenied(e1)) throw toWebError(1, messageOf(e1) || "Location permission denied");
    if (isLocationServicesOff(e1)) throw toWebError(2, messageOf(e1) || "Location services are turned off");
    try {
      return await once(phase2Opts(options));
    } catch (e2) {
      throw toWebError(classify(e2), messageOf(e2) || "Failed to retrieve location");
    }
  }
}

let lastFix: { pos: GeolocationPosition; at: number } | null = null;
let inflight: { promise: Promise<GeolocationPosition>; id: number } | null = null;
let seq = 0;

/** Test seam. */
export function resetGeolocationForTests() {
  lastFix = null;
  inflight = null;
}

const DEFAULT_CALIBRATION_MS = 4500;
const DEFAULT_TARGET_ACCURACY_M = 25;

export interface CalibrationOptions {
  maxDurationMs?: number;
  targetAccuracyM?: number;
}

export const nativeGeolocation = {
  getCurrentPosition: (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions,
  ) => {
    const wantsFine = !!options?.enableHighAccuracy;
    const cacheIsFine =
      lastFix != null &&
      typeof lastFix.pos.coords.accuracy === "number" &&
      lastFix.pos.coords.accuracy <= 60;
    if (lastFix && Date.now() - lastFix.at < FRESH_FIX_MS && (!wantsFine || cacheIsFine)) {
      const pos = lastFix.pos;
      queueMicrotask(() => successCallback(pos));
      return;
    }

    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      run();
    };

    // Join the request already in flight when coarse/default, or start a fresh high-accuracy fix.
    const mine = !wantsFine && inflight
      ? inflight
      : (() => {
          const id = ++seq;
          const promise = acquire(options).finally(() => { if (inflight?.id === id) inflight = null; });
          if (!wantsFine) inflight = { promise, id };
          return { promise, id };
        })();

    const watchdog = setTimeout(() => {
      if (inflight?.id === mine.id) inflight = null;
      finish(() => errorCallback?.(toWebError(3, "Timed out waiting for a location fix")));
    }, totalBudgetMs(options));

    mine.promise.then(
      (pos) => {
        lastFix = { pos, at: Date.now() };
        finish(() => successCallback(pos));
      },
      (err) => finish(() => errorCallback?.(
        typeof err?.code === "number" && err?.PERMISSION_DENIED ? err : toWebError(classify(err), messageOf(err) || "Failed to retrieve location"),
      )),
    );
  },

  /**
   * Multi-sample calibration window: watches high-accuracy samples up to `maxDurationMs`,
   * keeping the sharpest accuracy sample and resolving immediately once `targetAccuracyM` is met.
   */
  getCalibratedPosition: (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: CalibrationOptions,
  ) => {
    const maxDurationMs = options?.maxDurationMs ?? DEFAULT_CALIBRATION_MS;
    const targetAccuracyM = options?.targetAccuracyM ?? DEFAULT_TARGET_ACCURACY_M;
    let settled = false;
    let best: GeolocationPosition | null = null;
    let nativeWatchId: string | null = null;
    let webWatchId: number | null = null;

    const cleanup = () => {
      clearTimeout(timer);
      if (nativeWatchId !== null) {
        const id = nativeWatchId;
        nativeWatchId = null;
        void Geolocation.clearWatch({ id }).catch(() => {});
      }
      if (webWatchId !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(webWatchId);
        webWatchId = null;
      }
    };

    const resolveBest = (pos: GeolocationPosition) => {
      if (settled) return;
      settled = true;
      cleanup();
      lastFix = { pos, at: Date.now() };
      successCallback(pos);
    };

    const fail = (err: GeolocationPositionError) => {
      if (settled) return;
      settled = true;
      cleanup();
      errorCallback?.(err);
    };

    const considerSample = (raw: Position | GeolocationPosition) => {
      const pos = "timestamp" in raw && typeof (raw as GeolocationPosition).coords?.latitude === "number"
        ? toWebPosition(raw as Position)
        : (raw as GeolocationPosition);
      const acc = typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : Infinity;
      const bestAcc = best && typeof best.coords.accuracy === "number" ? best.coords.accuracy : Infinity;
      if (!best || acc < bestAcc) {
        best = pos;
      }
      if (acc <= targetAccuracyM) {
        resolveBest(best);
      }
    };

    const timer = setTimeout(() => {
      if (best) {
        resolveBest(best);
      } else {
        fail(toWebError(3, "Timed out calibrating GPS position"));
      }
    }, maxDurationMs);

    const watchOpts: PositionOptions = { enableHighAccuracy: true, timeout: maxDurationMs, maximumAge: 0 };
    if (Capacitor.isNativePlatform()) {
      void Geolocation.watchPosition(watchOpts as any, (pos, err) => {
        if (settled) return;
        if (err) {
          const code = classify(err);
          if (code === 1 || code === 2) {
            fail(toWebError(code, messageOf(err) || "Failed to retrieve calibrated location"));
          }
          return;
        }
        if (pos) considerSample(pos);
      })
        .then((id) => {
          if (settled) {
            void Geolocation.clearWatch({ id }).catch(() => {});
          } else {
            nativeWatchId = id;
          }
        })
        .catch((err) => {
          fail(toWebError(classify(err), messageOf(err) || "Failed to start GPS calibration"));
        });
    } else if (typeof navigator !== "undefined" && navigator.geolocation) {
      webWatchId = navigator.geolocation.watchPosition(
        (pos) => considerSample(pos),
        (err) => {
          const code = classify(err);
          if (code === 1 || code === 2) {
            fail(toWebError(code, messageOf(err) || "Failed to retrieve calibrated location"));
          }
        },
        watchOpts,
      );
    } else {
      fail(toWebError(2, "Geolocation is not available on this device"));
    }
  },

  /**
   * Quick / non-intrusive position read: checks cached fix or network/coarse fix
   * without forcing a cold high-accuracy GPS prompt when the user already picked
   * approximate location.
   */
  getQuickPosition: (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
  ) => {
    if (lastFix && Date.now() - lastFix.at < FRESH_FIX_MS) {
      const pos = lastFix.pos;
      queueMicrotask(() => successCallback(pos));
      return;
    }
    once(PHASE1).then(
      (pos) => {
        lastFix = { pos, at: Date.now() };
        successCallback(pos);
      },
      (err) => {
        errorCallback?.(
          typeof err?.code === "number" && err?.PERMISSION_DENIED
            ? err
            : toWebError(classify(err), messageOf(err) || "Failed to retrieve location"),
        );
      },
    );
  },

  /**
   * Explicit user-requested precise GPS fix (e.g. double-tap on map locate button):
   * bypasses the 15s cached fix and asks for fresh high-accuracy coordinates.
   */
  getPrecisePosition: (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions,
  ) => {
    const opts = phase2Opts(options);
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      run();
    };
    const watchdog = setTimeout(() => {
      finish(() => errorCallback?.(toWebError(3, "Timed out waiting for precise GPS")));
    }, (opts.timeout ?? 10_000) + WATCHDOG_PAD_MS);

    once(opts).then(
      (pos) => {
        lastFix = { pos, at: Date.now() };
        finish(() => successCallback(pos));
      },
      (err) => {
        finish(() =>
          errorCallback?.(
            typeof err?.code === "number" && err?.PERMISSION_DENIED
              ? err
              : toWebError(classify(err), messageOf(err) || "Failed to retrieve precise location"),
          ),
        );
      },
    );
  },
};
