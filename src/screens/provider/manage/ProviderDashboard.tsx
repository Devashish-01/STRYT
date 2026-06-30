import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Eye, Briefcase, CheckCircle2, Wallet, Star, TrendingUp, Zap, ArrowLeftRight, Share2 } from "lucide-react";
import { providerService } from "@/services";
import { SafeImg } from "@/components/common";
import { useQuery } from "@/hooks/useApi";
import { Skeleton } from "@/components/states";
import { inr } from "@/components/common";
import { useApp } from "@/store";
import ProviderManageNav from "./ProviderManageNav";
import ShareCard from "@/components/ShareCard";

export default function ProviderDashboard() {
  const { id = "p1" } = useParams();
  const nav = useNavigate();
  const { data: p } = useQuery(() => providerService.get(id), [id]);
  const { setContext, showToast } = useApp();
  const { data, loading } = useQuery(() => providerService.analytics(id), [id]);
  const [available, setAvailable] = useState(false);
  const [share, setShare] = useState(false);
  const base = `/provider/${id}/manage`;

  useEffect(() => {
    if (p) setAvailable(p.isAvailableNow ?? false);
  }, [p]);

  async function toggleAvail() {
    const prev = available;
    const next = !available;
    setAvailable(next);
    try {
      await providerService.setAvailability(id, next, 3);
      showToast(next ? "You're available for 3 hours ⚡" : "Marked unavailable");
    } catch (e: any) {
      setAvailable(prev);
      showToast(e?.message ?? "Couldn't update availability");
    }
  }

  return (
    <div className="screen with-nav">
      <div style={{ background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff", padding: "16px" }}>
        <div className="row between">
          <button className="row gap-4 tiny semi" style={{ opacity: 0.9 }} onClick={() => { setContext({ type: "customer", id: null, name: "Personal" }); nav("/home"); }}>
            <ArrowLeftRight size={13} /> Switch to customer
          </button>
          <div className="row gap-8" style={{ alignItems: "center" }}>
            <button 
              className="icon-btn-sm" 
              style={{ 
                background: "rgba(255,255,255,0.18)", 
                color: "#fff", 
                border: "none", 
                borderRadius: "50%", 
                width: 28, 
                height: 28, 
                display: "inline-flex", 
                alignItems: "center", 
                justifyContent: "center", 
                cursor: "pointer" 
              }} 
              onClick={() => setShare(true)} 
              aria-label="Share QR Code"
            >
              <Share2 size={14} />
            </button>
            <button className="tiny semi" style={{ opacity: 0.9 }} onClick={() => nav(`/provider/${id}`)}>View public →</button>
          </div>
        </div>
        <div className="row gap-12" style={{ marginTop: 12 }}>
          <SafeImg src={p?.avatar} alt={p?.displayName} variant="avatar" className="avatar" style={{ width: 52, height: 52, border: "2px solid rgba(255,255,255,0.4)" }} />
          <div className="grow"><div className="bold" style={{ fontSize: 18 }}>{p?.displayName}</div><div className="small" style={{ opacity: 0.9 }}>{p?.categoryName}</div></div>
        </div>
      </div>

      <div className="screen-scroll">
        {/* Available now toggle */}
        <div className="page-pad">
          <button className="card row gap-12" style={{ padding: 14, width: "100%", textAlign: "left", border: available ? "2px solid var(--green-500)" : "1px solid var(--line)" }} onClick={toggleAvail}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: available ? "#e8f7ee" : "var(--ink-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={22} color={available ? "#16a34a" : "var(--ink-400)"} />
            </div>
            <div className="grow">
              <div className="semi small">{available ? "You're available now" : "Go available now"}</div>
              <div className="tiny muted">{available ? "Showing in the 'Free right now' rail" : "Surface to nearby customers for 3 hours"}</div>
            </div>
            <span style={{ width: 44, height: 26, borderRadius: 999, background: available ? "var(--green-500)" : "var(--ink-200)", position: "relative", flexShrink: 0 }}>
              <span style={{ position: "absolute", top: 3, left: available ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </span>
          </button>
        </div>

        {/* KPIs */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          {loading ? (
            <div className="row gap-10">{[1, 2, 3].map((i) => <div key={i} className="card grow" style={{ padding: 12 }}><Skeleton h={56} /></div>)}</div>
          ) : (
            <>
              <div className="row gap-10">
                <Kpi icon={Eye} color="#cc4415" value={(data?.views ?? 0).toLocaleString()} label="Profile views" />
                <Kpi icon={Briefcase} color="#0ea5e9" value={data?.leads ?? 0} label="Leads" />
                <Kpi icon={CheckCircle2} color="#16a34a" value={data?.accepted ?? 0} label="Won" />
              </div>
              <div className="card row" style={{ padding: 14, marginTop: 10 }}>
                <div className="grow col center" style={{ gap: 2 }}><Wallet size={18} color="#f26a00" /><span className="bold">{inr(data?.earnings ?? 0)}</span><span className="tiny muted">Earned (offline)</span></div>
                <div style={{ width: 1, background: "var(--line)" }} />
                <div className="grow col center" style={{ gap: 2 }}><Briefcase size={18} color="#16a34a" /><span className="bold">{data?.jobsDone ?? 0}</span><span className="tiny muted">Jobs done</span></div>
                <div style={{ width: 1, background: "var(--line)" }} />
                <div className="grow col center" style={{ gap: 2 }}><Star size={18} color="#f59e0b" /><span className="bold">{p?.ratingAvg}</span><span className="tiny muted">Rating</span></div>
              </div>
            </>
          )}
        </div>

        {/* Chart */}
        {!loading && (
          <div className="page-pad" style={{ paddingTop: 0 }}>
            <div className="card" style={{ padding: 14 }}>
              <div className="row between" style={{ marginBottom: 12 }}><span className="semi small row gap-6"><TrendingUp size={15} color="#16a34a" /> Leads trend</span><span className="tiny muted">7 days</span></div>
              <div className="row gap-6" style={{ alignItems: "flex-end", height: 80 }}>
                {(data?.leadsSeries ?? [0,0,0,0,0,0,0]).map((h: number, i: number) => (
                  <div key={i} className="grow col" style={{ alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", height: `${(h / 12) * 100}%`, background: i === 6 ? "#16a34a" : "#bbf7d0", borderRadius: 6 }} />
                    <span className="tiny muted" style={{ fontSize: 9 }}>{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Manage tiles */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Manage</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Tile emoji="📝" label="Edit profile" onClick={() => nav(`${base}/profile`)} />
            <Tile emoji="🗓️" label="Availability" onClick={() => nav(`${base}/availability`)} />
            <Tile emoji="📦" label="Packages" onClick={() => nav(`${base}/packages`)} />
            <Tile emoji="🖼️" label="Portfolio" onClick={() => nav(`${base}/portfolio`)} />
            <Tile emoji="🙋" label="Leads & requests" onClick={() => nav(`${base}/leads`)} />
            <Tile emoji="🛡️" label="Verification" onClick={() => nav(`${base}/verify`)} />
            <Tile emoji="📱" label="Share QR" onClick={() => setShare(true)} />
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
      <ProviderManageNav pid={id} />
      {share && (
        <ShareCard
          title={p?.displayName || "Service Provider"}
          subtitle={`${p?.categoryName || "Provider"} • ${p?.subCategory || "Professional"}`}
          image={p?.avatar || ""}
          meta={`⭐ ${p?.ratingAvg || 0} (${p?.ratingCount || 0})`}
          url={window.location.origin + "/provider/" + id}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}

function Kpi({ icon: Icon, color, value, label }: any) {
  return (
    <div className="card grow col" style={{ padding: 12, gap: 5 }}>
      <Icon size={18} color={color} />
      <span className="bold" style={{ fontSize: 19 }}>{value}</span>
      <span className="tiny muted">{label}</span>
    </div>
  );
}
function Tile({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button className="card col center" style={{ padding: 16, gap: 8 }} onClick={onClick}>
      <span style={{ fontSize: 26 }}>{emoji}</span><span className="tiny semi">{label}</span>
    </button>
  );
}
