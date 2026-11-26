import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { backgroundLocation } from "@/lib/backgroundLocation";
import { nativeGeolocation } from "@/lib/nativeGeolocation";

export type PrecisionState = "precise" | "coarse" | "prompt" | "denied";

export type LocateOutcomeStatus =
  | "calibrated"
  | "approximate_locked"
  | "denied"
  | "gps_off"
  | "timeout";

export interface LocateResult {
  lat: number;
  lng: number;
  accuracy?: number;
  precision: "precise" | "coarse";
}

export interface CalibratedLocateResult {
  status: LocateOutcomeStatus;
  fix: LocateResult | null;
  state: PrecisionState;
}

/**
 * Reads the OS location permission granularity without prompting the user.
 * Distinguishes Android 12+ Approximate ("coarse") from Precise ("location").
 */
export async function getLocationPrecisionState(): Promise<PrecisionState> {
  if (!Capacitor.isNativePlatform()) {
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      try {
        const res = await navigator.permissions.query({ name: "geolocation" });
        if (res.state === "granted") return "precise";
        if (res.state === "denied") return "denied";
      } catch {
        /* ignore unsupported permissions API */
      }
    }
    return "prompt";
  }

  try {
    const status = await Geolocation.checkPermissions();
    if (status.location === "granted") return "precise";
    if (status.coarseLocation === "granted") return "coarse";
    if (status.location === "denied" && status.coarseLocation === "denied") return "denied";
    return "prompt";
  } catch {
    return "prompt";
  }
}

/**
 * Direct 1-tap user locate:
 *   1. If Precise location ("location") is not granted yet, requests it directly.
 *      When the OS locks permission to Approximate ("coarse") or Denied, reports
 *      so cleanly instead of yanking the user into OS settings unannounced.
 *   2. Once Precise is available, calibrates live high-accuracy GPS samples to pick
 *      the sharpest reading rather than trusting an inaccurate coarse/cold spike.
 */
export async function locateWithCalibration(options?: {
  targetAccuracyM?: number;
  maxDurationMs?: number;
  openSettingsIfLocked?: boolean;
}): Promise<CalibratedLocateResult> {
  let state = await getLocationPrecisionState();

  if (Capacitor.isNativePlatform() && state !== "precise") {
    try {
      const next = await Geolocation.requestPermissions({ permissions: ["location"] });
      if (next.location === "granted") {
        state = "precise";
      } else {
        state = next.coarseLocation === "granted" ? "coarse" : "denied";
        if (options?.openSettingsIfLocked) backgroundLocation.openSettings();
        return {
          status: state === "coarse" ? "approximate_locked" : "denied",
          fix: null,
          state,
        };
      }
    } catch {
      if (options?.openSettingsIfLocked) backgroundLocation.openSettings();
      return {
        status: state === "coarse" ? "approximate_locked" : "denied",
        fix: null,
        state,
      };
    }
  }

  if (state === "denied") {
    return { status: "denied", fix: null, state };
  }

  return new Promise((resolve) => {
    const sample =
      typeof nativeGeolocation.getCalibratedPosition === "function"
        ? nativeGeolocation.getCalibratedPosition
        : nativeGeolocation.getPrecisePosition;

    sample(
      (pos) => {
        const acc = pos.coords.accuracy;
        resolve({
          status: "calibrated",
          fix: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: acc,
            precision:
              state === "precise" || (typeof acc === "number" && acc <= 60)
                ? "precise"
                : "coarse",
          },
          state: state === "prompt" ? "precise" : state,
        });
      },
      (err) => {
        const status: LocateOutcomeStatus =
          err?.code === 1 ? "denied" : err?.code === 2 ? "gps_off" : "timeout";
        resolve({
          status,
          fix: null,
          state: err?.code === 1 ? "denied" : state,
        });
      },
      {
        targetAccuracyM: options?.targetAccuracyM,
        maxDurationMs: options?.maxDurationMs,
        timeout: 10_000,
      },
    );
  });
}

/**
 * Non-nagging background/quick location read when the app should not prompt for permissions.
 */
export async function recognizeLocation(): Promise<{
  fix: LocateResult | null;
  state: PrecisionState;
}> {
  const state = await getLocationPrecisionState();
  if (state === "denied") {
    return { fix: null, state };
  }

  return new Promise((resolve) => {
    const onOk = (pos: GeolocationPosition) => {
      resolve({
        fix: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          precision:
            state === "precise" || (typeof pos.coords.accuracy === "number" && pos.coords.accuracy <= 60)
              ? "precise"
              : "coarse",
        },
        state: state === "prompt" ? "precise" : state,
      });
    };
    const onErr = () => resolve({ fix: null, state });

    if (state === "coarse") {
      nativeGeolocation.getQuickPosition(onOk, onErr);
    } else {
      nativeGeolocation.getCurrentPosition(onOk, onErr, { enableHighAccuracy: state === "precise", timeout: 5000 });
    }
  });
}

/**
 * Legacy helper: explicitly asks the system for Precise location (or opens app Settings if locked),
 * then pulls a calibrated high-accuracy GPS fix.
 */
export async function requestPreciseLocation(): Promise<{
  fix: LocateResult | null;
  state: PrecisionState;
  openedSettings: boolean;
}> {
  let state = await getLocationPrecisionState();
  let openedSettings = false;

  if (Capacitor.isNativePlatform() && state !== "precise") {
    try {
      const next = await Geolocation.requestPermissions({ permissions: ["location"] });
      if (next.location === "granted") {
        state = "precise";
      } else {
        state = next.coarseLocation === "granted" ? "coarse" : "denied";
        backgroundLocation.openSettings();
        openedSettings = true;
      }
    } catch {
      backgroundLocation.openSettings();
      openedSettings = true;
    }
  }

  if (state === "denied") {
    return { fix: null, state, openedSettings };
  }

  return new Promise((resolve) => {
    nativeGeolocation.getPrecisePosition(
      (pos) => {
        resolve({
          fix: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            precision:
              state === "precise" || (typeof pos.coords.accuracy === "number" && pos.coords.accuracy <= 60)
                ? "precise"
                : "coarse",
          },
          state: state === "prompt" ? "precise" : state,
          openedSettings,
        });
      },
      () => resolve({ fix: null, state, openedSettings }),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  });
}

/**
 * Distinguishes single tap from double tap within `windowMs`.
 */
export function createTapPairHandler(
  onSingleTap: () => void,
  onDoubleTap: () => void,
  windowMs = 340
): () => void {
  let lastTapAt = 0;
  return () => {
    const now = Date.now();
    if (now - lastTapAt <= windowMs) {
      lastTapAt = 0;
      onDoubleTap();
    } else {
      lastTapAt = now;
      onSingleTap();
    }
  };
}
