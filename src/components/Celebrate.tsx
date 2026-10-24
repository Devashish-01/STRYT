import { useEffect, useMemo } from "react";

const COLOURS = 5;

/**
 * A short burst of confetti over the whole screen — for the one moment worth marking (a delivery arriving, a delivery finished).
 * Pure CSS particles, no library; hidden for people who ask for reduced motion (see `.cel-layer` in index.css). It ignores touches,
 * and calls `onDone` once it has fallen so the parent can unmount it.
 */
export function Celebrate({ onDone, count = 44 }: { onDone?: () => void; count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.round(Math.random() * 100),
        wait: Math.round(Math.random() * 450) / 1000,
        dur: 1.9 + Math.random() * 1.1,
        drift: Math.round((Math.random() - 0.5) * 140),
        rot: Math.round(Math.random() * 360),
        c: i % COLOURS,
      })),
    [count],
  );

  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), 3600);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="cel-layer" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          className={`cel-p c${b.c}`}
          style={{ left: `${b.left}%`, ["--w" as string]: `${b.wait}s`, ["--d" as string]: `${b.dur}s`, ["--x" as string]: `${b.drift}px`, ["--r" as string]: `${b.rot}deg` }}
        />
      ))}
    </div>
  );
}
