import { useEffect, useState } from "react";
import { X, MapPin, Navigation, Loader } from "@/components/Icons";
import { useApp } from "@/store";
import { userService } from "@/services";
import { reverseGeocode, nearbyAreas, type GeoPlace } from "@/lib/geocode";
import { nativeGeolocation } from "@/lib/nativeGeolocation";

interface Props {
  onClose: () => void;
  /** Fired right before onClose with the picked coordinates — lets a caller
   *  that has its own live query (the map) re-run it in the same action,
   *  instead of relying on the profile write above alone. Optional so
   *  existing callers (Home.tsx) are unaffected. */
  onLocationChanged?: (lat: number, lng: number) => void;
}

export default function LocationPickerSheet({ onClose, onLocationChanged }: Props) {
  const { user, area, refreshUser, showToast, setArea } = useApp();
  const [locating, setLocating] = useState(false);
  const [nearby, setNearby] = useState<GeoPlace[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  // Real nearby neighbourhoods around wherever the user already is — not a
  // fixed list, so this is useful (and correct) no matter which city someone's
  // actually in.
  useEffect(() => {
    if (user.lat == null || user.lng == null) return;
    setNearbyLoading(true);
    nearbyAreas(user.lat, user.lng)
      .then(setNearby)
      .finally(() => setNearbyLoading(false));
  }, [user.lat, user.lng]);

  async function handleSelect(p: GeoPlace) {
    try {
      await userService.setLocation(p.lat, p.lng, p.area);
      await refreshUser();
      setArea(p.area);
      showToast(`Location set — ${p.area} ✓`);
      onLocationChanged?.(p.lat, p.lng);
      onClose();
    } catch {
      showToast("Couldn't set location");
    }
  }

  function handleGPS() {
    setLocating(true);
    nativeGeolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const areaName = await reverseGeocode(latitude, longitude);
        try {
          await userService.setLocation(latitude, longitude, areaName ?? undefined);
          await refreshUser();
          if (areaName) setArea(areaName);
          showToast(`Location set — ${areaName || "current position"} ✓`);
          onLocationChanged?.(latitude, longitude);
          onClose();
        } catch {
          showToast("Got GPS fix, but couldn't save it — check connection & retry");
        }
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        showToast(err.code === 1 ? "Location permission denied — enable it in phone settings" : "Couldn't get a GPS fix — try near a window or outdoors");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  return (
    <div className="overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          maxHeight: "95vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "24px 24px 0 0",
          padding: "20px 16px calc(32px + var(--safe-area-bottom))",
        }}
      >
        <div className="sheet-grab" style={{ background: "var(--ink-200)" }} />

        {/* Header */}
        <div className="row between" style={{ marginBottom: 18 }}>
          <div className="row gap-8">
            <MapPin size={20} color="var(--brand-700)" />
            <h3 className="bold h2" style={{ color: "var(--ink-900)" }}>Select Area</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--ink-100)",
              border: "none",
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--ink-700)",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Current Location Info */}
        <div style={{ background: "var(--brand-50)", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          <span className="tiny semi muted" style={{ display: "block" }}>CURRENT SELECTION</span>
          <span className="semi" style={{ fontSize: 15, color: "var(--brand-800)", marginTop: 2, display: "block" }}>
            📍 {area || "Not set"}
          </span>
        </div>

        {/* GPS Button */}
        <button
          onClick={handleGPS}
          disabled={locating}
          className="btn btn-outline btn-block row center gap-8"
          style={{ padding: "12px", borderRadius: 14, background: "#fff", marginBottom: 16 }}
        >
          {locating ? <Loader size={16} className="spin" /> : <Navigation size={16} color="var(--brand-700)" />}
          <span className="semi" style={{ fontSize: 14 }}>
            {locating ? "Locating..." : "Use current GPS location"}
          </span>
        </button>

        {/* Nearby areas — real neighbourhoods around wherever the user already
            is, not a fixed list. GPS is still the primary path; this is a
            faster tap for "somewhere close by, not exactly here." */}
        <div className="col gap-10" style={{ overflowY: "auto", flexGrow: 1, maxHeight: 280 }}>
          <div className="tiny semi muted" style={{ letterSpacing: 0.5 }}>NEARBY AREAS</div>
          {nearbyLoading ? (
            <div className="tiny muted" style={{ padding: "12px 14px" }}>Finding nearby areas…</div>
          ) : nearby.length === 0 ? (
            <div className="tiny muted" style={{ padding: "12px 14px" }}>
              {user.lat == null ? "Use GPS above to see nearby areas." : "Couldn't find nearby areas — try GPS or search above."}
            </div>
          ) : (
            nearby.map((p) => (
              <button
                key={p.area}
                onClick={() => handleSelect(p)}
                className="row gap-10"
                style={{
                  width: "100%", padding: "12px 14px", border: "none", background: "var(--ink-50)",
                  borderRadius: 14, textAlign: "left", cursor: "pointer"
                }}
              >
                <MapPin size={18} color="var(--ink-500)" />
                <div className="grow">
                  <div className="semi small" style={{ color: "var(--ink-900)" }}>{p.area}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
