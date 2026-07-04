import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import { Navigation } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { makePinIcon } from "@/lib/leafletIcon";
import "@/lib/leafletIcon";

import { config } from "@/config";

const DEFAULT_LAT = config.defaultLocation.lat;
const DEFAULT_LNG = config.defaultLocation.lng;

interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  storedLat?: number;
  storedLng?: number;
  height?: number;
  pinColor?: string;
  onError?: (message: string) => void;
}

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

// Precisely dragging a pin inside a ~150px box is fiddly on a touchscreen —
// tapping anywhere on the map to place the pin there is a much easier
// primary interaction, with drag left available for fine adjustment.
function MapClickToPlace({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onPlace(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

export default function LocationPicker({
  lat,
  lng,
  onChange,
  storedLat,
  storedLng,
  height = 150,
  pinColor = "var(--orange-500)",
  onError,
}: LocationPickerProps) {
  const { loading, error, request } = useGeolocation({ storedLat, storedLng });
  const autoRequested = useRef(false);

  // Auto-detect on mount (marketplace onboarding pattern).
  useEffect(() => {
    if (autoRequested.current || (lat !== null && lng !== null)) return;
    autoRequested.current = true;
    void request().then((coords) => {
      if (coords) onChange(coords.lat, coords.lng);
    });
  }, [lat, lng, onChange, request]);

  useEffect(() => {
    if (error) onError?.(error);
  }, [error, onError]);

  const centerLat = lat ?? storedLat ?? DEFAULT_LAT;
  const centerLng = lng ?? storedLng ?? DEFAULT_LNG;
  const hasPin = lat !== null && lng !== null;

  async function detect() {
    // force=true: this is an explicit user tap asking for a fresh GPS fix,
    // not the auto-detect-on-mount call — never just re-serve stored coords.
    const coords = await request(true);
    if (coords) onChange(coords.lat, coords.lng);
  }

  return (
    <div className="col gap-8">
      <div style={{ height, borderRadius: 16, overflow: "hidden", position: "relative" }}>
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={hasPin ? 16 : 13}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.mapbox.com/">Mapbox</a>'
            url={`https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/256/{z}/{x}/{y}?access_token=${config.mapboxToken}`}
          />
          <MapClickToPlace onPlace={onChange} />
          {hasPin && (
            <>
              <MapRecenter lat={lat} lng={lng} />
              <Marker
                position={[lat, lng]}
                icon={makePinIcon(pinColor)}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const pos = e.target.getLatLng();
                    onChange(pos.lat, pos.lng);
                  },
                }}
              />
            </>
          )}
        </MapContainer>
        {!hasPin && loading && (
          <span
            className="tiny semi"
            style={{
              position: "absolute",
              bottom: 10,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#fff",
              padding: "6px 12px",
              borderRadius: 8,
              zIndex: 1000,
            }}
          >
            Detecting location…
          </span>
        )}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-block row center gap-8"
        style={{ padding: "10px 12px" }}
        disabled={loading}
        onClick={() => void detect()}
      >
        <Navigation size={16} />
        {loading ? "Detecting…" : hasPin ? "Re-detect my location" : "Detect my location"}
      </button>
      {hasPin && (
        <span className="tiny muted" style={{ textAlign: "center" }}>
          Tap the map or drag the pin to fine-tune your exact location
        </span>
      )}
    </div>
  );
}
