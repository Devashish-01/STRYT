import type { CSSProperties } from "react";

/**
 * The STRYT app icon — the pin-with-winding-street mark on a rounded
 * brand-gradient tile, identical to the browser favicon and PWA icon. This is
 * the app's square "app icon" identity (distinct from the horizontal
 * lamp + wordmark lockup in <BrandLockup/>): use it wherever a compact app
 * badge belongs — splash / sign-in, share cards, "this is the app" moments.
 */
export default function AppMark({
  size = 56,
  radius,
  shadow = true,
  onClick,
  style,
}: {
  size?: number;
  radius?: number;
  shadow?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const r = radius ?? Math.round(size * 0.28); // matches the 16/64 favicon corner
  const wrap: CSSProperties = {
    width: size,
    height: size,
    borderRadius: r,
    overflow: "hidden",
    display: "inline-flex",
    flexShrink: 0,
    boxShadow: shadow ? "0 10px 26px rgba(74, 16, 104, 0.35)" : undefined,
    ...style,
  };
  const svg = (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block" }}>
      <defs>
        <linearGradient id="strytAppBg" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--brand-400)" }} />
          <stop offset="1" style={{ stopColor: "var(--brand-700)" }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#strytAppBg)" />
      {/* location pin */}
      <path d="M32 13 C23 13 16 20 16 28.8 C16 39.5 32 52 32 52 C32 52 48 39.5 48 28.8 C48 20 41 13 32 13 Z" fill="#fff" />
      {/* winding street */}
      <path d="M32 39 C25 34 39 24 32 19" stroke="var(--brand-600)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* street centre line */}
      <path d="M32 39 C25 34 39 24 32 19" stroke="var(--accent-500)" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeDasharray="0.5 3.6" />
    </svg>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label="STRYT" style={{ ...wrap, border: "none", padding: 0, cursor: "pointer", background: "none" }}>
        {svg}
      </button>
    );
  }
  return <span aria-hidden="true" style={wrap}>{svg}</span>;
}
