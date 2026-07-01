import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Eye, Phone, Navigation, Star, MessageSquare, HelpCircle,
  ChevronRight, TrendingUp, BadgeCheck, ArrowLeftRight, Share2,
} from "lucide-react";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Skeleton } from "@/components/states";
import { useApp } from "@/store";
import ManageNav from "./ManageNav";
import ShareCard from "@/components/ShareCard";

export default function ManageDashboard() {
  const { id = "b1" } = useParams();
  const nav = useNavigate();
  const { setContext } = useApp();
  const { data: b } = useQuery(() => businessService.get(id), [id]);
  const { data, loading } = useQuery(() => businessService.analytics(id), [id]);
  const [share, setShare] = useState(false);

  const base = `/business/${id}/manage`;

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
            <Tile emoji="🍽️" label="Catalog" onClick={() => nav(`${base}/catalog`)} />
            <Tile emoji="📸" label="Photos" onClick={() => nav(`${base}/photos`)} />
            <Tile emoji="🏷️" label="Offers" onClick={() => nav(`${base}/offers`)} />
            <Tile emoji="✨" label="Post a story" onClick={() => nav(`${base}/story`)} />
            <Tile emoji="👥" label="Live queue" onClick={() => nav(`${base}/queue`)} />
            <Tile emoji="🎟️" label="Loyalty" onClick={() => nav(`${base}/loyalty`)} />
            <Tile emoji="💬" label="Q&A" onClick={() => nav(`${base}/qna`)} />
            <Tile emoji="⭐" label="Reviews" onClick={() => nav(`${base}/reviews`)} />
            <Tile emoji="🙋" label="Find requests" onClick={() => nav(`${base}/requests`)} />
            <Tile emoji="🛡️" label="Verification" onClick={() => nav(`${base}/verify`)} />
            <Tile emoji="📱" label="Share QR" onClick={() => setShare(true)} />
          </div>
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
