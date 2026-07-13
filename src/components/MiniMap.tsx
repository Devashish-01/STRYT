import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { Navigation } from "@/components/Icons";
import { makePinIcon } from "@/lib/leafletIcon";
import "@/lib/leafletIcon";
import { config } from "@/config";

interface Props {
  lat: number;
  lng: number;
  /** Pin color token, e.g. "var(--orange-500)" for business, green for provider. */
  pinColor?: string;
  height?: number;
  /** Caption under the pin button, e.g. the area/address line. */
  label?: string;
}

/**
 * Read-only location card for detail pages: a static map with the place's pin
 * and a one-tap Directions overlay. Interaction is intentionally disabled so
 * the page keeps scrolling naturally — tapping anywhere opens Google Maps.
 */
export default function MiniMap({ lat, lng, pinColor = "var(--brand-600)", height = 160, label }: Props) {
  if (!lat || !lng) return null;
  const openDirections = () => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, "_blank", "noopener");
  };
  return (
    <div
      style={{ position: "relative", height, borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)", cursor: "pointer" }}
      onClick={openDirections}
      role="button"
      aria-label="Open directions in Google Maps"
    >
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        keyboard={false}
        attributionControl={false}
      >
        <TileLayer url={`https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/256/{z}/{x}/{y}?access_token=${config.mapboxToken}`} />
        <Marker position={[lat, lng]} icon={makePinIcon(pinColor)} />
      </MapContainer>
      <div
        className="row gap-6"
        style={{
          position: "absolute", bottom: 10, right: 10, zIndex: 1000,
          background: "#fff", borderRadius: 999, padding: "7px 13px",
          boxShadow: "var(--shadow)", alignItems: "center",
          fontSize: 12.5, fontWeight: 700, color: "var(--brand-700)",
        }}
      >
        <Navigation size={13} /> Directions
      </div>
      {label && (
        <div
          style={{
            position: "absolute", bottom: 10, left: 10, zIndex: 1000, maxWidth: "55%",
            background: "rgba(255,255,255,0.92)", borderRadius: 10, padding: "5px 10px",
            fontSize: 11.5, fontWeight: 600, color: "var(--ink-700)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          📍 {label}
        </div>
      )}
    </div>
  );
}
