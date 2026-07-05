import { useEffect, useState } from "react";
import { WifiOff } from "@/components/Icons";

/** Global connectivity pill — every data call fails silently-ish offline, so
 *  say it once, loudly, instead of per-screen "couldn't load" toasts. */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (!offline) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)",
        zIndex: 4000, background: "var(--ink-900)", color: "#fff",
        borderRadius: 999, padding: "7px 14px", display: "flex",
        alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600,
        boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
      }}
    >
      <WifiOff size={14} /> You're offline — changes won't save
    </div>
  );
}
