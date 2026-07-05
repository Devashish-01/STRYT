import { Capacitor } from "@capacitor/core";
import { Geolocation, type Position } from "@capacitor/geolocation";

// Two-phase fix strategy — this is what makes Google apps feel instant:
//   Phase 1: fused/network position, accept a cached fix up to 30s old,
//            3s budget. Indoors/urban this returns in ~0-500ms.
//   Phase 2: only if phase 1 fails — cold high-accuracy GPS with a real
//            budget (≥12s; the old flat 5-8s timeout was shorter than a
//            cold GPS lock, so taps "did nothing" and callers silently
//            kept the stale saved location).
// Permission denial (code 1) skips phase 2 — retrying can't help.

const PHASE1: PositionOptions = { enableHighAccuracy: false, timeout: 3000, maximumAge: 30000 };

function phase2Opts(options?: PositionOptions): PositionOptions {
  return {
    enableHighAccuracy: true,
    timeout: Math.max(options?.timeout ?? 0, 12000),
    maximumAge: 0,
  };
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

function toWebError(err: any): GeolocationPositionError {
  return {
    code: err?.code || 3,
    message: err?.message || "Failed to retrieve location",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

export const nativeGeolocation = {
  getCurrentPosition: (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions
  ) => {
    if (Capacitor.isNativePlatform()) {
      Geolocation.getCurrentPosition(PHASE1 as any)
        .then((pos) => successCallback(toWebPosition(pos)))
        .catch((e1) => {
          if (e1?.message?.toLowerCase?.().includes("denied")) {
            errorCallback?.(toWebError({ ...e1, code: 1 }));
            return;
          }
          Geolocation.getCurrentPosition(phase2Opts(options) as any)
            .then((pos) => successCallback(toWebPosition(pos)))
            .catch((e2) => errorCallback?.(toWebError(e2)));
        });
    } else {
      navigator.geolocation.getCurrentPosition(
        successCallback,
        (e1) => {
          if (e1.code === e1.PERMISSION_DENIED) {
            errorCallback?.(e1);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            successCallback,
            errorCallback || undefined,
            phase2Opts(options)
          );
        },
        PHASE1
      );
    }
  },
};
