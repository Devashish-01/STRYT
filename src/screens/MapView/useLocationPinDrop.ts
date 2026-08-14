import { useCallback, useEffect, useRef, useState } from "react";
import { reverseGeocode } from "@/lib/geocode";
import { userService } from "@/services";

export interface LatLng { lat: number; lng: number }

export function useLocationPinDrop(
  refreshUser: () => Promise<void>,
  showToast: (msg: string) => void,
  /** Fired with the confirmed coordinates once the profile write succeeds —
   *  lets the caller re-run its own live query in the same action. Without
   *  this, confirming a dropped pin saved the location but results stayed
   *  keyed to wherever was searched before, same gap Recenter had. */
  onLocationSet?: (lat: number, lng: number) => void,
) {
  const [pickMode, setPickMode] = useState(false);
  const [pickCenter, setPickCenter] = useState<{ lat: number; lng: number } | null>(null);
  // Where the map should be sitting when pick mode opens. `null` = wherever the
  // user already is (the FAB); a point = a long-press, which hands the pressed
  // coordinate over so the crosshair lands under the finger instead of making
  // the user re-find the spot they just pressed.
  const [pickStart, setPickStart] = useState<LatLng | null>(null);
  const [address, setAddress] = useState("");
  const [addressLoading, setAddressLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enterPickMode = useCallback((at?: LatLng) => {
    setPickStart(at ?? null);
    setPickMode(true);
  }, []);

  const cancelPickMode = useCallback(() => {
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    setPickMode(false);
    setPickCenter(null);
    setPickStart(null);
    setAddress("");
  }, []);

  // Called whenever the map settles after a pan/zoom while in pick mode.
  // Debounced so quick successive drags don't fire a reverse-geocode lookup each time.
  const onCenterChange = useCallback((lat: number, lng: number) => {
    setPickCenter({ lat, lng });
    setAddressLoading(true);
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    geocodeTimerRef.current = setTimeout(async () => {
      try {
        const area = await reverseGeocode(lat, lng);
        setAddress(area || "Unnamed location");
      } catch {
        setAddress("Unnamed location");
      } finally {
        setAddressLoading(false);
      }
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    };
  }, []);

  const confirmPickMode = useCallback(async () => {
    if (!pickCenter) return;
    setConfirming(true);
    try {
      await userService.setLocation(pickCenter.lat, pickCenter.lng, address || "Custom location");
      await refreshUser();
      showToast(`Location set — ${address || "Custom location"}`);
      onLocationSet?.(pickCenter.lat, pickCenter.lng);
      setPickMode(false);
      setPickCenter(null);
      setPickStart(null);
      setAddress("");
    } catch {
      showToast("Couldn't set location — try again");
    } finally {
      setConfirming(false);
    }
  }, [pickCenter, address, refreshUser, showToast, onLocationSet]);

  return {
    pickMode, pickCenter, pickStart, address, addressLoading, confirming,
    enterPickMode, cancelPickMode, confirmPickMode, onCenterChange,
  };
}
