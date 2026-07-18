import L from "leaflet";

// Fix Leaflet's default icon path broken by bundlers.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/** Colored map pin used across MapView and LocationPicker. */
export function makePinIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 5px rgba(26, 21, 48, 0.25));">
      <path d="M16 0C7.16 0 0 7.16 0 16C0 26.5 16 40 16 40S32 26.5 32 16C32 7.16 24.84 0 16 0Z" fill="${color}"/>
      <circle cx="16" cy="16" r="6.5" fill="#FFFFFF"/>
      <circle cx="16" cy="16" r="3.5" fill="${color}"/>
    </svg>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
  });
}

