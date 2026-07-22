export type Layer = "business" | "provider" | "request" | "story";

export const pinColors: Record<Exclude<Layer, "story">, string> = {
  business: "var(--orange-500)",
  provider: "var(--green-500)",
  request:  "var(--brand-600)",
};

export const layerLabels: Record<Layer, string> = {
  business: "Shops",
  provider: "Providers",
  request:  "Requests",
  story:    "Stories",
};

// react-map-gl's <Marker> renders its children directly as the pin's visual
// (no separate icon-object registry like Leaflet's L.divIcon) — these are
// plain markup strings reused by MapMarkers.tsx via dangerouslySetInnerHTML
// on a single wrapper span, keeping the exact same SVG/CSS this app already
// ships (colors, drop-shadow, gradients) instead of redrawing it as JSX.

/** Colored map pin — same 32×40 teardrop SVG used across MapView/LocationPicker. */
export function pinHtml(color: string): string {
  return `<svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0px 3px 5px rgba(26,21,48,0.25))">
    <path d="M16 0C7.16 0 0 7.16 0 16C0 26.5 16 40 16 40S32 26.5 32 16C32 7.16 24.84 0 16 0Z" fill="${color}"/>
    <circle cx="16" cy="16" r="6.5" fill="#FFFFFF"/>
    <circle cx="16" cy="16" r="3.5" fill="${color}"/>
  </svg>`;
}

export function storyIconHtml(avatarUrl: string, seen: boolean): string {
  const ringStyle = seen
    ? "background:var(--ink-400)"
    : "background:linear-gradient(135deg,#ff8400,var(--pink-500),var(--brand-600))";
  return `<div style="width:44px;height:44px;border-radius:50%;${ringStyle};padding:2.5px;box-shadow:0 2px 10px rgba(0,0,0,0.35)">
    <div style="width:100%;height:100%;border-radius:50%;background:var(--ink-200);overflow:hidden;border:2px solid #fff">
      ${avatarUrl ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" />` : ""}
    </div>
  </div>`;
}

export const meIconHtml = `<div class="gps-pulse-container">
  <div class="gps-pulse-ring"></div>
  <div class="gps-pulse-dot"></div>
</div>`;

export const businessIconHtml = pinHtml(pinColors.business);
export const businessOfflineIconHtml = pinHtml("var(--ink-400)");
export const providerIconHtml = pinHtml(pinColors.provider);
export const providerOfflineIconHtml = pinHtml("var(--ink-400)");
export const requestIconHtml = pinHtml(pinColors.request);
