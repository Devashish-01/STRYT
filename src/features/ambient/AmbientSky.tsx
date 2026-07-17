import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { DayPart } from "./context";
import type { SeasonEffect } from "./useAmbientTheme";
import StreetScene from "@/components/StreetScene";

/**
 * The "Living Street Light" header backdrop. A drop-in, purely-decorative layer
 * that fills its (position: relative) parent and paints:
 *   1. a time-of-day light wash — a warm dawn glow, a dusk band, a night hush —
 *      layered over whatever gradient the header already has;
 *   2. a warm-windowed street skyline along the base — the same "your street at
 *      dusk" scene used pre-auth (<StreetScene/>), so the header reads as
 *      neighbours home right now rather than an abstract weather overlay. Live
 *      rain still gets a few real streaks on top — that's the one condition
 *      worth signalling in real time; the decorative snow/petals/haze filler
 *      that used to run year-round regardless of actual weather is gone.
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
  // Deterministic rain field — stable across renders so nothing "jumps".
  // Delays are NEGATIVE and proportional to each particle's own duration, so
  // the field is fully populated at t=0 instead of raining in from empty.
  const rainDrops = useMemo(() => {
    if (effect !== "rain") return [];
    return Array.from({ length: 16 }, (_, i) => {
      const left = (i * 61 + 7) % 100;
      const spread = ((i * 53) % 100) / 100;
      const dur = 0.8 + spread * 0.7;
      const phase = ((i * 37) % 100) / 100;
      return { left, offset: (phase * dur).toFixed(2), dur: dur.toFixed(2) };
    });
  }, [effect]);

  const style = { "--sky-glow": glow } as CSSProperties;

  return (
    <div className={`ambient-sky day-${dayPart}`} style={style} aria-hidden="true">
      <div className="ambient-sky-wash" />
      <StreetScene style={{ height: 44 }} />
      {rainDrops.length > 0 && (
        <div className="ambient-sky-field fx-rain">
          {rainDrops.map((p, i) => (
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
      )}
    </div>
  );
}
