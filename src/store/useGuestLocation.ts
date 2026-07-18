import { useCallback, useEffect, useState } from "react";
import { nativeGeolocation } from "@/lib/nativeGeolocation";

export { GUEST_RADIUS_KM } from "@/lib/guestMode";

/**
 * Guest mode's location source.
 *
 * A signed-out visitor has no profile, so the usual `user.lat`/`user.lng` are
 * both 0 and every "nearby" query would silently fall back to unfiltered. This
 * hook supplies a location for guests ONLY, from the live browser/device fix,
 * and deliberately keeps it out of the database — a guest has no account to
 * persist to, and we don't want to create one just to remember where they stood.
 *
 * Session-scoped on purpose: `sessionStorage`, not `localStorage`. Closing the
 * tab forgets it. A guest never gets a durable location footprint on the device.
 */

const KEY = "guest_location";

export interface GuestLocation {
  lat: number;
  lng: number;
}

type GuestLocationStatus = "idle" | "asking" | "granted" | "denied";

function readCached(): GuestLocation | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat === "number" && typeof parsed?.lng === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function useGuestLocation(enabled: boolean) {
  const [location, setLocation] = useState<GuestLocation | null>(() => readCached());
  const [status, setStatus] = useState<GuestLocationStatus>(() => (readCached() ? "granted" : "idle"));

  const request = useCallback(() => {
    setStatus("asking");
    nativeGeolocation.getCurrentPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode — in-memory is fine */ }
        setLocation(next);
        setStatus("granted");
      },
      () => {
        // Denied or unavailable. Guests still get to browse — the 1 km filter
        // just can't apply, so callers fall back to showing the unfiltered
        // nearby feed rather than an empty screen (see AppProvider).
        setStatus("denied");
      },
      { timeout: 8000 }
    );
  }, []);

  // Ask once, automatically, the first time guest mode becomes active. A guest
  // who lands from a shared link shouldn't have to hunt for a "use my location"
  // button before the app shows them anything.
  useEffect(() => {
    if (!enabled) return;
    if (status !== "idle") return;
    request();
  }, [enabled, status, request]);

  // Signing in makes this irrelevant — the real profile location takes over, and
  // the guest fix shouldn't linger in the tab afterwards.
  useEffect(() => {
    if (enabled) return;
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  }, [enabled]);

  return { guestLocation: location, guestLocationStatus: status, requestGuestLocation: request };
}
