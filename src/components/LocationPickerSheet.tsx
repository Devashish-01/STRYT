import { useState } from "react";
import { X, MapPin, Navigation, Loader } from "@/components/Icons";
import { useApp } from "@/store";
import { userService } from "@/services";
import { reverseGeocode, type GeoPlace } from "@/lib/geocode";
import { config } from "@/config";
import { nativeGeolocation } from "@/lib/nativeGeolocation";

interface Props {
  onClose: () => void;
}

export default function LocationPickerSheet({ onClose }: Props) {
  const { area, refreshUser, showToast, setArea } = useApp();
  const [locating, setLocating] = useState(false);

  async function handleSelect(p: GeoPlace) {
    try {
      await userService.setLocation(p.lat, p.lng, p.area);
      await refreshUser();
      setArea(p.area);
      showToast(`Location set — ${p.area} ✓`);
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
          // The DB write is the source of truth for feeds (they read user.lat
          // from the profile). If it fails, say so — a fake "✓" here left users
          // stuck on the old location no matter how many times they re-tapped.
          await userService.setLocation(latitude, longitude, areaName ?? undefined);
          await refreshUser();
          if (areaName) setArea(areaName);
          showToast(`Location set — ${areaName ?? "current position"} ✓`);
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

  const presetLocations = config.presetLocations;

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

        {/* Popular areas — GPS is the primary path; this is the fallback when it fails */}
        <div className="col gap-10" style={{ overflowY: "auto", flexGrow: 1, maxHeight: 280 }}>
          <div className="tiny semi muted" style={{ letterSpacing: 0.5 }}>POPULAR AREAS</div>
          {presetLocations.map((p) => (
            <button
              key={p.area}
              onClick={() => handleSelect(p)}
              className="row gap-10"
              style={{
                width: "100%", padding: "12px 14px", border: "none", background: "var(--ink-50)",
                borderRadius: 14, textAlign: "left", cursor: "pointer"
              }}
            >
              <span style={{ fontSize: 18 }}>{p.emoji}</span>
              <div className="grow">
                <div className="semi small" style={{ color: "var(--ink-900)" }}>{p.area}</div>
                <div style={{ fontSize: 10.5, color: "var(--ink-500)", marginTop: 1 }}>{p.full}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
