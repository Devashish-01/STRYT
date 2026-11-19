import { useEffect, useRef, useState } from "react";

export interface AnimatedPosition {
  lat: number | null;
  lng: number | null;
  heading: number;
}

/** Easing function for natural deceleration */
function easeOutQuad(t: number): number {
  return t * (2 - t);
}

/**
 * Calculates the shortest angular delta between two headings (-180 to 180 degrees)
 * so the vehicle does not rotate 350 degrees when crossing 0° / 360°.
 */
export function shortestAngleDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/**
 * Smoothly interpolates coordinates and vehicle heading between GPS fixes using requestAnimationFrame.
 * This eliminates the abrupt coordinate jumping common in naive polling implementations.
 */
export function useMarkerInterpolation(
  targetLat: number | null | undefined,
  targetLng: number | null | undefined,
  targetHeading: number | null | undefined = 0,
  durationMs: number = 2400,
): AnimatedPosition {
  const [pos, setPos] = useState<AnimatedPosition>({
    lat: targetLat ?? null,
    lng: targetLng ?? null,
    heading: targetHeading ?? 0,
  });

  const animRef = useRef<number | null>(null);
  const startPosRef = useRef<AnimatedPosition>({
    lat: targetLat ?? null,
    lng: targetLng ?? null,
    heading: targetHeading ?? 0,
  });
  const currentPosRef = useRef<AnimatedPosition>({
    lat: targetLat ?? null,
    lng: targetLng ?? null,
    heading: targetHeading ?? 0,
  });

  useEffect(() => {
    if (targetLat == null || targetLng == null) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      setPos({ lat: null, lng: null, heading: 0 });
      currentPosRef.current = { lat: null, lng: null, heading: 0 };
      return;
    }

    const prevLat = currentPosRef.current.lat;
    const prevLng = currentPosRef.current.lng;
    const prevHeading = currentPosRef.current.heading;

    // First fix or huge jump (> 25 km, e.g. location reset) -> snap immediately
    if (
      prevLat == null ||
      prevLng == null ||
      Math.abs(targetLat - prevLat) > 0.25 ||
      Math.abs(targetLng - prevLng) > 0.25
    ) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const immediate: AnimatedPosition = {
        lat: targetLat,
        lng: targetLng,
        heading: targetHeading ?? 0,
      };
      startPosRef.current = immediate;
      currentPosRef.current = immediate;
      setPos(immediate);
      return;
    }

    // Start lerp animation from current rendered position
    startPosRef.current = {
      lat: prevLat,
      lng: prevLng,
      heading: prevHeading,
    };

    const targetH = typeof targetHeading === "number" && !Number.isNaN(targetHeading) ? targetHeading : prevHeading;
    const angleDelta = shortestAngleDelta(prevHeading, targetH);
    const startTime = performance.now();

    if (animRef.current) cancelAnimationFrame(animRef.current);

    const step = (now: number) => {
      const elapsed = now - startTime;
      const rawProgress = Math.min(1, elapsed / durationMs);
      const t = easeOutQuad(rawProgress);

      const nextLat = startPosRef.current.lat! + (targetLat - startPosRef.current.lat!) * t;
      const nextLng = startPosRef.current.lng! + (targetLng - startPosRef.current.lng!) * t;
      const nextHeading = (startPosRef.current.heading + angleDelta * t + 360) % 360;

      const nextPos: AnimatedPosition = {
        lat: nextLat,
        lng: nextLng,
        heading: nextHeading,
      };

      currentPosRef.current = nextPos;
      setPos(nextPos);

      if (rawProgress < 1) {
        animRef.current = requestAnimationFrame(step);
      }
    };

    animRef.current = requestAnimationFrame(step);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [targetLat, targetLng, targetHeading, durationMs]);

  return pos;
}
