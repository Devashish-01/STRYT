import { useMemo } from "react";
import type { CSSProperties } from "react";

/**
 * A static "your street at dusk" silhouette — a row of shop/building rooftops
 * with warm lit windows and a few STRYT street-lamps glowing along it. Purely
 * decorative brand ambience for the dark auth / hero panels.
 *
 * Unlike <AmbientSky/>, it deliberately implies NO weather or season — the
 * sign-in screens run pre-auth with no location, so "it's raining near you" is
 * a claim we can't make there. This just says "this is a neighbourhood",
 * which is always true. Sits at the bottom, behind content, pointer-events off,
 * and goes still under prefers-reduced-motion (handled in CSS).
 *
 * `litCount` makes the four lamps double as first-run onboarding's progress
 * indicator — one lamp per step, lighting as each is answered (see
 * screens/auth/onboard/). It defaults to ALL LIT so every existing caller
 * (PhoneEntry's hero panel) renders exactly as it always has; only the
 * onboarding screen passes a value.
 */
export default function StreetScene({
  className,
  style,
  litCount,
}: {
  className?: string;
  style?: CSSProperties;
  /** How many of the four lamps are lit, left to right. Omit for all four. */
  litCount?: number;
}) {
  const { rects, windows } = useMemo(() => {
    const rects: { x: number; w: number; h: number }[] = [];
    const windows: { x: number; y: number; i: number }[] = [];
    const heights = [72, 52, 90, 60, 96, 46, 80, 56, 92, 64, 82, 50, 88, 58, 74, 66, 94, 54, 84, 62];
    let x = 0;
    heights.forEach((h, i) => {
      const w = 70 + ((i * 17) % 44);
      rects.push({ x, w, h });
      const cols = Math.max(2, Math.round(w / 26));
      const rows = Math.max(2, Math.round(h / 30));
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (((i * 7 + c * 3 + r * 5) % 4) !== 0) continue; // ~1 in 4 windows lit
          windows.push({
            x: x + 9 + c * ((w - 14) / cols),
            y: (120 - h) + 13 + r * ((h - 18) / rows),
            i: windows.length,
          });
        }
      }
      x += w + 5;
    });
    return { rects, windows };
  }, []);

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 140, pointerEvents: "none", overflow: "hidden", ...style }}
    >
      <svg viewBox="0 0 1200 120" width="100%" height="100%" preserveAspectRatio="xMidYMax slice" style={{ display: "block" }}>
        {/* rooftops — a soft dark silhouette over whatever the panel gradient is */}
        <g fill="rgba(0,0,0,0.26)">
          {rects.map((b, i) => (
            <rect key={i} x={b.x} y={120 - b.h} width={b.w} height={b.h} rx={2.5} />
          ))}
        </g>
        {/* lit windows */}
        <g fill="var(--accent-400)">
          {windows.map((w) => (
            <rect
              key={w.i}
              className="street-window"
              x={w.x}
              y={w.y}
              width={4.5}
              height={6}
              rx={1}
              style={{ animationDelay: `${(w.i % 8) * 0.55}s` }}
            />
          ))}
        </g>
        {/* STRYT street-lamps glowing along the row. When `litCount` is given
            these carry onboarding progress: an unlit lamp keeps its post and
            housing (the street is still there) but loses its halo and dims its
            bulb, so lighting one reads as the street waking up rather than as
            an element appearing from nowhere. */}
        {[130, 470, 780, 1080].map((lx, i) => {
          const lit = litCount === undefined || i < litCount;
          return (
            <g key={i} transform={`translate(${lx} 0)`}>
              <circle
                className={lit ? "street-lamp-glow street-lamp-fade" : "street-lamp-fade"}
                cx={17}
                cy={47}
                r={19}
                fill="var(--accent-400)"
                opacity={lit ? 0.24 : 0}
              />
              <path d="M0 120 L0 60 C0 50 10 46 19 51" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={3} strokeLinecap="round" />
              <path d="M12 47 L26 47 L21.5 56 L16.5 56 Z" fill="rgba(0,0,0,0.5)" />
              <circle
                cx={19}
                cy={50}
                r={2.6}
                fill="#fff"
                opacity={lit ? 1 : 0.22}
                className="street-lamp-fade"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
