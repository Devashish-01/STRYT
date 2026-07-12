import type { CSSProperties } from "react";

/**
 * Shared STRYT wordmark. Its first letter is lit by the street-lamp beam from
 * the supplied logo; colours deliberately stay in the app's existing tokens.
 */
export default function BrandLockup({
  glow = 0.5,
  onClick,
  size = 20,
  withTagline = false,
  ariaLabel = "STRYT home",
}: {
  glow?: number;
  onClick?: () => void;
  size?: number;
  /** Use on spacious brand moments, such as the sign-in splash. */
  withTagline?: boolean;
  ariaLabel?: string;
}) {
  const style = { "--lamp-glow": glow, "--lockup-size": `${size}px` } as CSSProperties;

  return (
    <button className={`brand-lockup${withTagline ? " has-tagline" : ""}`} onClick={onClick} aria-label={ariaLabel} style={style}>
      <span className="brand-lockup-mark" aria-hidden="true">
        <svg viewBox="0 0 62 74" width={size * 1.42} height={size * 1.72} style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="brand-lockup-beam" x1="0" y1="0" x2="1" y2="0.9">
              <stop offset="0%" stopColor="var(--pink-500)" />
              <stop offset="42%" stopColor="var(--accent-400)" />
              <stop offset="100%" stopColor="var(--accent-500)" />
            </linearGradient>
            <filter id="brand-lockup-light" x="-20%" y="-20%" width="160%" height="150%">
              <feGaussianBlur stdDeviation="2.1" />
            </filter>
          </defs>
          {/* Soft spill sits below the sharp cone so the graphic feels lit, not pasted on. */}
          <polygon points="33,28 43,28 158,72 3,72" fill="var(--accent-400)" opacity="0.26" filter="url(#brand-lockup-light)" />
          <polygon points="33,28 43,28 153,72 3,72" fill="url(#brand-lockup-beam)" className="brand-lockup-cone" />
          <path d="M8 70 L20 70" stroke="var(--ink-900)" strokeWidth="3.3" strokeLinecap="round" />
          {/* Tall shepherd's-crook post and a downward-facing, suspended shade. */}
          <path d="M14 69 L14 15 C14 2 34 2 38 15 L38 18" fill="none" stroke="var(--ink-900)" strokeWidth="3.3" strokeLinecap="round" />
          <circle className="brand-lockup-halo" cx="39" cy="24" r="11" />
          <path d="M34 17 L44 17 L49 27 L29 27 Z" fill="var(--ink-900)" />
          <path d="M36 15 L42 15 L44 18 L34 18 Z" fill="var(--ink-900)" />
          <rect className="brand-lockup-bulb" x="33" y="26" width="12" height="3.4" rx="1.7" />
        </svg>
      </span>
      <span className="brand-lockup-type">
        <span className="brand-lockup-word" aria-hidden="true"><span className="brand-lockup-s">S</span><span>TRYT</span></span>
        {withTagline && <span className="brand-lockup-tagline">YOUR STREET. YOUR PEOPLE.</span>}
      </span>
    </button>
  );
}
