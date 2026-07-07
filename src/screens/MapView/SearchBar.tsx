import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search } from "@/components/Icons";
import { forwardGeocode, type GeoPlace } from "@/lib/geocode";
import { userService } from "@/services";
import { useApp } from "@/store";

export function SearchBar() {
  const nav = useNavigate();
  const { refreshUser, showToast } = useApp();
  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);

  async function searchPlaces(q: string) {
    setLocQuery(q);
    if (q.trim().length < 2) { setLocResults([]); return; }
    setSearching(true);
    try {
      setLocResults(await forwardGeocode(q));
    } finally {
      setSearching(false);
    }
  }

  async function pickPlace(p: GeoPlace) {
    try {
      await userService.setLocation(p.lat, p.lng, p.area);
      await refreshUser();
      setLocQuery("");
      setLocResults([]);
      showToast(`Location set — ${p.area}`);
    } catch {
      showToast("Couldn't set that location");
    }
  }

  return (
    <div style={{
      position: "absolute", top: "calc(12px + env(safe-area-inset-top, 0px))", left: 16, right: 16, zIndex: 1000,
      display: "flex", gap: 10, alignItems: "center"
    }}>
      <button
        className="icon-btn"
        style={{ background: "#fff", boxShadow: "var(--shadow)", flexShrink: 0 }}
        onClick={() => nav(-1)}
      >
        <ArrowLeft size={20} />
      </button>
      <div style={{ position: "relative", flex: 1 }}>
        <Search size={16} color="var(--ink-400)" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
        <input
          type="text"
          className="input"
          value={locQuery}
          placeholder="Search location remotely..."
          onChange={(e) => searchPlaces(e.target.value)}
          style={{
            width: "100%",
            background: "#fff",
            boxShadow: "var(--shadow)",
            border: "1.5px solid var(--ink-200)",
            borderRadius: 30,
            padding: "10px 18px",
            paddingLeft: "42px",
            paddingRight: locQuery ? "35px" : "18px",
            fontSize: 14,
            fontWeight: 500,
            outline: "none"
          }}
        />
        {locQuery && (
          <button
            onClick={() => { setLocQuery(""); setLocResults([]); }}
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              border: "none", background: "transparent", color: "var(--ink-400)", cursor: "pointer",
              fontSize: 18, fontWeight: 700
            }}
          >
            &times;
          </button>
        )}

        {locResults.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8,
            background: "#fff", borderRadius: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            border: "1px solid var(--ink-200)", overflow: "hidden", zIndex: 1010
          }}>
            {locResults.map((r, idx) => (
              <button
                key={idx}
                onClick={() => pickPlace(r)}
                style={{
                  width: "100%", padding: "12px 16px", border: "none", background: "none",
                  textAlign: "left", fontSize: 13, color: "var(--ink-800)", borderBottom: idx < locResults.length - 1 ? "1px solid var(--ink-100)" : "none",
                  cursor: "pointer", display: "block"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--ink-50)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <div style={{ fontWeight: 600, color: "var(--ink-900)" }}>{r.area}</div>
                <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.full}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
