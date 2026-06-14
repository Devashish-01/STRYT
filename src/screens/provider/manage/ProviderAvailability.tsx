import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Zap, Clock } from "lucide-react";
import { providerService } from "@/services";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import ProviderManageNav from "./ProviderManageNav";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ProviderAvailability() {
  const { id = "p1" } = useParams();
  const { showToast } = useApp();
  const { data: provider } = useQuery(() => providerService.get(id), [id]);
  const [now, setNow] = useState(false);
  const [hours, setHours] = useState(3);
  const [free, setFree] = useState<Record<string, boolean>>(
    Object.fromEntries(days.map((d, i) => [d, i < 6]))
  );

  useEffect(() => {
    if (provider) setNow(provider.isAvailableNow ?? false);
  }, [provider]);

  async function toggleNow() {
    const prev = now;
    const next = !now;
    setNow(next);
    try {
      await providerService.setAvailability(id, next, hours);
      showToast(next ? `Available for ${hours}h ⚡` : "Marked unavailable");
    } catch (e: any) {
      setNow(prev);
      showToast(e?.message ?? "Couldn't update availability");
    }
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Availability" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 20 }}>
        <div className="card" style={{ padding: 16, background: now ? "#e8f7ee" : "var(--ink-50)", border: "none" }}>
          <div className="row between">
            <div className="row gap-10"><Zap size={22} color={now ? "#16a34a" : "var(--ink-400)"} /><div><div className="semi small">Available right now</div><div className="tiny muted">{now ? `Live for ${hours}h` : "Toggle to surface to nearby users"}</div></div></div>
            <button onClick={toggleNow} style={{ width: 48, height: 28, borderRadius: 999, background: now ? "var(--green-500)" : "var(--ink-200)", position: "relative" }}>
              <span style={{ position: "absolute", top: 3, left: now ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </button>
          </div>
          {now && (
            <div style={{ marginTop: 12 }}>
              <div className="row between tiny semi"><span className="row gap-4"><Clock size={13} /> Available for</span><span style={{ color: "#16a34a" }}>{hours} hours</span></div>
              <input type="range" min={1} max={8} value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ width: "100%", accentColor: "#16a34a", marginTop: 6 }} />
            </div>
          )}
        </div>

        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Weekly availability</div>
          <div className="row gap-8" style={{ justifyContent: "space-between" }}>
            {days.map((d) => (
              <button key={d} className="col center" style={{ gap: 6 }} onClick={() => setFree((f) => ({ ...f, [d]: !f[d] }))}>
                <span className="tiny semi">{d}</span>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: free[d] ? "#16a34a" : "var(--ink-100)", color: free[d] ? "#fff" : "var(--ink-400)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                  {free[d] ? "✓" : "–"}
                </div>
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 10 }}>Tap a day to toggle whether you take jobs.</p>
        </div>

        <button className="btn btn-green btn-block" onClick={() => showToast("Availability saved")}>Save</button>
      </div>
      <ProviderManageNav pid={id} />
    </div>
  );
}
