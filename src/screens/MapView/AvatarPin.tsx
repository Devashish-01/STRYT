import { useState } from "react";
import type { ComponentType } from "react";

/** Minimum comfortable touch target (iOS HIG / Material both land here). */
export const MIN_TAP_PX = 44;

/**
 * The ring state around an avatar pin. One vocabulary shared by every pin type
 * that has an open/closed or available/unavailable state — a business "open"
 * and a provider "available" are the same visual idea (brand-colored ring vs.
 * grey), so they share tones rather than each type inventing its own palette.
 */
export type RingTone = "open" | "closed" | "available" | "unavailable" | "story-new" | "story-seen";

const RING_BACKGROUND: Record<RingTone, string> = {
  open: "var(--brand-600)",
  closed: "var(--ink-300)",
  available: "var(--green-500)",
  unavailable: "var(--ink-300)",
  "story-new": "linear-gradient(135deg,#ff8400,var(--pink-500),var(--brand-600))",
  "story-seen": "var(--ink-400)",
};

/**
 * One circular-avatar pin renderer shared by businesses, providers, stories
 * AND the map carousel's cards (MAP_SNAPCHAT_STYLE_PLAN.md §2.3 — decision
 * D2: every pin is a circular photo, not a generic map-pin icon). Lives in
 * its own file, not MapMarkers.tsx, so MapCarousel.tsx can render the exact
 * same avatar without importing react-map-gl's <Marker>/<Popup>.
 *
 * Real JSX rather than an HTML string: interpolating a user-supplied photo
 * URL into `src`/`alt` inside dangerouslySetInnerHTML is both an escaping
 * risk (a name with a `"` could break out of the attribute) and what forces
 * `'unsafe-inline'` into the CSP. React escapes both, and `onError` is a
 * real listener.
 *
 * Already meets the 44pt minimum tap target at its default size.
 */
export function AvatarPin({ photo, name, tone, fallback: Fallback, size = MIN_TAP_PX }: {
  photo?: string | null;
  name?: string | null;
  tone: RingTone;
  /** Shown inside the ring when there's no photo — a Store/Briefcase glyph, so a shop with no cover image reads as "a shop with no photo yet", not a blank tinted circle. */
  fallback?: ComponentType<{ size?: number | string; color?: string }>;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const showPhoto = !!photo && !broken;
  return (
    <span style={{ cursor: "pointer", display: "block" }}>
      <div
        style={{
          width: size, height: size, borderRadius: "50%", padding: 2.5,
          boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
          background: RING_BACKGROUND[tone],
        }}
      >
        <div
          style={{
            width: "100%", height: "100%", borderRadius: "50%",
            background: "var(--ink-100)", overflow: "hidden", border: "2px solid #fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {showPhoto ? (
            <img
              src={photo!}
              alt={name ?? ""}
              onError={() => setBroken(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : Fallback ? (
            <Fallback size={Math.round(size * 0.45)} color="var(--ink-400)" />
          ) : null}
        </div>
      </div>
    </span>
  );
}
