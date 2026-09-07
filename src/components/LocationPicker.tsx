import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import { Navigation, MapPin, Loader, X } from "@/components/Icons";
import { useGeolocation } from "@/hooks/useGeolocation";
import { forwardGeocode, type GeoPlace } from "@/lib/geocode";
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
  /** Hides the address search. Only for callers where the pin is definitionally
   *  "here" and typing an address would be meaningless. */
  searchable?: boolean;
  searchPlaceholder?: string;
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
  searchable = true,
  searchPlaceholder = "Search an area, street or landmark…",
}: LocationPickerProps) {
  const { loading, error, request } = useGeolocation({ storedLat, storedLng });
  const autoRequested = useRef(false);

  // Address search. "Detect my location" puts the pin wherever the phone is,
  // which for anyone setting up their shop listing from home, or from their
  // accountant's office, is the wrong place — and the only remedy was dragging
  // across kilometres of tiles inside a ~190px box. forwardGeocode already
  // existed and had no caller here.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  // Debounced and token-guarded for the same reason the onboarding location
  // beat is: Nominatim allows about one request a second and answers a burst
  // with HTTP 429, whose symptom is an empty result list that looks exactly
  // like "no such place".
  const searchToken = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  function search(q: string) {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    const trimmed = q.trim();
    if (trimmed.length < 3) {
      searchToken.current++;
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const token = ++searchToken.current;
      try {
        const found = await forwardGeocode(trimmed);
        if (token !== searchToken.current) return;
        setResults(found);
      } catch {
        if (token !== searchToken.current) return;
        setResults([]);
      } finally {
        if (token === searchToken.current) setSearching(false);
      }
    }, 400);
  }

  function pick(place: GeoPlace) {
    searchToken.current++;
    setResults([]);
    setQuery("");
    setSearching(false);
    // Lands the pin on the result. The map stays interactive afterwards, so a
    // geocode that's close but not exact is a starting point to nudge rather
    // than a final answer — which is why this doesn't also lock anything in.
    onChange(place.lat, place.lng);
  }

  // Auto-detect on mount (marketplace onboarding pattern).
  // Treat (0, 0) as "no location yet" — some parents initialise with 0
  // instead of null, which used to skip GPS and leave the pin at the default.
  const hasRealPin = lat !== null && lng !== null && !(lat === 0 && lng === 0);
  useEffect(() => {
    if (autoRequested.current || hasRealPin) return;
    autoRequested.current = true;
    void request().then((coords) => {
      if (coords) onChange(coords.lat, coords.lng);
    });
  }, [hasRealPin, onChange, request]);

  useEffect(() => {
    if (error) onError?.(error);
  }, [error, onError]);

  const centerLat = lat ?? storedLat ?? DEFAULT_LAT;
  const centerLng = lng ?? storedLng ?? DEFAULT_LNG;
  const hasPin = hasRealPin;

  async function detect() {
    // force=true: this is an explicit user tap asking for a fresh GPS fix,
    // not the auto-detect-on-mount call — never just re-serve stored coords.
    const coords = await request(true);
    if (coords) onChange(coords.lat, coords.lng);
  }

  return (
    <div className="col gap-8">
      {searchable && (
        <div style={{ position: "relative" }}>
          <div className="row gap-8 center-v" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 12, padding: "0 12px", background: "#fff" }}>
            <MapPin size={16} color="var(--ink-400)" />
            <input
              className="input"
              style={{ border: "none", padding: "10px 0", fontSize: 14 }}
              value={query}
              placeholder={searchPlaceholder}
              aria-label="Search for an address"
              onChange={(e) => search(e.target.value)}
            />
            {searching && <Loader className="spin" size={14} />}
            {!searching && query && (
              <button
                type="button"
                className="icon-btn"
                style={{ width: 24, height: 24 }}
                aria-label="Clear search"
                onClick={() => search("")}
              >
                <X size={13} />
              </button>
            )}
          </div>
          {results.length > 0 && (
            <div
              className="col"
              style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 1200,
                background: "var(--surface)", border: "1px solid var(--ink-200)", borderRadius: 12,
                boxShadow: "var(--shadow-md, 0 8px 24px rgba(0,0,0,0.12))", overflow: "hidden", maxHeight: 240, overflowY: "auto",
              }}
            >
              {results.map((r, i) => (
                <button
                  key={`${r.lat},${r.lng},${i}`}
                  type="button"
                  className="row gap-8 center-v"
                  style={{ padding: "10px 12px", background: "none", border: "none", borderTop: i === 0 ? "none" : "1px solid var(--ink-100)", textAlign: "left", cursor: "pointer", width: "100%" }}
                  onClick={() => pick(r)}
                >
                  <MapPin size={14} color="var(--ink-400)" style={{ flexShrink: 0 }} />
                  <span className="small ellipsis">{r.area}</span>
                </button>
              ))}
            </div>
          )}
          {!searching && results.length === 0 && query.trim().length >= 3 && (
            <span className="tiny muted" style={{ display: "block", marginTop: 5 }}>
              No match — try the area or a nearby landmark, then tap the map to fine-tune.
            </span>
          )}
        </div>
      )}
      <div style={{ height, borderRadius: 16, overflow: "hidden", position: "relative" }}>
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={hasPin ? 16 : 13}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
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
      {!hasPin && searchable && (
        <span className="tiny muted" style={{ textAlign: "center" }}>
          Not at the shop? Search the address above instead.
        </span>
      )}
    </div>
  );
}
