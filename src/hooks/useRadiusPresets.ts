import { useRef, useState } from "react";
import { RADIUS_OPTIONS } from "@/utils/constants";

export function roundToHalf(v: number): number {
  const r = Math.round(v * 2) / 2;
  return Math.max(0.5, r);
}

/** Shared preset-selection + custom-snap-to-0.5 state behind the two radius
 *  pickers in the app (RadiusSelector's card chip row, MapView's floating
 *  RadiusStrip) — same logic, each component keeps its own visual chrome. */
export function useRadiusPresets(value: number, onChange: (km: number) => void) {
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  const presetKms = new Set<number>(RADIUS_OPTIONS.map((o) => o.km));
  const isCustomActive = !presetKms.has(value);

  function selectPreset(km: number) {
    onChange(km);
    setShowCustom(false);
  }

  function openCustom() {
    setCustomVal(isCustomActive ? String(value) : "");
    setShowCustom(true);
    setTimeout(() => customInputRef.current?.focus(), 60);
  }

  function applyCustom() {
    const n = parseFloat(customVal);
    if (!isNaN(n) && n > 0) onChange(roundToHalf(n));
    setShowCustom(false);
  }

  function cancelCustom() {
    setShowCustom(false);
  }

  const parsedCustom = parseFloat(customVal);
  const snapPreview = customVal && !isNaN(parsedCustom) && parsedCustom > 0 ? roundToHalf(parsedCustom) : null;

  return {
    presets: RADIUS_OPTIONS,
    showCustom,
    customVal,
    setCustomVal,
    customInputRef,
    isCustomActive,
    isActive: (km: number) => value === km,
    selectPreset,
    openCustom,
    applyCustom,
    cancelCustom,
    snapPreview,
  };
}
