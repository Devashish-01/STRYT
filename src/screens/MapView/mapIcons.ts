import L from "leaflet";
import { makePinIcon } from "@/lib/leafletIcon";
import "@/lib/leafletIcon";

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

export function makeStoryIcon(avatarUrl: string, seen: boolean) {
  const ringStyle = seen
    ? "background:var(--ink-400)"
    : "background:linear-gradient(135deg,#ff8400,#ec4899,var(--brand-600))";
  return L.divIcon({
    className: "",
    html: `<div style="width:44px;height:44px;border-radius:50%;${ringStyle};padding:2.5px;box-shadow:0 2px 10px rgba(0,0,0,0.35)">
      <div style="width:100%;height:100%;border-radius:50%;background:var(--ink-200);overflow:hidden;border:2px solid #fff">
        ${avatarUrl ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" />` : ""}
      </div>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -28],
  });
}

export const businessIcon = makePinIcon(pinColors.business);
export const businessOfflineIcon = makePinIcon("var(--ink-400)");
export const providerIcon = makePinIcon(pinColors.provider);
export const providerOfflineIcon = makePinIcon("var(--ink-400)");
export const requestIcon  = makePinIcon(pinColors.request);

export const meIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:var(--brand-500);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
