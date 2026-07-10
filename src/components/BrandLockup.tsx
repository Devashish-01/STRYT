import type { CSSProperties } from "react";

/**
 * The STRYT brand lockup: a solid street-lamp silhouette standing beside a bold
 * amber→pink→purple beam, with the "S" of the wordmark sitting inside that beam
 * — the exact construction from the brand sheet's primary logo. Used as the
 * tappable home link in every header.
 *
 * The lamp is a real light source: `glow` (0→1, from `useAmbientTheme().lampGlow`)
 * drives the bulb's brightness and the beam's opacity — faint at noon, vivid at
 * night. Purely presentational; the caller wires `onClick`.
 */
export default function BrandLockup({
  glow = 0.5,
  onClick,
  size = 20,
  ariaLabel = "STRYT home",
}: {
  glow?: number;
  onClick?: () => void;
  size?: number;
  ariaLabel?: string;
}) {
  const style = { "--lamp-glow": glow, "--lockup-size": `${size}px` } as CSSProperties;
  return (
    <button className="brand-lockup" onClick={onClick} aria-label={ariaLabel} style={style}>
      <span className="brand-lockup-lamp" aria-hidden="true">
        <svg viewBox="0 0 34 50" width={size * 0.72} height={size * 1.06} style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="beam-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--accent-400)" />
              <stop offset="52%" stopColor="var(--pink-500)" />
              <stop offset="100%" stopColor="var(--brand-500)" />
            </linearGradient>
          </defs>
          {/* the beam — sits behind the lamp silhouette and the "S" */}
          <polygon
            points="19.5,14 24.5,14 72.5,48.5 37,48.5"
            fill="url(#beam-gradient)"
            className="brand-lockup-cone"
          />
          {/* foot */}
          <path d="M3 48.5 L11 48.5" stroke="var(--ink-900)" strokeWidth="2.4" strokeLinecap="round" />
          {/* post rising, curling into a shepherd's-crook hook at the top */}
          <path
            d="M7 48 L7 12 C7 4 15 2 21 7"
            fill="none"
            stroke="var(--ink-900)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* halo behind the shade */}
          <circle className="brand-lockup-halo" cx="23" cy="10" r="8" />
          {/* lamp shade */}
          <path d="M16 6.5 L28 6.5 L24.5 14 L19.5 14 Z" fill="var(--ink-900)" />
          {/* bulb / light strip */}
          <rect className="brand-lockup-bulb" x="19.5" y="12.2" width="5" height="2" rx="1" />
        </svg>
      </span>
      <span className="brand-lockup-word">
        <span className="brand-lockup-s-wrap">
          <span className="brand-lockup-s">S</span>
        </span>
        TRYT
      </span>
    </button>
  );
}
