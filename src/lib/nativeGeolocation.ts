import { Capacitor } from "@capacitor/core";
import { Geolocation, type Position } from "@capacitor/geolocation";

/**
 * Getting the device's position — fast when backgrounded, exact when user-requested.
 *
 *   - Default calls (`enableHighAccuracy` omitted/false) try PHASE1 quick fused/network
 *     read first, then fall back to PHASE2 high-accuracy GPS.
 *   - Explicit high-accuracy calls (`enableHighAccuracy: true`) bypass PHASE1 and any
 *     coarse cached fix so callers asking for the real street position never silently
 *     receive a 1 km cell-tower jump.
 *   - `getCalibratedPosition` opens a short live GPS watch (up to ~4.5s) and keeps
 *     the tightest `coords.accuracy` sample instead of trusting a noisy cold-start spike.
 */

const PHASE1: PositionOptions = { enableHighAccuracy: false, timeout: 3000, maximumAge: 60_000 };
/** A fix this fresh answers a new request straight away (if precision matches). */
export const FRESH_FIX_MS = 15_000;
/** Slack over the two phases before the watchdog gives up on the plugin altogether. */
const WATCHDOG_PAD_MS = 1500;
const PHASE2_MIN_MS = 6000;
const PHASE2_MAX_MS = 12_000;
const CALIBRATE_DEFAULT_MS = 4500;
const CALIBRATE_TARGET_ACCURACY_M = 25;

export function phase2Opts(options?: PositionOptions): PositionOptions {
  const wanted = options?.timeout ?? 10_000;
  return { enableHighAccuracy: true, timeout: Math.min(PHASE2_MAX_MS, Math.max(PHASE2_MIN_MS, wanted)), maximumAge: 0 };
}

