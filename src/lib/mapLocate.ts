import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { backgroundLocation } from "@/lib/backgroundLocation";
import { nativeGeolocation } from "@/lib/nativeGeolocation";

export type PrecisionState = "precise" | "coarse" | "prompt" | "denied";

export interface LocateResult {
  lat: number;
  lng: number;
  accuracy?: number;
  precision: "precise" | "coarse";
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
 * Single-tap locate: recognizes the user's current position cleanly WITHOUT
 * nagging with a precise-location system prompt if they already chose
 * Approximate or already denied permission.
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

    // When the user explicitly chose Approximate ("coarse"), stay on PHASE1 quick
    // read so Android doesn't pop a repeated "Switch to Precise?" dialog on 1-tap.
    if (state === "coarse") {
      nativeGeolocation.getQuickPosition(onOk, onErr);
    } else {
      nativeGeolocation.getCurrentPosition(onOk, onErr, { timeout: 5000 });
    }
  });
}

/**
 * Double-tap precise upgrade: explicitly asks the system for Precise location
 * (or opens app Location Settings if Android locked Approximate/Denied), then
 * pulls a fresh high-accuracy GPS fix.
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
        // Android remembers "Approximate" or "Don't allow" and ignores further
        // runtime permission calls — open app Settings so the user can flip Precise on.
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

export type CalibrationStatus =
  | "calibrated"
  | "approximate_locked"
  | "denied"
  | "gps_off"
  | "failed";

/**
 * Calibration-backed location capture used by LocationPickerSheet: ensures precise permission
 * where supported, surfaces explicit OS/permission states, and waits briefly for an accurate GPS lock.
 */
export async function locateWithCalibration(): Promise<{
  status: CalibrationStatus;
  fix: LocateResult | null;
}> {
  let state = await getLocationPrecisionState();
  if (Capacitor.isNativePlatform() && state !== "precise") {
    try {
      const next = await Geolocation.requestPermissions({ permissions: ["location"] });
      if (next.location === "granted") {
        state = "precise";
      } else if (next.coarseLocation === "granted") {
        return { status: "approximate_locked", fix: null };
      } else {
        return { status: "denied", fix: null };
      }
    } catch {
      return { status: "denied", fix: null };
    }
  }
  if (state === "denied") return { status: "denied", fix: null };
  if (state === "coarse") return { status: "approximate_locked", fix: null };

  return new Promise((resolve) => {
    nativeGeolocation.getCalibratedPosition(
      (pos) => {
        resolve({
          status: "calibrated",
          fix: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            precision:
              typeof pos.coords.accuracy === "number" && pos.coords.accuracy <= 60
                ? "precise"
                : "coarse",
          },
        });
      },
      (err) => {
        if (err.code === 1) resolve({ status: "denied", fix: null });
        else if (err.code === 2) resolve({ status: "gps_off", fix: null });
        else resolve({ status: "failed", fix: null });
      },
      { maxDurationMs: 4000, targetAccuracyM: 25 },
    );
  });
}

/**
 * Distinguishes single tap (instant locate/recenter) from double tap (within
 * `windowMs`, triggers system precise-location upgrade) without blocking tap 1.
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
