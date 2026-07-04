import { useEffect } from "react";
import { useMapEvents } from "react-leaflet";
import { MapPin, X, Check, Loader } from "lucide-react";

// Lives inside <MapContainer>. The pin itself is fixed on screen — this just
// reports the map's center whenever a pan/zoom settles, so the caller can
// resolve "whatever is under the pin" into an address.
export function PickCenterTracker({ onCenterChange }: { onCenterChange: (lat: number, lng: number) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      onCenterChange(c.lat, c.lng);
    },
  });
  useEffect(() => {
    const c = map.getCenter();
    onCenterChange(c.lat, c.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

// Rendered as a sibling of <MapContainer>, not inside it — the pin is plain
// absolutely-positioned HTML fixed at the viewport center, tip pointing at
// the exact center point, while the map pans underneath it.
export function LocationPinDropOverlay({
  address, addressLoading, confirming, onConfirm, onCancel,
}: {
  address: string;
  addressLoading: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {/* Top instruction bar */}
      <div
        style={{
          position: "absolute", top: 12, left: 16, right: 16, zIndex: 1000,
          display: "flex", alignItems: "center", gap: 10,
          background: "#fff", borderRadius: 30, padding: "10px 10px 10px 18px",
          boxShadow: "var(--shadow)",
        }}
      >
        <span className="semi" style={{ fontSize: 13, color: "var(--ink-800)", flex: 1 }}>
          Move the map to place the pin
        </span>
        <button
          className="icon-btn"
          onClick={onCancel}
          style={{ background: "var(--ink-100)", flexShrink: 0 }}
          aria-label="Cancel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Fixed center pin — tip anchored exactly at viewport center */}
      <div
        style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -100%)",
          zIndex: 1000, pointerEvents: "none",
          display: "flex", flexDirection: "column", alignItems: "center",
          filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.3))",
        }}
      >
        <MapPin size={44} fill="var(--brand-600)" color="#fff" strokeWidth={1.5} />
      </div>
      {/* Ground shadow ellipse, reinforces the pin "hovering" over the point */}
      <div
        style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, 2px)",
          width: 14, height: 6, borderRadius: "50%",
          background: "rgba(0,0,0,0.28)", filter: "blur(1.5px)",
          zIndex: 999, pointerEvents: "none",
        }}
      />

      {/* Bottom confirm card */}
      <div
        style={{
          position: "absolute", bottom: 24, left: 16, right: 16, zIndex: 1000,
          background: "#fff", borderRadius: 20, padding: 16,
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
        }}
      >
        <div className="row gap-8" style={{ alignItems: "center", marginBottom: 14 }}>
          <MapPin size={16} color="var(--brand-600)" style={{ flexShrink: 0 }} />
          {addressLoading ? (
            <span className="row gap-6" style={{ alignItems: "center", color: "var(--ink-500)" }}>
              <Loader size={13} className="spin" />
              <span className="small">Finding address…</span>
            </span>
          ) : (
            <span className="semi small" style={{ color: "var(--ink-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {address || "Move the map to select a point"}
            </span>
          )}
        </div>
        <div className="row gap-10">
          <button
            className="btn btn-outline"
            style={{ flex: 1 }}
            onClick={onCancel}
            disabled={confirming}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary row center gap-6"
            style={{ flex: 2 }}
            onClick={onConfirm}
            disabled={confirming || addressLoading}
          >
            {confirming ? <Loader size={15} className="spin" /> : <Check size={15} />}
            {confirming ? "Saving…" : "Confirm this location"}
          </button>
        </div>
      </div>
    </>
  );
}
