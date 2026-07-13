import { useLiveShare } from "./useLiveShare";
import { MapPin } from "@/components/Icons";

/** Persistent bar shown app-wide while the user is sharing their live location.
 *  Mounted once in the app shell — renders nothing when no share is active. */
export default function LiveShareBanner() {
  const { activeShareId, busy, stop } = useLiveShare();
  if (!activeShareId) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)",
        zIndex: 4000, background: "var(--accent-500)", color: "#fff",
        borderRadius: 999, padding: "7px 8px 7px 14px", display: "flex",
        alignItems: "center", gap: 10, fontSize: 12.5, fontWeight: 700,
        boxShadow: "0 4px 14px rgba(0,0,0,0.25)", maxWidth: "92vw",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", background: "#fff",
          boxShadow: "0 0 0 0 rgba(255,255,255,0.7)", animation: "livePulseRing 1.6s ease-out infinite",
        }} />
        <MapPin size={14} /> Sharing live location
      </span>
      <button
        onClick={() => void stop()}
        disabled={busy}
        style={{
          background: "rgba(0,0,0,0.22)", color: "#fff", border: "none",
          borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 800,
          cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "…" : "Stop"}
      </button>
    </div>
  );
}
