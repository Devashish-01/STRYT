import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { DayPart } from "./context";
import type { SeasonEffect } from "./useAmbientTheme";

/**
 * The "Living Street Light" header backdrop. A drop-in, purely-decorative layer
 * that fills its (position: relative) parent and paints:
 *   1. a time-of-day light wash — a warm dawn glow, a dusk band, a night hush —
 *      layered over whatever gradient the header already has;
 *   2. the season drifting through the lamp light — rain in monsoon, snow in
 *      winter, petals in spring, warm haze in summer.
 *
 * It's transparent by default (additive over the header's own colour), clips to
 * the parent, ignores pointer events, and goes still under prefers-reduced-motion
 * (handled in CSS). Pair it with <BrandLockup/> as the light source.
 */
export default function AmbientSky({
  dayPart,
  effect,
  glow = 0.5,
}: {
  dayPart: DayPart;
  effect: SeasonEffect;
  glow?: number;
}) {
  // Deterministic particle field — stable across renders so nothing "jumps".
  // Delays are NEGATIVE and proportional to each particle's own duration, so the
  // animation starts partway through its cycle: the field is fully populated at
  // t=0 instead of raining in from an empty top edge in waves.
  const particles = useMemo(() => {
    const count = effect === "rain" ? 22 : effect === "snow" ? 26 : effect === "petals" ? 20 : 14;
    return Array.from({ length: count }, (_, i) => {
      // cheap hash-ish spread so columns/sizes/offsets feel scattered, not gridded
      const left = (i * 61 + 7) % 100;
      const phase = ((i * 37) % 100) / 100;      // 0–1 fraction into the cycle
      const spread = ((i * 53) % 100) / 100;     // 0–1 duration spread
      const dur = effect === "rain" ? 0.8 + spread * 0.7 : 5 + spread * 5;
      return { left, offset: (phase * dur).toFixed(2), dur: dur.toFixed(2) };
    });
  }, [effect]);

  const style = { "--sky-glow": glow } as CSSProperties;

  return (
    <div className={`ambient-sky day-${dayPart}`} style={style} aria-hidden="true">
      <div className="ambient-sky-wash" />
      <div className={`ambient-sky-field fx-${effect}`}>
        {particles.map((p, i) => (
          <span
            key={i}
            className="sky-particle"
            style={{
              left: `${p.left}%`,
              animationDelay: `-${p.offset}s`,
              animationDuration: `${p.dur}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
