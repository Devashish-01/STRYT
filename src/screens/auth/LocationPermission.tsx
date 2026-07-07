import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { MapPin, Navigation } from "@/components/Icons";
import { useApp } from "@/store";
import { userService } from "@/services";
import { reverseGeocode } from "@/lib/geocode";
import { nativeGeolocation } from "@/lib/nativeGeolocation";

export default function LocationPermission() {
  const nav = useNavigate();
  const { showToast, setArea, refreshUser } = useApp();
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);

  // Mark location prompt as seen so Protected doesn't re-redirect after "Skip".
  useEffect(() => {
    localStorage.setItem("locationPromptShown", "true");
  }, []);

  function allow() {
    setLocating(true);
    setFailed(false);
    nativeGeolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // Auto-name the area from the GPS fix (e.g. "Marathahalli"). If it can't
        // be named, still save the coordinates — feeds work off lat/lng, the
        // label is just cosmetic — rather than making the user type it.
        const areaName = await reverseGeocode(latitude, longitude);
        try {
          await userService.setLocation(latitude, longitude, areaName ?? undefined);
          await refreshUser();
        } catch { /* ignore */ }
        setLocating(false);
        setArea(areaName ?? "your area");
        showToast(areaName ? `Location set — ${areaName} ✓` : "Location set ✓");
        nav("/home");
      },
      () => {
        setLocating(false);
        setFailed(true);
        showToast("Couldn't get location — check permissions and try again");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div className="screen">
      <div className="screen-scroll page-pad col" style={{ alignItems: "center", textAlign: "center", paddingTop: 64 }}>
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "var(--brand-50)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid var(--brand-300)", animation: "pulse-ring 2s infinite" }} />
          <MapPin size={52} color="var(--brand-600)" />
        </div>

        <h1 className="h1" style={{ marginTop: 32 }}>Enable location</h1>
        <p className="muted" style={{ marginTop: 10, maxWidth: 300, lineHeight: 1.55 }}>
          STRYT is all about what's <span className="semi" style={{ color: "var(--ink-900)" }}>near you</span>. We use your location to show
          local businesses, providers and requests within your radius.
        </p>

        <div className="card" style={{ marginTop: 28, textAlign: "left", width: "100%" }}>
          <div className="row gap-10 small">
            <Navigation size={18} color="var(--green-500)" />
            <span>We only store your <span className="semi">last location</span> — never a trail.</span>
          </div>
        </div>
      </div>

      <div className="page-pad col gap-10">
        {failed && (
          <p className="small" style={{ color: "var(--red-600)", textAlign: "center", marginBottom: 2 }}>
            Couldn't get your location. Check that location access is allowed for STRYT, then try again.
          </p>
        )}
        <button
          className="btn btn-primary btn-block"
          disabled={locating}
          onClick={allow}
        >
          {locating ? "Getting location…" : failed ? "Try again" : "Allow location access"}
        </button>
        <button className="btn btn-ghost btn-block" onClick={() => nav("/home")}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
