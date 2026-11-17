import { useId } from "react";

// Compact Home-header version of the approved lamp + STRYT wordmark.
// Letter outlines preserve the existing condensed identity across device fonts.
const WORDMARK_PATH = "M 47.65625 34.873047 L 28.564455 34.873047 L 28.564455 29.013674 Q 28.564455 24.91211 27.832031 23.789064 Q 27.09961 22.666016 25.390625 22.666016 Q 23.535154 22.666016 22.583006 24.179686 Q 21.630857 25.693361 21.630857 28.769531 Q 21.630857 32.72461 22.705078 34.726563 Q 23.730469 36.728516 28.515625 39.560547 Q 42.23633 47.71484 45.80078 52.939453 Q 49.365234 58.16406 49.365234 69.78516 Q 49.365234 78.23242 47.387695 82.23633 Q 45.410156 86.240234 39.746094 88.9502 Q 34.08203 91.66016 26.562502 91.66016 Q 18.310547 91.66016 12.475587 88.53516 Q 6.6406255 85.41016 4.8339844 80.57617 Q 3.0273438 75.74219 3.0273438 66.85547 L 3.0273438 61.679688 L 22.11914 61.679688 L 22.11914 71.29883 Q 22.11914 75.74219 22.924805 77.01172 Q 23.730469 78.28125 25.78125 78.28125 Q 27.832031 78.28125 28.833008 76.66992 Q 29.833984 75.05859 29.833984 71.884766 Q 29.833984 64.90234 27.929688 62.753906 Q 25.976563 60.605473 18.310547 55.57617 Q 10.644531 50.498047 8.154297 48.203125 Q 5.6640625 45.908203 4.0283203 41.85547 Q 2.3925781 37.802734 2.3925781 31.503904 Q 2.3925781 22.421875 4.711914 18.222656 Q 7.03125 14.023438 12.207031 11.6552725 Q 17.382813 9.287109 24.707031 9.287109 Q 32.714844 9.287109 38.354492 11.875 Q 43.994144 14.462891 45.82519 18.393555 Q 47.65625 22.324219 47.65625 31.748047 L 47.65625 34.873047 Z M 98.2168 10.947266 L 98.2168 26.767578 L 86.009766 26.767578 L 86.009766 90 L 65.453125 90 L 65.453125 26.767578 L 53.294918 26.767578 L 53.294918 10.947266 L 98.2168 10.947266 Z M 103.9043 10.947266 L 118.45508 10.947266 Q 133.00586 10.947266 138.15723 12.0703125 Q 143.3086 13.193359 146.55566 17.807617 Q 149.80273 22.421875 149.80273 32.529297 Q 149.80273 41.757813 147.50781 44.93164 Q 145.21289 48.10547 138.47461 48.740234 Q 144.57813 50.253906 146.67773 52.79297 Q 148.77734 55.33203 149.29004 57.456055 Q 149.80273 59.58008 149.80273 69.15039 L 149.80273 90 L 130.71094 90 L 130.71094 63.73047 Q 130.71094 57.382816 129.70996 55.869144 Q 128.70898 54.355465 124.46093 54.355465 L 124.46093 90 L 103.9043 90 L 103.9043 10.947266 Z M 124.46093 24.472656 L 124.46093 42.05078 Q 127.927734 42.05078 129.31934 41.098633 Q 130.71094 40.146484 130.71094 34.921875 L 130.71094 30.576172 Q 130.71094 26.816406 129.36816 25.644531 Q 128.02539 24.472656 124.46093 24.472656 Z M 202.56055 10.947266 L 187.57031 61.386723 L 187.57031 90 L 168.52734 90 L 168.52734 61.386723 L 154.07422 10.947266 L 172.9707 10.947266 Q 177.41406 34.04297 177.95117 42.05078 Q 179.66017 29.404295 183.66406 10.947266 L 202.56055 10.947266 Z M 248.48242 10.947266 L 248.48242 26.767578 L 236.27539 26.767578 L 236.27539 90 L 215.71875 90 L 215.71875 26.767578 L 203.56055 26.767578 L 203.56055 10.947266 L 248.48242 10.947266 Z";

export default function HomeWordmark({
  width = 132,
  glow = 0.5,
  onClick,
}: {
  width?: number;
  glow?: number;
  onClick: () => void;
}) {
  const id = useId().replace(/:/g, "");
  const warmth = Math.max(0, Math.min(1, glow));

  return (
    <button
      type="button"
      className="home-wordmark"
      aria-label="STRYT home"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", flexShrink: 0,
        width, minHeight: 44, padding: 0, border: 0,
        background: "none", color: "var(--white)", cursor: "pointer",
      }}
    >
      <svg width={width} height={width * 116 / 285} viewBox="0 0 285 116" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent-400)" stopOpacity={0.55 + warmth * 0.2} />
            <stop offset="0.55" stopColor="var(--accent-500)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--accent-500)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="var(--ink-800)" />
            <stop offset="1" stopColor="var(--ink-900)" />
          </linearGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="var(--accent-400)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--accent-500)" stopOpacity="0.25" />
          </linearGradient>
          <filter id={`${id}-soft`} x="-35%" y="-15%" width="170%" height="140%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        <path d="M46 35 H77 L95 99 H31 Z" fill={`url(#${id}-beam)`} filter={`url(#${id}-soft)`} />
        <path d="M17 87 V27 C17 3 64 2 64 22" fill="none" stroke={`url(#${id}-metal)`} strokeWidth="5.5" strokeLinecap="round" />
        <path d="M18.5 87 V27 C18.5 6 62.5 5 62.5 22" fill="none" stroke={`url(#${id}-rim)`} strokeWidth="1.1" strokeLinecap="round" />
        <path d="M8 107 H30 L24 83 H14 Z" fill={`url(#${id}-metal)`} />
        <path d="M24 83 L30 107" fill="none" stroke={`url(#${id}-rim)`} strokeWidth="1.2" />
        <path d="M54 21 H74 L82 36 H45 Z" fill={`url(#${id}-metal)`} />
        <path d="M74 22 L80 35" fill="none" stroke={`url(#${id}-rim)`} strokeWidth="1.1" />
        <rect x="49" y="35" width="29" height="3.5" rx="1.75" fill="var(--white)" />
        <rect x="49" y="38.5" width="29" height="1.2" rx="0.6" fill="var(--accent-400)" opacity={0.6 + warmth * 0.4} />

        <path d={WORDMARK_PATH} transform="translate(41 22) scale(0.92)" fill="currentColor" />
      </svg>
    </button>
  );
}