/** Longest a caller can be kept waiting. */
export function totalBudgetMs(options?: PositionOptions): number {
  const gpsBudget = phase2Opts(options).timeout ?? 10_000;
  return options?.enableHighAccuracy ? gpsBudget + WATCHDOG_PAD_MS : (PHASE1.timeout ?? 3000) + gpsBudget + WATCHDOG_PAD_MS;
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

let lastFix: { pos: GeolocationPosition; at: number; highAccuracy: boolean } | null = null;
let inflight: { promise: Promise<GeolocationPosition>; id: number; highAccuracy: boolean } | null = null;
let seq = 0;

/** Test seam. */
export function resetGeolocationForTests() {
  lastFix = null;
  inflight = null;
}

export interface CalibrateOptions {
  maxDurationMs?: number;
  targetAccuracyM?: number;
  timeout?: number;
}

function accuracyOf(pos: GeolocationPosition): number {
  const a = pos.coords?.accuracy;
  return typeof a === "number" && Number.isFinite(a) && a > 0 ? a : Infinity;
}

export const nativeGeolocation = {
  getCurrentPosition: (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions,
  ) => {
    const wantsHigh = !!options?.enableHighAccuracy;
    if (lastFix && Date.now() - lastFix.at < FRESH_FIX_MS && (!wantsHigh || lastFix.highAccuracy)) {
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

    const canShareInflight = inflight && (!wantsHigh || inflight.highAccuracy);
    const mine = canShareInflight
      ? inflight!
      : (() => {
          const id = ++seq;
          const promise = acquire(options).finally(() => { if (inflight?.id === id) inflight = null; });
          inflight = { promise, id, highAccuracy: wantsHigh };
          return inflight;
        })();

    const watchdog = setTimeout(() => {
      if (inflight?.id === mine.id) inflight = null;
      finish(() => errorCallback?.(toWebError(3, "Timed out waiting for a location fix")));
    }, totalBudgetMs(options));

    mine.promise.then(
      (pos) => {
        lastFix = { pos, at: Date.now(), highAccuracy: wantsHigh || accuracyOf(pos) <= 50 };
        finish(() => successCallback(pos));
      },
      (err) => finish(() => errorCallback?.(
        typeof err?.code === "number" && err?.PERMISSION_DENIED ? err : toWebError(classify(err), messageOf(err) || "Failed to retrieve location"),
      )),
    );
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
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      run();
    };
    const watchdog = setTimeout(() => {
      finish(() => errorCallback?.(toWebError(3, "Timed out waiting for a quick location fix")));
    }, (PHASE1.timeout ?? 3000) + WATCHDOG_PAD_MS);
    once(PHASE1).then(
      (pos) => {
        finish(() => {
          lastFix = { pos, at: Date.now(), highAccuracy: accuracyOf(pos) <= 50 };
          successCallback(pos);
        });
      },
      (err) => {
        finish(() => errorCallback?.(
          typeof err?.code === "number" && err?.PERMISSION_DENIED
            ? err
            : toWebError(classify(err), messageOf(err) || "Failed to retrieve location"),
        ));
      },
    );
  },

  /**
   * Explicit user-requested precise GPS fix: bypasses stale coarse caches and asks for fresh
   * high-accuracy coordinates.
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
        lastFix = { pos, at: Date.now(), highAccuracy: true };
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

  /**
   * Multi-sample GPS calibration: listens to live high-accuracy fixes for up to `maxDurationMs`
   * (default 4.5s), discards initial noisy spikes in favor of the sharpest `coords.accuracy`,
   * and returns immediately once `targetAccuracyM` (default 25m) is reached.
   */
  getCalibratedPosition: (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: CalibrateOptions,
  ) => {
    const maxDurationMs = options?.maxDurationMs ?? CALIBRATE_DEFAULT_MS;
    const targetAccuracyM = options?.targetAccuracyM ?? CALIBRATE_TARGET_ACCURACY_M;
    const watchOpts = phase2Opts({ timeout: options?.timeout ?? 10_000 });

    let settled = false;
    let bestPos: GeolocationPosition | null = null;
    let bestAcc = Infinity;
    let nativeWatchId: string | null = null;
    let webWatchId: number | null = null;
    let stopped = false;

    const cleanup = () => {
      stopped = true;
      clearTimeout(windowTimer);
      clearTimeout(hardTimer);
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

    const resolveWith = (pos: GeolocationPosition) => {
      if (settled) return;
      settled = true;
      cleanup();
      lastFix = { pos, at: Date.now(), highAccuracy: true };
      successCallback(pos);
    };

    const rejectWith = (err: GeolocationPositionError) => {
      if (settled) return;
      settled = true;
      cleanup();
      errorCallback?.(err);
    };

    const consider = (pos: GeolocationPosition) => {
      if (settled) return;
      const acc = accuracyOf(pos);
      if (!bestPos || acc <= bestAcc) {
        bestPos = pos;
        bestAcc = acc;
      }
      if (acc <= targetAccuracyM) {
        resolveWith(pos);
      }
    };

    const handleErr = (err: unknown) => {
      if (settled) return;
      const code = classify(err);
      if (code === 1 || code === 2) {
        rejectWith(toWebError(code, messageOf(err) || (code === 1 ? "Location permission denied" : "Location services are turned off")));
        return;
      }
      if (bestPos) resolveWith(bestPos);
    };

    // Wait up to `maxDurationMs` to refine accuracy, then settle with best captured fix (or fall back once).
    const windowTimer = setTimeout(() => {
      if (settled) return;
      if (bestPos) {
        resolveWith(bestPos);
        return;
      }
      once(watchOpts).then(
        (pos) => resolveWith(pos),
        (err) => rejectWith(toWebError(classify(err), messageOf(err) || "Timed out waiting for exact GPS")),
      );
    }, maxDurationMs);

    const hardTimer = setTimeout(() => {
      if (settled) return;
      if (bestPos) resolveWith(bestPos);
      else rejectWith(toWebError(3, "Timed out waiting for exact GPS"));
    }, maxDurationMs + (watchOpts.timeout ?? 10_000) + WATCHDOG_PAD_MS);

    if (Capacitor.isNativePlatform()) {
      const watchFn = (Geolocation as any).watchPosition;
      if (typeof watchFn === "function") {
        Promise.resolve(
          watchFn.call(Geolocation, watchOpts, (pos: Position | null, err?: unknown) => {
            if (err) {
              handleErr(err);
              return;
            }
            if (pos) consider(toWebPosition(pos));
          }),
        )
          .then((id: string) => {
            if (stopped || settled) {
              void Geolocation.clearWatch({ id }).catch(() => {});
            } else {
              nativeWatchId = id;
            }
          })
          .catch(() => {
            once(watchOpts).then((pos) => consider(pos), handleErr);
          });
      } else {
        once(watchOpts).then((pos) => resolveWith(pos), handleErr);
      }
    } else if (typeof navigator !== "undefined" && navigator.geolocation) {
      if (typeof navigator.geolocation.watchPosition === "function") {
        webWatchId = navigator.geolocation.watchPosition(
          consider,
          handleErr,
          watchOpts,
        );
      } else {
        once(watchOpts).then((pos) => resolveWith(pos), handleErr);
      }
    } else {
      rejectWith(toWebError(2, "Geolocation is not available on this device"));
    }
  },
};
