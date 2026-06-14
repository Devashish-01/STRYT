import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AppBar, inr } from "@/components/common";
import { businessService } from "@/services";
import { useApp } from "@/store";
import { Zap, Check } from "lucide-react";
import ManageNav from "./ManageNav";

const boosts = [
  { type: "RADIUS", title: "Radius Boost", desc: "Reach 15 km instead of 5 km", price: 199, per: "per launch", emoji: "📡" },
  { type: "TOP_FEED", title: "Top of Feed", desc: "Pinned at top of your category", price: 99, per: "per week", emoji: "⬆️" },
  { type: "REBROADCAST", title: "Re-broadcast", desc: "Re-trigger your launch notification", price: 149, per: "one-time", emoji: "🔔" },
  { type: "FEATURED", title: "Featured on Home", desc: "Home-screen banner placement", price: 499, per: "per week", emoji: "⭐" },
  { type: "PROMO_OFFER", title: "Promoted Offer", desc: "Push a discount to nearby users", price: 99, per: "per offer", emoji: "🏷️" },
];

export default function Promote() {
  const { id = "b1" } = useParams();
  const { showToast } = useApp();
  const [active, setActive] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    businessService.activeBoosts(id).then((b) => { if (alive) setActive(b); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  async function buy(type: string) {
    setActive((a) => [...a, type]);
    try {
      await businessService.buyBoost(id, type);
      showToast("Boost active! (billed offline for now)");
    } catch {
      setActive((a) => a.filter((t) => t !== type));
      showToast("Couldn't activate boost. Try again.");
    }
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Promote" subtitle="Grow your reach" />
      <div className="screen-scroll page-pad col gap-12" style={{ paddingBottom: 20 }}>
        <div className="card row gap-10" style={{ padding: 12, background: "#fff7ed", border: "1px dashed #fdba74" }}>
          <Zap size={20} color="#f26a00" />
          <span className="tiny" style={{ color: "#c2410c", lineHeight: 1.4 }}>Boosts are billed offline for now. In-app payments arrive in V3 — your boost activates immediately.</span>
        </div>

        {boosts.map((b) => {
          const on = active.includes(b.type);
          return (
            <div key={b.type} className="card row gap-12" style={{ padding: 14, border: on ? "1.5px solid var(--green-500)" : "1px solid var(--line)" }}>
              <span style={{ fontSize: 26 }}>{b.emoji}</span>
              <div className="grow">
                <div className="semi small">{b.title}</div>
                <div className="tiny muted">{b.desc}</div>
                <div className="tiny semi" style={{ color: "var(--brand-700)", marginTop: 3 }}>{inr(b.price)} {b.per}</div>
              </div>
              {on ? (
                <span className="badge badge-green"><Check size={12} /> Active</span>
              ) : (
                <button className="btn btn-accent btn-sm" onClick={() => buy(b.type)}>Boost</button>
              )}
            </div>
          );
        })}
      </div>
      <ManageNav bizId={id} />
    </div>
  );
}
