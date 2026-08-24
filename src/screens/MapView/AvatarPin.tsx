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
export type RingTone = "open" | "closed" | "available" | "unavailable" | "story-new" | "story-seen" | "place";

/** Exported so popup CTAs (and anything else that must match a pin's ring)
 *  read the same tone source — pinColors.business/provider used to drift.
 *  `closed` and `unavailable` are deliberately DIFFERENT greys (not the same
 *  value, as they used to be) — a shut shop and an offline provider are
 *  different situations and shouldn't be visually identical on the map. Both
 *  stay muted, neither competes with an active-state color. */
export const RING_BACKGROUND: Record<RingTone, string> = {
  open: "var(--brand-600)",
  closed: "var(--ink-300)",
  available: "var(--green-500)",
  unavailable: "var(--ink-400)",
  "story-new": "linear-gradient(135deg,var(--accent-500),var(--pink-500),var(--brand-600))",
  "story-seen": "var(--ink-400)",
  // Places have no open/closed or available/unavailable state — one static
  // tone, distinct from every other pin type so it reads as its own category.
  place: "var(--amber-700)",
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
export function AvatarPin({ photo, name, tone, fallback: Fallback, size = MIN_TAP_PX, badge, shape = "circle" }: {
  photo?: string | null;
  name?: string | null;
  tone: RingTone;
  /** Shown inside the ring when there's no photo — a Store/Briefcase glyph, so a shop with no cover image reads as "a shop with no photo yet", not a blank tinted circle. */
  fallback?: ComponentType<{ size?: number | string; color?: string }>;
  size?: number;
  /** Optional status pill badge attached at the bottom of the pin (e.g. "🟢 Open • 2 in queue"). */
  badge?: string | null;
  /** "circle" (default) for every actual map <Marker> — MAP_SNAPCHAT_STYLE_PLAN.md
   *  §2.3 D2 fixed pins as circular photos, not touched here. "square" is for
   *  MapCarousel's business cards only, matching how the rest of the app
   *  already tells a business (rectangular cover photo) from a provider
   *  (circular avatar) apart — a shape signal that survives having a photo,
   *  unlike ring color alone. */
  shape?: "circle" | "square";
}) {
  const [broken, setBroken] = useState(false);
  const showPhoto = !!photo && !broken;
  const radius = shape === "square" ? size * 0.28 : "50%";
  return (
    <span style={{ cursor: "pointer", display: "block", position: "relative" }}>
      <div
        style={{
          width: size, height: size, borderRadius: radius, padding: 2.5,
          boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
          background: RING_BACKGROUND[tone],
          transition: "box-shadow 0.2s ease, transform 0.2s ease",
        }}
      >
        <div
          style={{
            width: "100%", height: "100%", borderRadius: radius,
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

      {badge ? (
        <span className="map-pin-badge">
          {badge}
        </span>
      ) : null}
    </span>
  );
}
