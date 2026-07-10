import { useState, useEffect, type CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Eye, Briefcase, CheckCircle2, Wallet, Star, Zap,
  Share2, Bell, Calendar, FileText, Image, User, QrCode, Megaphone, Globe, BadgeCheck, Camera, MessageSquareText
} from "@/components/Icons";
import { providerService, communityService, appointmentService, notificationService } from "@/services";
import { chatService } from "@/services/engagement/chatService";
import { SafeImg, inr, AppBar } from "@/components/common";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import { DEFAULT_ONBOARD_WORKING_HOURS } from "@/utils/availability";
import ProviderManageNav from "./ProviderManageNav";
import ShareCard from "@/components/ShareCard";
import RoleSwitcher from "@/components/RoleSwitcher";
import BrandHome from "@/components/BrandHome";
import { AccountStatusBanner } from "@/components/AccountStatusBanner";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import AmbientSky from "@/features/ambient/AmbientSky";

export default function ProviderDashboard() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: p } = useQuery(() => providerService.get(id), [id]);
  const { showToast } = useApp();
  const ambient = useAmbientTheme();
  const { data, loading } = useQueryWithRealtime(
    () => providerService.analytics(id),
    "leads",
    [id],
    `provider_id=eq.${id}`
  );
  const { data: provPosts } = useQuery(() => communityService.byAuthorRef("provider", id), [id]);
  const { data: appts } = useQueryWithRealtime(() => appointmentService.listForTarget(id), "appointments", [id], `target_id=eq.${id}`);
  const { data: notifUnread } = useQueryWithRealtime(() => notificationService.getUnreadCount({ scope: "PROVIDER", id }), "notifications", [id]);
  const { data: chatUnread } = useQueryWithRealtime(() => chatService.totalUnread({ scope: "PROVIDER", id }), "conversations", [id]);

  // Today's live schedule — the first thing a provider opens the app to see.
  const todayAppts = (appts ?? [])
    .filter((a) => {
      if (a.status !== "PENDING" && a.status !== "ACCEPTED") return false;
      const d = new Date(a.scheduledForISO);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    })
    .sort((a, b) => new Date(a.scheduledForISO).getTime() - new Date(b.scheduledForISO).getTime());

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Dashboard" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }
  const [available, setAvailable] = useState(false);
  const [share, setShare] = useState(false);
  const base = `/provider/${id}/manage`;

  // Guided setup checklist — shown until every step is done.
  const checklistSteps = [
    { label: "Add a service to your catalog", done: (p?.catalog?.length ?? 0) > 0, onClick: () => nav(`${base}/catalog`) },
    { label: "Set your availability", done: !!p?.availabilityNote && p.availabilityNote !== DEFAULT_ONBOARD_WORKING_HOURS, onClick: () => nav(`${base}/availability`) },
    { label: "Upload verification", done: !!p?.verificationStatus, onClick: () => nav(`${base}/verify`) },
    { label: "Post your first community update", done: (provPosts?.length ?? 0) > 0, onClick: () => nav("/community/new", { state: { providerId: id, providerName: p?.displayName, providerAvatar: p?.avatar } }) },
  ];
  const checklistDone = checklistSteps.filter((s) => s.done).length;
  const showChecklist = !!p && checklistDone < checklistSteps.length;

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
      {/* ── Branded Premium Header — Living Street Light ── */}
      <div style={{
        background: "linear-gradient(135deg, var(--green-500), var(--green-700))",
        color: "#fff",
        padding: "calc(20px + var(--safe-area-top)) 16px 24px",
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        boxShadow: "0 8px 30px rgba(22, 163, 74, 0.15)",
        position: "relative",
        overflow: "hidden",
      }}>
        <AmbientSky dayPart={ambient.dayPartKey} effect={ambient.seasonEffect} glow={ambient.lampGlow} />
        <div style={{ position: "relative", zIndex: 1 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <BrandHome color="#fff" glow={ambient.lampGlow} />
        </div>
        {/* Top navigation row */}
        <div className="row between">
          <RoleSwitcher theme="dark-pill" />
          
          <div className="row gap-8" style={{ alignItems: "center" }}>
            {/* Notifications */}
            <button
              className="icon-btn-sm"
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}
              onClick={() => nav(`/notifications?scope=PROVIDER&id=${id}`)}
              aria-label="Notifications"
            >
              <Bell size={15} />
              {(notifUnread ?? 0) > 0 && (
                <span style={{ position: "absolute", top: 3, right: 3, width: 8, height: 8, background: "var(--red-500)", borderRadius: "50%", border: "1.5px solid rgba(0,0,0,0.2)" }} />
              )}
            </button>
            {/* Messages (provider inbox) */}
            <button
              className="icon-btn-sm"
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}
              onClick={() => nav(`/chats?scope=PROVIDER&id=${id}`)}
              aria-label="Messages"
            >
              <MessageSquareText size={15} />
              {(chatUnread ?? 0) > 0 && (
                <span style={{ position: "absolute", top: 3, right: 3, width: 8, height: 8, background: "var(--red-500)", borderRadius: "50%", border: "1.5px solid rgba(0,0,0,0.2)" }} />
              )}
            </button>
            <button 
              className="icon-btn-sm" 
              style={{ 
                background: "rgba(255, 255, 255, 0.15)", 
                color: "#fff", 
                border: "none", 
                borderRadius: "50%", 
                width: 32, 
                height: 32, 
                display: "inline-flex", 
                alignItems: "center", 
                justifyContent: "center", 
                cursor: "pointer" 
              }} 
              onClick={() => setShare(true)} 
              aria-label="Share QR Code"
            >
              <Share2 size={15} />
            </button>
            <button
              className="tiny semi"
              style={{
                padding: "6px 12px",
                background: "rgba(255, 255, 255, 0.15)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: 100,
                color: "#fff"
              }}
              onClick={() => nav(`/provider/${id}`)}
            >
              View Public →
            </button>
          </div>
        </div>

        {/* Profile info block */}
        <div className="row gap-12" style={{ marginTop: 20, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <SafeImg
              src={p?.avatar}
              alt={p?.displayName}
              variant="avatar"
              className="avatar"
              style={{
                width: 58,
                height: 58,
                borderRadius: "50%",
                border: available ? "3px solid var(--green-400)" : "2px solid rgba(255,255,255,0.4)",
                objectFit: "cover"
              }}
            />
            {available && (
              <span style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "var(--green-500)",
                border: "2.5px solid var(--green-700)"
              }}>
                <span className="fade-up" style={{
                  position: "absolute",
                  inset: -4,
                  borderRadius: "50%",
                  border: "1.5px solid var(--green-500)",
                  animation: "pulse-ring 1.5s infinite ease-in-out"
                }} />
              </span>
            )}
          </div>
          <div className="grow">
            <div className="row gap-6" style={{ alignItems: "center" }}>
              <span className="bold h1" style={{ color: "#fff" }}>{p?.displayName}</span>
              <BadgeCheck size={18} color="var(--accent-400)" weight="fill" />
            </div>
            <div className="small" style={{ color: "#fff", opacity: 0.9, marginTop: 2 }}>{p?.categoryName}</div>
          </div>
        </div>
        </div>
      </div>

      <div className="screen-scroll">
        <div style={{ paddingTop: 12 }}>
          <AccountStatusBanner entityType="PROVIDER" entityId={id} status={p?.status} />
        </div>
        {/* ── Guided setup checklist — new sellers land on a full dashboard
            with no ordered path otherwise. Disappears once all 4 steps are done. ── */}
        {showChecklist && (
          <div className="page-pad">
            <div className="card" style={{ padding: 16 }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="semi small">Finish setting up your profile</span>
                <span className="tiny semi muted">{checklistDone}/{checklistSteps.length}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--ink-100)", overflow: "hidden", marginBottom: 12 }}>
                <div style={{ height: "100%", width: `${(checklistDone / checklistSteps.length) * 100}%`, background: "var(--green-500)", transition: "width 0.3s" }} />
              </div>
              <div className="col gap-8">
                {checklistSteps.map((s) => (
                  <button key={s.label} className="row gap-10 align-center" style={{ width: "100%", textAlign: "left" }} onClick={s.onClick} disabled={s.done}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: s.done ? "var(--green-500)" : "var(--ink-100)",
                      color: s.done ? "#fff" : "var(--ink-400)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                    }}>
                      {s.done ? "✓" : ""}
                    </span>
                    <span className={`small ${s.done ? "muted" : "semi"}`} style={{ textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Active Availability Zap Card ── */}
        <div className="page-pad">
          <button
            className="card row gap-12"
            style={{
              width: "100%",
              textAlign: "left",
              border: available ? "2px solid var(--green-500)" : "1px solid var(--line)",
              boxShadow: available ? "0 4px 16px rgba(22, 163, 74, 0.08)" : "var(--shadow-sm)"
            }}
            onClick={toggleAvail}
          >
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: available ? "var(--green-100)" : "var(--ink-50)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
              <Zap size={22} color={available ? "var(--green-500)" : "var(--ink-400)"} weight={available ? "fill" : "regular"} />
            </div>
            <div className="grow">
              <div className="semi small">{available ? "You're available now" : "Go available now"}</div>
              <div className="tiny muted">{available ? "Showing in the 'Free right now' rail" : "Surface to nearby customers for 3 hours"}</div>
            </div>
            <span style={{
              width: 44,
              height: 26,
              borderRadius: 999,
              background: available ? "var(--green-500)" : "var(--ink-200)",
              position: "relative",
              flexShrink: 0,
              transition: "background-color 0.2s"
            }}>
              <span style={{
                position: "absolute",
                top: 3,
                left: available ? 21 : 3,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#fff",
                transition: "left .2s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.15)"
              }} />
            </span>
          </button>
        </div>

        {/* ── Today's appointments — horizontal rail (the day at a glance) ── */}
        {todayAppts.length > 0 && (
          <div style={{ paddingBottom: 4 }}>
            <div className="row between page-pad" style={{ paddingBottom: 0 }}>
              <span className="semi small">Today's appointments</span>
              <button className="see-all" onClick={() => nav(`${base}/leads`)}>View all</button>
            </div>
            <div className="hscroll today-rail" style={{ paddingTop: 10 }}>
              {todayAppts.map((a, idx) => (
                <button
                  key={a.id}
                  className="today-card fade-up"
                  style={{ "--today-accent": "var(--green-600)", animationDelay: `${idx * 35}ms`, cursor: "pointer" } as CSSProperties}
                  onClick={() => nav(`${base}/leads`)}
                >
                  <div className="today-card-head">
                    <span className="today-card-icon">📅</span>
                    <span className="today-card-kicker grow">{a.status === "PENDING" ? "Requested" : "Confirmed"}</span>
                  </div>
                  <div>
                    <div className="today-card-title">{a.customerName || "Customer"}</div>
                    <div className="today-card-stat" style={{ marginTop: 6 }}>{a.timeLabel}</div>
                    {a.packageName && <div className="today-card-sub" style={{ marginTop: 2 }}>{a.packageName}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Analytics dashboard ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          {loading ? (
            <div className="col gap-10">
              <div className="row gap-10">
                {[1, 2, 3].map((i) => <div key={i} className="card grow" style={{ padding: 12 }}><Skeleton h={56} /></div>)}
              </div>
              <div className="card grow" style={{ padding: 14 }}><Skeleton h={40} /></div>
            </div>
          ) : (
            <div className="col gap-10">
              {/* Primary KPIs Row */}
              <div className="row gap-10">
                <KpiCard icon={Eye} color="var(--brand-700)" value={(data?.views ?? 0).toLocaleString()} label="Profile Views" trend="+10%" bgTint="rgba(204, 68, 21, 0.05)" />
                <KpiCard icon={Briefcase} color="var(--blue-500)" value={data?.leads ?? 0} label="Leads" trend="+5%" bgTint="rgba(14, 165, 233, 0.05)" />
                <KpiCard icon={CheckCircle2} color="var(--green-500)" value={data?.accepted ?? 0} label="Won Jobs" trend="+12%" bgTint="rgba(22, 163, 74, 0.05)" />
              </div>
              
              {/* Secondary Metrics Card */}
              <div className="card row" style={{ padding: 16, marginTop: 4, justifyContent: "space-around" }}>
                <div className="col center" style={{ gap: 4 }}>
                  <Wallet size={20} color="var(--orange-500)" />
                  <span className="bold h2" style={{ color: "var(--ink-900)" }}>{inr(data?.earnings ?? 0)}</span>
                  <span className="tiny muted">Earned (Offline)</span>
                </div>
                <div style={{ width: 1, height: 36, background: "var(--line)" }} />
                <div className="col center" style={{ gap: 4 }}>
                  <Briefcase size={20} color="var(--green-500)" />
                  <span className="bold h2" style={{ color: "var(--ink-900)" }}>{data?.jobsDone ?? 0}</span>
                  <span className="tiny muted">Jobs Done</span>
                </div>
                <div style={{ width: 1, height: 36, background: "var(--line)" }} />
                <div className="col center" style={{ gap: 4 }}>
                  <div className="row gap-4" style={{ alignItems: "center" }}>
                    <Star size={20} color="var(--amber-500)" weight="fill" />
                  </div>
                  <span className="bold h2" style={{ color: "var(--ink-900)" }}>{p?.ratingAvg || 0}</span>
                  <span className="tiny muted">Avg Rating</span>
                </div>
              </div>
            </div>
          )}
        </div>



        {/* ── Grouped Launcher Tiles (The Manage Section) ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="small semi muted" style={{ marginBottom: 12, letterSpacing: 0.5 }}>Manage Options</div>
          
          <div className="col gap-16">
            {/* Section 1: Daily Operations — Edit Profile pinned first */}
            <div className="col gap-6">
              <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Profile & Operations</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <TileCard icon={User} color="var(--pink-500)" bgTint="var(--brand-50)" label="Edit Profile" onClick={() => nav(`${base}/profile`)} />
                <TileCard icon={Briefcase} color="var(--brand-600)" bgTint="var(--brand-50)" label="Leads & Requests" onClick={() => nav(`${base}/leads`)} />
                <TileCard icon={Calendar} color="var(--green-500)" bgTint="var(--green-100)" label="Availability Slots" onClick={() => nav(`${base}/availability`)} />
              </div>
            </div>

            {/* Section 2: Portfolio & Setup */}
            <div className="col gap-6">
              <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Portfolio & Catalog</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <TileCard icon={FileText} color="var(--brand-600)" bgTint="var(--brand-50)" label="Service Catalog" onClick={() => nav(`${base}/catalog`)} />
                <TileCard icon={Image} color="var(--pink-500)" bgTint="var(--brand-50)" label="Photo Portfolio" onClick={() => nav(`${base}/portfolio`)} />
                <TileCard icon={QrCode} color="var(--ink-700)" bgTint="var(--ink-50)" label="Share QR" onClick={() => setShare(true)} />
              </div>
            </div>

            {/* Section 3: Growth & Community */}
            <div className="col gap-6">
              <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Growth & Community</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <TileCard icon={Megaphone} color="var(--brand-600)" bgTint="var(--brand-50)" label="Post Community" onClick={() => nav("/community/new", { state: { providerId: id, providerName: p?.displayName, providerAvatar: p?.avatar } })} />
                <TileCard icon={Globe} color="var(--blue-500)" bgTint="var(--blue-500)" label="My Community" onClick={() => nav(`${base}/community`)} />
                <TileCard icon={Camera} color="var(--pink-500)" bgTint="var(--brand-50)" label="Post a Story" onClick={() => nav("/story/new", { state: { providerId: id, providerName: p?.displayName, providerAvatar: p?.avatar } })} />
                <TileCard icon={Eye} color="var(--green-600)" bgTint="var(--green-100)" label="My Activity" onClick={() => nav("/my-activity")} />
              </div>
            </div>
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
          upiId={p?.upiId || undefined}
          paymentQrUrl={localStorage.getItem("stryt_upi_qr_" + id) || undefined}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}

// ── Redesigned KPI Widget Card ──
function KpiCard({ icon: Icon, color, value, label, trend, bgTint }: { icon: any; color: string; value: string | number; label: string; trend: string; bgTint: string }) {
  const isUp = trend.startsWith("+");
  return (
    <div className="card grow col" style={{ padding: 12, gap: 4, position: "relative" }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: bgTint,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4
      }}>
        <Icon size={18} color={color} />
      </div>
      <span className="bold h1" style={{ fontSize: 18, color: "var(--ink-900)" }}>{value}</span>
      <span className="tiny muted ellipsis">{label}</span>
      {trend && (
        <span style={{
          position: "absolute",
          top: 12,
          right: 12,
          fontSize: 9,
          fontWeight: 700,
          color: isUp ? "var(--green-500)" : "var(--ink-400)",
          background: isUp ? "var(--green-100)" : "var(--ink-50)",
          padding: "2px 6px",
          borderRadius: 100
        }}>
          {trend}
        </span>
      )}
    </div>
  );
}

// ── Revamped Dashboard Launcher Tile ──
function TileCard({ icon: Icon, color, bgTint, label, onClick }: { icon: any; color: string; bgTint: string; label: string; onClick: () => void }) {
  return (
    <button
      className="card row"
      style={{
        padding: "12px 14px",
        gap: 12,
        alignItems: "center",
        textAlign: "left",
        width: "100%",
        background: "var(--surface)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        cursor: "pointer"
      }}
      onClick={onClick}
    >
      <div style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: bgTint,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: color,
        flexShrink: 0
      }}>
        <Icon size={18} weight="bold" />
      </div>
      <span className="tiny semi grow" style={{ color: "var(--ink-800)", lineHeight: 1.25 }}>{label}</span>
    </button>
  );
}
