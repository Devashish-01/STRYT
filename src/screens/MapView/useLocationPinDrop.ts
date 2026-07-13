import { useCallback, useEffect, useRef, useState } from "react";
import { reverseGeocode } from "@/lib/geocode";
import { userService } from "@/services";

export function useLocationPinDrop(refreshUser: () => Promise<void>, showToast: (msg: string) => void) {
  const [pickMode, setPickMode] = useState(false);
  const [pickCenter, setPickCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [addressLoading, setAddressLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enterPickMode = useCallback(() => {
    setPickMode(true);
  }, []);

  const cancelPickMode = useCallback(() => {
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    setPickMode(false);
    setPickCenter(null);
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
      setPickMode(false);
      setPickCenter(null);
      setAddress("");
    } catch {
      showToast("Couldn't set location — try again");
    } finally {
      setConfirming(false);
    }
  }, [pickCenter, address, refreshUser, showToast]);

  return {
    pickMode, pickCenter, address, addressLoading, confirming,
    enterPickMode, cancelPickMode, confirmPickMode, onCenterChange,
  };
}
