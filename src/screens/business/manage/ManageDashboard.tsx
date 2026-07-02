import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Eye, Phone, Navigation, Star, MessageSquare, HelpCircle,
  ChevronRight, TrendingUp, BadgeCheck, ArrowLeftRight, Share2, Zap,
} from "lucide-react";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Skeleton } from "@/components/states";
import { useApp } from "@/store";
import { evaluateProviderAvailability, calculateNextTurnoffTime } from "@/utils/availability";
import ManageNav from "./ManageNav";
import ShareCard from "@/components/ShareCard";

export default function ManageDashboard() {
  const { id = "b1" } = useParams();
  const nav = useNavigate();
  const { setContext, showToast } = useApp();
  const { data: b } = useQuery(() => businessService.get(id), [id]);
  const { data, loading } = useQuery(() => businessService.analytics(id), [id]);
  const [share, setShare] = useState(false);
  const [available, setAvailable] = useState(false);

  const base = `/business/${id}/manage`;

  // Seed the presence toggle from the live shop record.
  useEffect(() => { if (b) setAvailable(b.isAvailableNow ?? false); }, [b]);

  // "Open right now" is a presence flag, separate from bookable working-hour
  // slots (mirrors the provider dashboard toggle). Turning on outside working
  // hours sets an auto-clear expiry at the next closing time.
  const evalRes = evaluateProviderAvailability(b?.hours, available, b?.availableUntil);
  async function toggleAvail() {
    const prev = available;
    const next = !available;
    setAvailable(next);
    try {
      if (next && !evalRes.isOpenNow) {
        const turnoff = calculateNextTurnoffTime(b?.hours);
        await businessService.setAvailability(id, true, turnoff.toISOString());
        showToast(`Open now — clears at ${turnoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ⚡`);
      } else {
        await businessService.setAvailability(id, next, null);
        showToast(next ? "Shop marked open right now ⚡" : "Shop marked closed");
      }
    } catch (e: any) {
      setAvailable(prev);
      showToast(e?.message ?? "Couldn't update availability");
    }
  }

  return (
    <div className="screen with-nav">
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#f26a00,#c2410c)", color: "#fff", padding: "16px" }}>
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
            <button className="tiny semi" style={{ opacity: 0.9 }} onClick={() => nav(`/business/${id}`)}>View public page →</button>
          </div>
        </div>
        <div className="row gap-12" style={{ marginTop: 12 }}>
          <img src={b?.coverImage} className="thumb" style={{ width: 52, height: 52, borderRadius: 12, border: "2px solid rgba(255,255,255,0.4)" }} />
          <div className="grow">
            <div className="row gap-6"><span className="bold" style={{ fontSize: 18 }}>{b?.name}</span><BadgeCheck size={16} /></div>
            <span className="badge" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>
              {b?.status === "ACTIVE" ? "● Live" : "● Pending"}
            </span>
          </div>
        </div>
      </div>

      <div className="screen-scroll">
        {/* Open-right-now presence toggle (mirrors the provider dashboard) */}
        <div className="page-pad" style={{ paddingBottom: 0 }}>
          <button
            className="card row gap-12"
            style={{ padding: 14, width: "100%", textAlign: "left", border: available ? "2px solid var(--green-500)" : "1px solid var(--line)" }}
            onClick={toggleAvail}
          >
            <div style={{ width: 44, height: 44, borderRadius: 12, background: available ? "#e8f7ee" : "var(--ink-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={22} color={available ? "#16a34a" : "var(--ink-400)"} />
            </div>
            <div className="grow">
              <div className="semi small">{available ? "Shop is open right now" : "Mark shop open now"}</div>
              <div className="tiny muted">{available ? "Customers see you as open" : "Turn on when you're open for walk-ins"}</div>
            </div>
            <span style={{ width: 44, height: 26, borderRadius: 999, background: available ? "var(--green-500)" : "var(--ink-200)", position: "relative", flexShrink: 0 }}>
              <span style={{ position: "absolute", top: 3, left: available ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </span>
          </button>
        </div>

        {/* KPIs */}
        <div className="page-pad">
          <div className="small semi muted" style={{ marginBottom: 8 }}>This week</div>
          {loading ? (
            <div className="row gap-10">{[1, 2, 3].map((i) => <div key={i} className="card grow" style={{ padding: 12 }}><Skeleton h={60} /></div>)}</div>
          ) : (
            <>
              <div className="row gap-10">
                <Kpi icon={Eye} color="#cc4415" value={data!.views.toLocaleString()} label="Views" trend="" />
                <Kpi icon={Phone} color="#16a34a" value={data!.calls} label="Calls" trend="" />
                <Kpi icon={Navigation} color="#f26a00" value={data!.directions} label="Directions" trend="" />
              </div>
              <div className="row gap-10" style={{ marginTop: 10 }}>
                <Kpi icon={Eye} color="#0ea5e9" value={data!.catalogViews.toLocaleString()} label="Menu views" trend="" />
                <Kpi icon={Star} color="#f59e0b" value={data!.reviews} label="New reviews" trend="" />
                <Kpi icon={HelpCircle} color="#6366f1" value={data!.questions} label="Questions" trend="" />
              </div>
            </>
          )}
        </div>

        {/* Chart */}
        {!loading && (
          <div className="page-pad" style={{ paddingTop: 0 }}>
            <div className="card" style={{ padding: 14 }}>
              <div className="row between" style={{ marginBottom: 12 }}>
                <span className="semi small row gap-6"><TrendingUp size={15} color="#f26a00" /> Lead trend</span>
                <span className="tiny muted">7 days</span>
              </div>
              <div className="row gap-6" style={{ alignItems: "flex-end", height: 90 }}>
                {data!.viewsSeries.map((h: number, i: number) => (
                  <div key={i} className="grow col" style={{ alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", height: `${h}%`, background: i === 6 ? "#f26a00" : "#fed7aa", borderRadius: 6 }} />
                    <span className="tiny muted" style={{ fontSize: 9 }}>{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Action needed */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Action needed</div>
          <div className="card" style={{ overflow: "hidden" }}>
            <ActionRow icon={<HelpCircle size={18} color="#6366f1" />} label="Answer customer questions" onClick={() => nav(`${base}/qna`)} />
            <ActionRow icon={<MessageSquare size={18} color="#f59e0b" />} label="Reply to reviews" onClick={() => nav(`${base}/reviews`)} last />
          </div>
        </div>

        {/* Manage sections */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Manage</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Tile emoji="📝" label="Edit profile" onClick={() => nav(`${base}/profile`)} />
            <Tile emoji="🕒" label="Hours" onClick={() => nav(`${base}/hours`)} />
            <Tile emoji="📅" label="Appointments" onClick={() => nav(`${base}/appointments`)} />
            <Tile emoji="📦" label="Packages" onClick={() => nav(`${base}/packages`)} />
            <Tile emoji="📋" label="Catalog" onClick={() => nav(`${base}/catalog`)} />
            <Tile emoji="🏷️" label="Offers" onClick={() => nav(`${base}/offers`)} />
            <Tile emoji="📣" label="Post to community" onClick={() => nav("/community/new", { state: { businessId: id, businessName: b?.name, businessAvatar: b?.coverImage } })} />
            <Tile emoji="👥" label="Live queue" onClick={() => nav(`${base}/queue`)} />
            <Tile emoji="💬" label="Q&A" onClick={() => nav(`${base}/qna`)} />
            <Tile emoji="⭐" label="Reviews" onClick={() => nav(`${base}/reviews`)} />
            <Tile emoji="🙋" label="Find requests" onClick={() => nav(`${base}/requests`)} />
            <Tile emoji="🛡️" label="Verification" onClick={() => nav(`${base}/verify`)} />
            <Tile emoji="📱" label="Share QR" onClick={() => setShare(true)} />
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            Photos, Post a story & Loyalty are temporarily hidden.
          </p>
        </div>

        <div style={{ height: 20 }} />
      </div>

      <ManageNav bizId={id} />
      {share && (
        <ShareCard
          title={b?.name || "Business Shop"}
          subtitle={`${b?.subCategory || "Local Business"} • ${b?.city || "STRYT"}`}
          image={b?.coverImage || ""}
          meta={`⭐ ${b?.ratingAvg || 0} (${b?.ratingCount || 0})`}
          url={window.location.origin + "/business/" + id}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}

function Kpi({ icon: Icon, color, value, label, trend }: any) {
  return (
    <div className="card grow col" style={{ padding: 12, gap: 5 }}>
      <Icon size={18} color={color} />
      <span className="bold" style={{ fontSize: 19 }}>{value}</span>
      <div className="row between">
        <span className="tiny muted">{label}</span>
        <span className="tiny semi" style={{ color: "#16a34a" }}>{trend}</span>
      </div>
    </div>
  );
}

function ActionRow({ icon, label, onClick, last }: { icon: React.ReactNode; label: string; onClick: () => void; last?: boolean }) {
  return (
    <button className="row gap-12" style={{ width: "100%", padding: "13px 14px", borderBottom: last ? "none" : "1px solid var(--line)" }} onClick={onClick}>
      {icon}
      <span className="semi small grow" style={{ textAlign: "left" }}>{label}</span>
      <ChevronRight size={18} color="var(--ink-300)" />
    </button>
  );
}

function Tile({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button className="card col center" style={{ padding: 16, gap: 8 }} onClick={onClick}>
      <span style={{ fontSize: 26 }}>{emoji}</span>
      <span className="tiny semi">{label}</span>
    </button>
  );
}
