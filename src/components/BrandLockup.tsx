import type { CSSProperties } from "react";

/**
 * STRYT horizontal lockup — a shepherd's-crook street lamp whose head hangs
 * directly above the "S", casting an amber→pink beam that lights the S, with
 * the bold white "STRYT" wordmark to its right. Matches the brand sheet
 * (WhatsApp Image 2026-07-09) exactly.
 *
 * The entire lockup — lamp, beam, wordmark and tagline — is ONE SVG in a
 * fixed coordinate space. The lamp head is pinned at x≈58 and the wordmark
 * starts at x=46 via `textLength`, so the head always sits directly above the
 * S and the three pieces can never drift out of alignment regardless of
 * `size` or platform font metrics.
 *
 * Only the lamp (in `.brand-lockup-lamp`) carries the warm glow — the wordmark
 * and tagline stay crisp, never lit.
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
  const vbW = 250;
  // Headroom above y=0 so the tall pole and high-hanging head aren't clipped —
  // the lamp head sits well above the wordmark, leaving the S fully visible.
  const vbTop = 30;
  const vbH = (withTagline ? 150 : 116) + vbTop;
  // Height chosen so the wordmark's cap-height ≈ 0.9·size on both variants,
  // preserving the sizing contract every call site relies on.
  const height = (vbH * size) / 60;
  const style = { "--lamp-glow": glow } as CSSProperties;
  const FONT = 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif';

  return (
    <button className="brand-lockup" onClick={onClick} aria-label={ariaLabel} style={style}>
      <svg
        className="brand-lockup-svg"
        viewBox={`0 ${-vbTop} ${vbW} ${vbH}`}
        height={height}
        role="img"
        aria-label="STRYT"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Amber at the lamp, deepening to pink at the foot of the beam. */}
          <linearGradient id="brand-lockup-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-400)" />
            <stop offset="52%" stopColor="var(--accent-500)" />
            <stop offset="100%" stopColor="var(--pink-500)" />
          </linearGradient>
          <filter id="brand-lockup-spill" x="-30%" y="-20%" width="160%" height="150%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Light beam — a soft blurred spill under a sharp gradient cone, its
            apex at the lamp head (x≈66, centred over the S) and its base
            falling across the S. Drawn behind the text so the "S" is fully visible and clear. */}
        <polygon className="brand-lockup-spill" points="48,8 84,8 118,110 20,110" fill="var(--accent-400)" filter="url(#brand-lockup-spill)" />
        <polygon className="brand-lockup-cone" points="50,8 82,8 110,110 30,110" fill="url(#brand-lockup-beam)" />

        {/* Wordmark. S is the first glyph, so a fixed textLength pins where it
            starts (x=46) — directly under the lamp head. Never glows.
            Baseline moved to y=110 to align with the bottom of the lamp base. */}
        <text
          x="46" y="110" textLength="196" lengthAdjust="spacingAndGlyphs"
          fontFamily={FONT} fontWeight={900} fontSize="76" fill="currentColor"
          style={{ letterSpacing: "-2px" }}
        >
          STRYT
        </text>

        {withTagline && (
          <text
            x="47" y="144" textLength="194" lengthAdjust="spacingAndGlyphs"
            fontFamily={FONT} fontWeight={900} fontSize="20.5" fill="currentColor"
            style={{ letterSpacing: "0.5px" }}
          >
            YOUR STREET. YOUR PEOPLE.
          </text>
        )}

        {/* Street lamp — dark silhouette drawn on top, head hanging above the S.
            This group alone carries the warm glow (see .brand-lockup-lamp). */}
        <g className="brand-lockup-lamp">
          {/* Tapered base column for the lamp post as seen in the reference image */}
          <polygon points="14,110 34,110 28,60 20,60" fill="var(--ink-900)" />
          {/* Vertical pole starting from the top of the tapered base */}
          <path d="M24 60 L24 -8 C24 -26 66 -26 66 -12" fill="none" stroke="var(--ink-900)" strokeWidth="4.2" strokeLinecap="round" />
          <circle className="brand-lockup-halo" cx="66" cy="11" r="17" />
          <path d="M56 -6 L76 -6 L82 8 L50 8 Z" fill="var(--ink-900)" />
          <path d="M59 -12 L73 -12 L76 -6 L56 -6 Z" fill="var(--ink-900)" />
          <rect className="brand-lockup-bulb" x="54" y="6.5" width="24" height="4.4" rx="2.2" />
        </g>
      </svg>
    </button>
  );
}
