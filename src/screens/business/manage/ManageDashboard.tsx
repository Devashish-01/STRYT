import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Eye, Phone, Navigation, Star, HelpCircle,
  ChevronRight, BadgeCheck, Share2, Zap,
  Calendar, Users, Search, FileText, Clock, User,
  Tag, Megaphone, Globe, QrCode, MessageSquareText, Camera
} from "@/components/Icons";
import { businessService, communityService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import { AppBar } from "@/components/common";
import { useApp } from "@/store";
import { evaluateProviderAvailability, calculateNextTurnoffTime, DEFAULT_ONBOARD_WORKING_HOURS } from "@/utils/availability";
import ManageNav from "./ManageNav";
import ShareCard from "@/components/ShareCard";
import RoleSwitcher from "@/components/RoleSwitcher";
import { AccountStatusBanner } from "@/components/AccountStatusBanner";

export default function ManageDashboard() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast } = useApp();
  const { data: b } = useQuery(() => businessService.get(id), [id]);
  const { data, loading } = useQueryWithRealtime(
    () => businessService.analytics(id),
    "leads",
    [id],
    `business_id=eq.${id}`
  );
  const { data: bizPosts } = useQuery(() => communityService.byAuthorRef("business", id), [id]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Dashboard" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }
  const [share, setShare] = useState(false);
  const [available, setAvailable] = useState(false);

  const base = `/business/${id}/manage`;

  // Seed the presence toggle from the live shop record.
  useEffect(() => { if (b) setAvailable(b.isAvailableNow ?? false); }, [b]);

  // One-time boost-expiry heads-up, a day before it lapses (no cron in this
  // project — surfaced on the next dashboard visit instead, then marked sent
  // so it doesn't repeat; buyBoost() resets the flag on a fresh purchase).
  useEffect(() => {
    if (!b?.boostedUntil || b.boostReminderSent) return;
    const hoursLeft = (new Date(b.boostedUntil).getTime() - Date.now()) / 3600000;
    if (hoursLeft > 0 && hoursLeft <= 24) {
      showToast("Your boost expires in less than 24h — renew to keep featured placement");
      businessService.markBoostReminderSent(id).catch(() => {});
    }
  }, [b?.boostedUntil, b?.boostReminderSent]);

  // Guided setup checklist — shown until every step is done.
  const checklistSteps = [
    { label: "Add a catalog item", done: (b?.catalog?.length ?? 0) > 0, onClick: () => nav(`${base}/catalog`) },
    { label: "Set your hours", done: !!b?.hours && b.hours !== DEFAULT_ONBOARD_WORKING_HOURS, onClick: () => nav(`${base}/hours`) },
    { label: "Upload verification", done: !!b?.verificationStatus, onClick: () => nav(`${base}/verify`) },
    { label: "Post your first community update", done: (bizPosts?.length ?? 0) > 0, onClick: () => nav("/community/new", { state: { businessId: id, businessName: b?.name, businessAvatar: b?.coverImage } }) },
  ];
  const checklistDone = checklistSteps.filter((s) => s.done).length;
  const showChecklist = !!b && checklistDone < checklistSteps.length;

  // Availability calculation
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
      {/* ── Branded Premium Header ── */}
      <div style={{
        background: "linear-gradient(135deg, var(--orange-500), #9a3412)",
        color: "#fff",
        padding: "20px 16px 24px",
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        boxShadow: "0 8px 30px rgba(194, 65, 12, 0.15)"
      }}>
        {/* Top navigation row */}
        <div className="row between">
          <RoleSwitcher theme="dark-pill" />
          
          <div className="row gap-8" style={{ alignItems: "center" }}>
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
              onClick={() => nav(`/business/${id}`)}
            >
              View Shop →
            </button>
          </div>
        </div>

        {/* Profile info block */}
        <div className="row gap-12" style={{ marginTop: 20, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <img
              src={b?.coverImage}
              className="thumb"
              style={{
                width: 58,
                height: 58,
                borderRadius: 16,
                border: available ? "3px solid var(--green-500)" : "2px solid rgba(255,255,255,0.4)",
                objectFit: "cover"
              }}
            />
            {available && (
              <span style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "var(--green-500)",
                border: "2.5px solid #9a3412"
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
            <div className="row gap-6">
              <span className="bold h1" style={{ color: "#fff" }}>{b?.name}</span>
              <BadgeCheck size={18} color="#ffba2b" weight="fill" />
            </div>
            <div className="row gap-6" style={{ marginTop: 4 }}>
              <span className="badge" style={{ background: b?.status === "SUSPENDED" ? "var(--red-600)" : "rgba(255,255,255,0.2)", color: "#fff", fontSize: 10 }}>
                {b?.status === "ACTIVE" ? "Live on STRYT" : b?.status === "SUSPENDED" ? "Suspended" : "Under Review"}
              </span>
              {available && (
                <span className="badge" style={{ background: "var(--green-600)", color: "#fff", fontSize: 10 }}>
                  Open Now
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="screen-scroll">
        <div style={{ paddingTop: 12 }}>
          <AccountStatusBanner entityType="BUSINESS" entityId={id} status={b?.status} />
        </div>
        {/* ── Guided setup checklist — new sellers land on a full dashboard
            with no ordered path otherwise. Disappears once all 4 steps are done. ── */}
        {showChecklist && (
          <div className="page-pad">
            <div className="card" style={{ padding: 16 }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="semi small">Finish setting up your shop</span>
                <span className="tiny semi muted">{checklistDone}/{checklistSteps.length}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--ink-100)", overflow: "hidden", marginBottom: 12 }}>
                <div style={{ height: "100%", width: `${(checklistDone / checklistSteps.length) * 100}%`, background: "var(--orange-500)", transition: "width 0.3s" }} />
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
              background: available ? "#e8f7ee" : "var(--ink-50)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
              <Zap size={22} color={available ? "var(--green-500)" : "var(--ink-400)"} weight={available ? "fill" : "regular"} />
            </div>
            <div className="grow">
              <div className="semi small">{available ? "Shop is visible as Open" : "Go live for walk-ins"}</div>
              <div className="tiny muted">{available ? "Neighbors can see you are open right now" : "Mark yourself open to nearby traffic"}</div>
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

        {/* ── Analytics dashboard ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <span className="small semi muted" style={{ letterSpacing: 0.5, textTransform: "uppercase" }}>This Week's Activity</span>
            <span className="tiny semi" style={{ color: "var(--brand-600)" }}>Live Analytics</span>
          </div>
          
          {loading ? (
            <div className="col gap-10">
              <div className="row gap-10">
                {[1, 2, 3].map((i) => <div key={i} className="card grow" style={{ padding: 12 }}><Skeleton h={56} /></div>)}
              </div>
              <div className="row gap-10">
                {[1, 2, 3].map((i) => <div key={i} className="card grow" style={{ padding: 12 }}><Skeleton h={56} /></div>)}
              </div>
            </div>
          ) : (
            <div className="col gap-10">
              <div className="row gap-10">
                <KpiCard icon={Eye} color="#cc4415" value={data!.views.toLocaleString()} label="Views" trend="+5%" bgTint="rgba(204, 68, 21, 0.05)" />
                <KpiCard icon={Phone} color="var(--green-500)" value={data!.calls} label="Calls" trend="+8%" bgTint="rgba(22, 163, 74, 0.05)" />
                <KpiCard icon={Navigation} color="var(--orange-500)" value={data!.directions} label="Directions" trend="+12%" bgTint="rgba(242, 106, 0, 0.05)" />
              </div>
              <div className="row gap-10">
                <KpiCard icon={FileText} color="#0ea5e9" value={data!.catalogViews.toLocaleString()} label="Menu Views" trend="+3%" bgTint="rgba(14, 165, 233, 0.05)" />
                <KpiCard icon={Star} color="var(--amber-500)" value={data!.reviews} label="New Reviews" trend="Steady" bgTint="rgba(245, 158, 11, 0.05)" />
                <KpiCard icon={HelpCircle} color="#6366f1" value={data!.questions} label="Questions" trend="New" bgTint="rgba(99, 102, 241, 0.05)" />
              </div>
            </div>
          )}
        </div>



        {/* ── Attention List / Action Needed ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="small semi muted" style={{ marginBottom: 8, letterSpacing: 0.5 }}>Action Needed</div>
          <div className="card" style={{ overflow: "hidden", padding: 0 }}>
            <ActionRow
              icon={<MessageSquareText size={18} color="#6366f1" />}
              label="Answer Customer Questions"
              count={data?.questions || 0}
              onClick={() => nav(`${base}/qna`)}
            />
            <ActionRow
              icon={<Star size={18} color="var(--amber-500)" />}
              label="Reply to Reviews"
              count={data?.reviews || 0}
              onClick={() => nav(`${base}/reviews`)}
              last
            />
          </div>
        </div>

        {/* ── Grouped Launcher Tiles (The Manage Section) ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="small semi muted" style={{ marginBottom: 12, letterSpacing: 0.5 }}>Store Management</div>
          
          <div className="col gap-16">
            {/* Section 1: Daily Operations — Edit Profile pinned first */}
            <div className="col gap-6">
              <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Profile & Operations</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <TileCard icon={User} color="#db2777" bgTint="#ffeef4" label="Edit Profile" onClick={() => nav(`${base}/profile`)} />
                <TileCard icon={Calendar} color="var(--brand-600)" bgTint="var(--brand-50)" label="Appointments" onClick={() => nav(`${base}/appointments`)} />
                <TileCard icon={Users} color="var(--green-500)" bgTint="#e7f7ee" label="Live Queue" onClick={() => nav(`${base}/queue`)} />
                <TileCard icon={Search} color="var(--orange-500)" bgTint="#fff2e8" label="Find Requests" onClick={() => nav(`${base}/requests`)} />
              </div>
            </div>

            {/* Section 2: Storefront & Catalog */}
            <div className="col gap-6">
              <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Storefront & Catalog</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <TileCard icon={FileText} color="var(--brand-600)" bgTint="var(--brand-50)" label="Catalog" onClick={() => nav(`${base}/catalog`)} />
                <TileCard icon={Clock} color="#0ea5e9" bgTint="#e0f2fe" label="Hours" onClick={() => nav(`${base}/hours`)} />
                <TileCard icon={QrCode} color="var(--ink-700)" bgTint="var(--ink-50)" label="Share QR" onClick={() => setShare(true)} />
              </div>
            </div>

            {/* Section 3: Growth & Marketing */}
            <div className="col gap-6">
              <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Growth & Marketing</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <TileCard icon={Tag} color="var(--orange-500)" bgTint="#fff2e8" label="Offers" onClick={() => nav(`${base}/offers`)} />
                <TileCard icon={Megaphone} color="var(--brand-600)" bgTint="var(--brand-50)" label="Community Post" onClick={() => nav("/community/new", { state: { businessId: id, businessName: b?.name, businessAvatar: b?.coverImage } })} />
                <TileCard icon={Globe} color="#0ea5e9" bgTint="#e0f2fe" label="My Community" onClick={() => nav(`${base}/community`)} />
                <TileCard icon={Camera} color="#ec4899" bgTint="#fdeef6" label="Post a Story" onClick={() => nav("/story/new", { state: { businessId: id, businessName: b?.name, businessAvatar: b?.coverImage } })} />
              </div>
            </div>
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
          upiId={b?.upiId || undefined}
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
          background: isUp ? "#e7f7ee" : "var(--ink-50)",
          padding: "2px 6px",
          borderRadius: 100
        }}>
          {trend}
        </span>
      )}
    </div>
  );
}

// ── Clean List-Based Action Row ──
function ActionRow({ icon, label, count, onClick, last }: { icon: React.ReactNode; label: string; count: number; onClick: () => void; last?: boolean }) {
  return (
    <button
      className="row gap-12"
      style={{
        width: "100%",
        padding: "14px 16px",
        borderBottom: last ? "none" : "1px solid var(--line)",
        alignItems: "center"
      }}
      onClick={onClick}
    >
      <div style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: "var(--ink-50)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0
      }}>
        {icon}
      </div>
      <span className="semi small grow" style={{ textAlign: "left", color: "var(--ink-800)" }}>{label}</span>
      {count > 0 && (
        <span className="badge badge-amber" style={{ padding: "2px 8px", fontSize: 10, borderRadius: 100 }}>
          {count} pending
        </span>
      )}
      <ChevronRight size={16} color="var(--ink-300)" />
    </button>
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
