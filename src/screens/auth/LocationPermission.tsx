import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { MapPin, Navigation } from "lucide-react";
import { useApp } from "@/store";
import { userService } from "@/services";
import { reverseGeocode, forwardGeocode } from "@/lib/geocode";

export default function LocationPermission() {
  const nav = useNavigate();
  const { showToast, setArea, refreshUser } = useApp();
  const [locating, setLocating] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualArea, setManualArea] = useState("");

  // Mark location prompt as seen so Protected doesn't re-redirect after "Skip".
  useEffect(() => {
    localStorage.setItem("locationPromptShown", "true");
  }, []);

  function allow() {
    setLocating(true);
    if (!navigator.geolocation) {
      void userService.setLocation(0, 0).catch(() => {});
      setArea("your area");
      showToast("Location set");
      nav("/home");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // Auto-name the area from the GPS fix (e.g. "Marathahalli") so the user
        // doesn't type it. Only fall back to manual entry when it can't be named.
        const areaName = await reverseGeocode(latitude, longitude);
        try {
          await userService.setLocation(latitude, longitude, areaName ?? undefined);
          await refreshUser();
        } catch { /* ignore */ }
        if (areaName) {
          setArea(areaName);
          showToast(`Location set — ${areaName} ✓`);
          nav("/home");
        } else {
          // Coordinates saved, but the area isn't on the map — let them name it.
          setLocating(false);
          showToast("Got your location — name your area");
          setManualMode(true);
        }
      },
      () => {
        setLocating(false);
        showToast("Couldn't get location. Enter it manually.");
        setManualMode(true);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  async function saveManual() {
    const a = manualArea.trim();
    if (!a) { nav("/home"); return; }
    let resolvedLat = 0;
    let resolvedLng = 0;
    try {
      const places = await forwardGeocode(a);
      if (places.length > 0) {
        resolvedLat = places[0].lat;
        resolvedLng = places[0].lng;
      }
    } catch { /* ignore */ }
    try {
      await userService.setLocation(resolvedLat, resolvedLng, a);
      await refreshUser();
    } catch { /* ignore */ }
    setArea(a);
    showToast(`Area set to ${a}`);
    nav("/home");
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

        <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 32 }}>Enable location</h1>
        <p className="muted" style={{ marginTop: 10, maxWidth: 300, lineHeight: 1.55 }}>
          STRYT is all about what's <span className="semi" style={{ color: "var(--ink-900)" }}>near you</span>. We use your location to show
          local businesses, providers and requests within your radius.
        </p>

        <div className="card" style={{ marginTop: 28, padding: 14, textAlign: "left", width: "100%" }}>
          <div className="row gap-10 small">
            <Navigation size={18} color="var(--green-500)" />
            <span>We only store your <span className="semi">last location</span> — never a trail.</span>
          </div>
        </div>
      </div>

      <div className="page-pad col gap-10">
        {manualMode ? (
          <>
            <div className="field">
              <label className="small semi">Your neighbourhood / area</label>
              <input
                className="input"
                placeholder="e.g. Koregaon Park, Pune"
                value={manualArea}
                onChange={(e) => setManualArea(e.target.value)}
                autoFocus
              />
            </div>
            <button
              className="btn btn-primary btn-block"
              disabled={!manualArea.trim()}
              onClick={() => void saveManual()}
            >
              Save & continue
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => nav("/home")}>
              Skip for now
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-primary btn-block"
              disabled={locating}
              onClick={allow}
            >
              {locating ? "Getting location…" : "Allow location access"}
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => setManualMode(true)}>
              Enter manually
            </button>
          </>
        )}
      </div>
    </div>
  );
}
