import { useEffect, useRef, useState } from "react";

// Smoothly tweens a displayed integer toward `value` instead of snapping —
// used for queue position / wait-minutes, which the realtime layer updates
// out of the blue (someone ahead gets served, a party size changes the ETA).
// Pair with the existing `.tabular-nums` CSS utility at the call site so
// digit width doesn't jitter mid-count. Respects prefers-reduced-motion.
export default function AnimatedNumber({
  value,
  durationMs = 350,
  format = (n: number) => String(n),
}: {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
}) {
  const [displayed, setDisplayed] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      fromRef.current = to;
      setDisplayed(to);
      return;
    }

    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic — quick start, gentle settle, matches the feel of the
      // rest of the app's sheet/toast easing rather than a linear count.
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplayed(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return <span className="tabular-nums">{format(displayed)}</span>;
}
