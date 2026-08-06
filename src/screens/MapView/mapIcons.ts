export type Layer = "business" | "provider" | "request" | "story";

export const pinColors: Record<Exclude<Layer, "story">, string> = {
  business: "var(--orange-500)",
  provider: "var(--green-500)",
  request:  "var(--brand-600)",
};

// react-map-gl's <Marker> renders its children directly as the pin's visual
// (no separate icon-object registry like Leaflet's L.divIcon) — these are
// plain markup strings reused by MapMarkers.tsx via dangerouslySetInnerHTML
// on a single wrapper span, keeping the exact same SVG/CSS this app already
// ships (colors, drop-shadow, gradients) instead of redrawing it as JSX.

/**
 * Colored teardrop pin — 32×40 SVG.
 *
 * As of the avatar-pin redesign (MAP_SNAPCHAT_STYLE_PLAN.md, Phase A) this is
 * used for REQUESTS ONLY. A request has no photo to show — there's no shop
 * front or profile picture behind it — so forcing it into the circular avatar
 * treatment businesses/providers/stories now share would mean rendering a
 * blank tinted circle, which reads as broken rather than intentional. The
 * plain pin still says "something is here" without pretending there's a photo.
 */
export function pinHtml(color: string): string {
  return `<svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0px 3px 5px rgba(26,21,48,0.25))">
    <path d="M16 0C7.16 0 0 7.16 0 16C0 26.5 16 40 16 40S32 26.5 32 16C32 7.16 24.84 0 16 0Z" fill="${color}"/>
    <circle cx="16" cy="16" r="6.5" fill="#FFFFFF"/>
    <circle cx="16" cy="16" r="3.5" fill="${color}"/>
  </svg>`;
}

// storyIconHtml() was removed here. It was dead code — MapMarkers carried its
// own copy of the same markup — and it interpolated a user-supplied avatar URL
// straight into an `src` attribute alongside an inline `onerror` handler. The
// live copy is now real JSX (see MapMarkers' AvatarPin), which escapes its
// inputs and needs no `'unsafe-inline'` in the CSP.

// Safe to keep as a string: static markup, no interpolation, no handlers.
export const meIconHtml = `<div class="gps-pulse-container">
  <div class="gps-pulse-ring"></div>
  <div class="gps-pulse-dot"></div>
</div>`;

// businessIconHtml / businessOfflineIconHtml / providerIconHtml /
// providerOfflineIconHtml were removed here — businesses and providers no
// longer render as teardrop pins. See AvatarPin in MapMarkers.tsx.
export const requestIconHtml = pinHtml(pinColors.request);
