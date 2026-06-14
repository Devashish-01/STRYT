import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { Check, QrCode, Users } from "lucide-react";
import { walletService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";

const face = (n: number) => `https://i.pravatar.cc/150?img=${n}`;

export default function LoyaltySetup() {
  const { id = "" } = useParams();
  const { showToast } = useApp();

  const { data: existing, loading } = useQuery(() => walletService.getLoyaltyCard(id), [id]);
  const { data: holders = [] } = useQuery(() => walletService.getLoyaltyCardHolders(id), [id]);

  const [active, setActive] = useState(true);
  const [target, setTarget] = useState(10);
  const [reward, setReward] = useState("Free coffee");
  const [saving, setSaving] = useState(false);

  // Hydrate from DB once loaded
  useState(() => {
    if (existing) {
      setActive(existing.isActive);
      setTarget(existing.target);
      setReward(existing.reward);
    }
  });

  async function save() {
    setSaving(true);
    try {
      await walletService.saveLoyaltyCard(id, target, reward, active);
      showToast("Loyalty card saved ✅");
    } catch {
      showToast("Couldn't save — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <AppBar title="Loyalty program" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 30 }}>
        <button
          className="card row between"
          style={{ padding: 14, border: active ? "2px solid var(--brand-500)" : "1px solid var(--line)" }}
          onClick={() => setActive((v) => !v)}
        >
          <div>
            <div className="semi small">Loyalty card {active ? "active" : "off"}</div>
            <div className="tiny muted">Reward repeat customers</div>
          </div>
          <span style={{ width: 44, height: 26, borderRadius: 999, background: active ? "var(--brand-600)" : "var(--ink-200)", position: "relative" }}>
            <span style={{ position: "absolute", top: 3, left: active ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
          </span>
        </button>

        {active && (
          <>
            {/* Card preview */}
            <div className="card" style={{ padding: 16, background: "linear-gradient(135deg,#6b21cc,#4c1d95)", color: "#fff", border: "none" }}>
              <div className="tiny" style={{ opacity: 0.8 }}>LOYALTY CARD</div>
              <div className="bold" style={{ fontSize: 17, marginBottom: 12 }}>
                Buy {target}, get {reward.toLowerCase()}
              </div>
              <div className="row wrap gap-6">
                {Array.from({ length: target }).map((_, i) => (
                  <div key={i} style={{ width: 24, height: 24, borderRadius: "50%", background: i < 3 ? "#fff" : "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {i < 3 && <Check size={13} color="#6b21cc" />}
                  </div>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="row between">
                <span>Stamps needed</span>
                <span style={{ color: "var(--brand-700)" }}>{target}</span>
              </label>
              <input
                type="range" min={4} max={15} value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#6b21cc" }}
              />
            </div>

            <div className="field">
              <label>Reward</label>
              <input className="input" value={reward} onChange={(e) => setReward(e.target.value)} />
            </div>

            <button className="btn btn-primary btn-block" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save program"}
            </button>

            <button
              className="card row gap-12 center"
              style={{ padding: 14 }}
              onClick={() => showToast("Show QR to add a stamp")}
            >
              <QrCode size={20} color="#6b21cc" />
              <span className="semi small">Add stamp via customer QR</span>
            </button>

            {holders.length > 0 && (
              <div>
                <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}>
                  <Users size={14} /> Active cardholders
                </div>
                <div className="col gap-8">
                  {holders.map((h) => (
                    <div key={h.name} className="card row gap-12" style={{ padding: 12 }}>
                      <SafeImg src={h.avatar} variant="avatar" className="avatar" style={{ width: 38, height: 38 }} />
                      <span className="semi small grow">{h.name}</span>
                      <span className="badge badge-purple">{h.stamps}/{target}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
