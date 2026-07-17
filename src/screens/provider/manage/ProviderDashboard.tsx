import { useState, useEffect, type CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Zap, Share2, Bell, Calendar, FileText, QrCode, Megaphone, Camera,
  BadgeCheck, MessageSquareText, Check, X as XIcon, ChevronRight, Wallet, Search,
} from "@/components/Icons";
import { providerService, communityService, appointmentService, notificationService, requestService } from "@/services";
import { chatService } from "@/services/engagement/chatService";
import { SafeImg, inr, AppBar } from "@/components/common";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ErrorView } from "@/components/states";
import { useApp } from "@/store";
import { DEFAULT_ONBOARD_WORKING_HOURS } from "@/utils/availability";
import { ownerVisibleCustomerName } from "@/services/engagement/appointmentService";
import type { AppointmentRecord, RequestPost } from "@/types";
import ProviderManageNav from "./ProviderManageNav";
import ShareCard from "@/components/ShareCard";
import RoleSwitcher from "@/components/RoleSwitcher";
import BrandHome from "@/components/BrandHome";
import { AccountStatusBanner } from "@/components/AccountStatusBanner";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import AmbientSky from "@/features/ambient/AmbientSky";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog } from "@phosphor-icons/react";

function renderWeatherIcon(code: number) {
  const size = 15;
  if (code === 0) return <Sun size={size} weight="fill" />;
  if (code >= 1 && code <= 3) return <Cloud size={size} weight="fill" />;
  if (code === 45 || code === 48) return <CloudFog size={size} weight="fill" />;
  if (code >= 51 && code <= 57) return <CloudRain size={size} weight="fill" />;
  if (code >= 61 && code <= 67) return <CloudRain size={size} weight="fill" />;
  if (code >= 71 && code <= 77) return <CloudSnow size={size} weight="fill" />;
  if (code >= 80 && code <= 82) return <CloudRain size={size} weight="fill" />;
  if (code >= 85 && code <= 86) return <CloudSnow size={size} weight="fill" />;
  if (code >= 95 && code <= 99) return <CloudLightning size={size} weight="fill" />;
  return <Sun size={size} weight="fill" />;
}

function getWeatherText(code: number): string {
  if (code === 0) return "Sunny";
  if (code >= 1 && code <= 3) return "Partly Cloudy";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rainy";
  if (code >= 71 && code <= 77) return "Snowy";
  if (code >= 80 && code <= 82) return "Rain Showers";
  if (code >= 85 && code <= 86) return "Snow Showers";
  if (code >= 95 && code <= 99) return "Thunderstorm";
  return "Clear";
}

// The provider "Today" — a triage feed, not a launcher. Availability, then the
// things that need a response right now (accept a booking, confirm a payment),
// then today's timeline, a money snapshot, and a find-work nudge. Deep tools live
// in the bottom nav (Jobs / Find work / Money / Profile). See PROVIDER_DESIGN.md.
export default function ProviderDashboard() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: p } = useQuery(() => providerService.get(id), [id]);
  const { showToast, user } = useApp();
  const ambient = useAmbientTheme(user.lat, user.lng, "provider");
  const { data: analytics } = useQuery(() => providerService.analytics(id), [id]);
  const { data: provPosts } = useQuery(() => communityService.byAuthorRef("provider", id), [id]);
  const { data: appts, refetch: refetchApts } = useQueryWithRealtime(
    () => appointmentService.listForTarget(id),
    "appointments",
    [id],
    `target_id=eq.${id}`
  );
  const { data: reqFeed } = useQueryWithRealtime(
    () => requestService.feed({ lat: p?.lat ?? undefined, lng: p?.lng ?? undefined, radiusKm: p?.serviceRadiusKm ?? undefined }),
    "requests",
    [p?.lat, p?.lng, p?.serviceRadiusKm]
  );
  const { data: notifUnread } = useQueryWithRealtime(() => notificationService.getUnreadCount({ scope: "PROVIDER", id }), "notifications", [id]);
  const { data: chatUnread } = useQueryWithRealtime(() => chatService.totalUnread({ scope: "PROVIDER", id }), "conversations", [id]);

  const [available, setAvailable] = useState(false);
  const [share, setShare] = useState(false);
  const [busyApt, setBusyApt] = useState<string | null>(null);
  const base = `/provider/${id}/manage`;

  useEffect(() => {
    if (p) setAvailable(p.isAvailableNow ?? false);
  }, [p]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Today" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  const appointments = (appts ?? []) as AppointmentRecord[];
  const now = new Date();
  const isToday = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };

  // ── Triage inputs ──
  const pendingAppts = appointments
    .filter((a) => a.status === "PENDING")
    .sort((a, b) => new Date(a.scheduledForISO).getTime() - new Date(b.scheduledForISO).getTime());
  const paymentClaims = appointments.filter((a) => a.paymentStatus === "PENDING_CONFIRM");
  const todayAppts = appointments
    .filter((a) => (a.status === "ACCEPTED" || a.status === "PENDING") && isToday(a.scheduledForISO))
    .sort((a, b) => new Date(a.scheduledForISO).getTime() - new Date(b.scheduledForISO).getTime());
  const actionCount = pendingAppts.length + paymentClaims.length;

  const matchingRequests = ((reqFeed?.data ?? []) as RequestPost[])
    .filter((r) => r.status === "OPEN")
    .filter((r) => !r.categoryId || !p?.categoryId || r.categoryId === p.categoryId);

  const totalEarned = analytics?.earnings ?? 0;
  const requiresPaymentFirst = (a: AppointmentRecord) => p?.paymentTiming === "AT_BOOKING" && a.paymentStatus !== "PAID";

  // Guided setup checklist — shown until every step is done.
  const checklistSteps = [
    { label: "Add a service to your catalog", done: (p?.catalog?.length ?? 0) > 0, onClick: () => nav(`${base}/catalog`) },
    { label: "Set your availability", done: !!p?.availabilityNote && p.availabilityNote !== DEFAULT_ONBOARD_WORKING_HOURS, onClick: () => nav(`${base}/availability`) },
    { label: "Upload verification", done: !!p?.verificationStatus, onClick: () => nav(`${base}/verify`) },
    { label: "Post your first community update", done: (provPosts?.length ?? 0) > 0, onClick: () => nav("/community/new", { state: { providerId: id, providerName: p?.displayName, providerAvatar: p?.avatar } }) },
  ];
  const checklistDone = checklistSteps.filter((s) => s.done).length;
  const showChecklist = !!p && checklistDone < checklistSteps.length;

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

  async function quickAppt(apt: AppointmentRecord, action: "ACCEPT" | "REJECT") {
    setBusyApt(apt.id);
    try {
      await appointmentService.updateStatus(apt.id, action === "ACCEPT" ? "ACCEPTED" : "REJECTED");
      showToast(action === "ACCEPT" ? "Appointment accepted 📅" : "Appointment declined");
      refetchApts();
    } catch {
      showToast("Couldn't update — try again");
    } finally {
      setBusyApt(null);
    }
  }

  async function quickPayment(apt: AppointmentRecord, action: "CONFIRM" | "REJECT") {
    console.log("quickPayment called:", { aptId: apt.id, action, paymentStatus: apt.paymentStatus });
    setBusyApt(apt.id);
    try {
      if (action === "CONFIRM") { await appointmentService.confirmPayment(apt.id); showToast("Payment confirmed ✓"); }
      else { await appointmentService.rejectPaymentClaim(apt.id); showToast("Payment claim rejected"); }
      refetchApts();
    } catch (e: any) {
      // Show the actual error to help debug the issue
      const errorMsg = e?.message || "Couldn't update payment — try again";
      console.error("Payment update failed:", e);
      showToast(errorMsg);
    } finally {
      setBusyApt(null);
    }
  }

  return (
    <div className="screen with-nav">
      {/* ── Branded Premium Header — Living Street Light ── */}
      <div className="living-sky-header" style={{
        background: ambient.headerGradient,
        color: "#fff",
        padding: "calc(20px + var(--safe-area-top)) 16px 24px",
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        boxShadow: "0 8px 30px rgba(22, 163, 74, 0.15)",
        position: "relative",
        overflow: "hidden",
        transition: "background 0.6s ease, background-position 0.6s ease",
      }}>
        <AmbientSky dayPart={ambient.dayPartKey} effect={ambient.seasonEffect} glow={ambient.lampGlow} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="row between" style={{ marginBottom: 12, alignItems: "center" }}>
            <BrandHome color="#fff" glow={ambient.lampGlow} />
            {ambient.weather && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "rgba(255, 255, 255, 0.16)", backdropFilter: "blur(8px)",
                padding: "4px 10px", borderRadius: 20, color: "#fff", fontSize: 12, fontWeight: 600,
                border: "1px solid rgba(255, 255, 255, 0.08)", boxShadow: "0 2px 10px rgba(0, 0, 0, 0.05)",
              }}>
                {renderWeatherIcon(ambient.weather.code)}
                <span>{Math.round(ambient.weather.tempC)}°C</span>
                <span style={{ opacity: 0.82, fontWeight: 500 }}>{getWeatherText(ambient.weather.code)}</span>
              </div>
            )}
          </div>

          {/* Top navigation row */}
          <div className="row between">
            <RoleSwitcher theme="dark-pill" />
            <div className="row gap-8" style={{ alignItems: "center" }}>
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
                style={{ background: "rgba(255, 255, 255, 0.15)", color: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                onClick={() => setShare(true)}
                aria-label="Share QR Code"
              >
                <Share2 size={15} />
              </button>
              <button
                className="tiny semi"
                style={{ padding: "6px 12px", background: "rgba(255, 255, 255, 0.15)", border: "1px solid rgba(255, 255, 255, 0.2)", borderRadius: 100, color: "#fff" }}
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
                style={{ width: 58, height: 58, borderRadius: "50%", border: available ? "3px solid var(--green-400)" : "2px solid rgba(255,255,255,0.4)", objectFit: "cover" }}
              />
              {available && (
                <span style={{ position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderRadius: "50%", background: "var(--green-500)", border: "2.5px solid var(--green-700)" }}>
                  <span className="fade-up" style={{ position: "absolute", inset: -4, borderRadius: "50%", border: "1.5px solid var(--green-500)", animation: "pulse-ring 1.5s infinite ease-in-out" }} />
                </span>
              )}
            </div>
            <div className="grow">
              <div className="row gap-6" style={{ alignItems: "center" }}>
                <span className="bold h1" style={{ color: "#fff" }}>{p?.displayName}</span>
                {p?.isVerified && <BadgeCheck size={18} color="var(--accent-400)" weight="fill" />}
              </div>
              <div className="small" style={{ color: "#fff", opacity: 0.9, marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                <span>{p?.categoryName}</span>
                <span className="tiny" style={{ opacity: 0.8, fontWeight: 500 }}>
                  {ambient.greeting} • {ambient.ambientSubtitle.toLowerCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="screen-scroll">
        <div style={{ paddingTop: 12 }}>
          <AccountStatusBanner entityType="PROVIDER" entityId={id} status={p?.status} />
        </div>

        {/* ── Guided setup checklist — new providers only ── */}
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
                    <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: s.done ? "var(--green-500)" : "var(--ink-100)", color: s.done ? "#fff" : "var(--ink-400)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                      {s.done ? "✓" : ""}
                    </span>
                    <span className={`small ${s.done ? "muted" : "semi"}`} style={{ textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Availability (primary revenue lever) ── */}
        <div className="page-pad">
          <button
            className="card row gap-12"
            style={{ width: "100%", textAlign: "left", border: available ? "2px solid var(--green-500)" : "1px solid var(--line)", boxShadow: available ? "0 4px 16px rgba(22, 163, 74, 0.08)" : "var(--shadow-sm)" }}
            onClick={toggleAvail}
          >
            <div style={{ width: 44, height: 44, borderRadius: 12, background: available ? "var(--green-100)" : "var(--ink-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Zap size={22} color={available ? "var(--green-500)" : "var(--ink-400)"} weight={available ? "fill" : "regular"} />
            </div>
            <div className="grow">
              <div className="semi small">{available ? "You're available now" : "Go available now"}</div>
              <div className="tiny muted">{available ? "Showing in the 'Free right now' rail" : "Surface to nearby customers for 3 hours"}</div>
            </div>
            <span style={{ width: 44, height: 26, borderRadius: 999, background: available ? "var(--green-500)" : "var(--ink-200)", position: "relative", flexShrink: 0, transition: "background-color 0.2s" }}>
              <span style={{ position: "absolute", top: 3, left: available ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }} />
            </span>
          </button>
        </div>

        {/* ── Action needed — the core "function faster" block ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="small semi muted" style={{ letterSpacing: 0.5, textTransform: "uppercase" }}>Action needed</span>
            {actionCount > 0 && <span className="badge badge-amber" style={{ fontSize: 10 }}>{actionCount}</span>}
          </div>

          {actionCount === 0 ? (
            <div className="card col center" style={{ padding: 22, gap: 6 }}>
              <span style={{ fontSize: 26 }}>✅</span>
              <span className="tiny muted">You're all caught up — nothing needs a response.</span>
            </div>
          ) : (
            <div className="col gap-10">
              {/* Payment claims first — money in hand */}
              {paymentClaims.map((apt) => (
                <div key={apt.id} className="card col gap-10" style={{ padding: 14, border: "1px solid var(--amber-100)" }}>
                  <div className="row gap-10 center-v">
                    <span style={{ fontSize: 20 }}>💳</span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="semi small ellipsis">{ownerVisibleCustomerName(apt)} paid {inr(apt.paymentAmount ?? apt.packagePrice ?? 0)}</div>
                      <div className="tiny muted">Confirm you received it{apt.paymentReference ? ` · ref ${apt.paymentReference}` : ""}</div>
                    </div>
                  </div>
                  <div className="row gap-8">
                    <button className="btn btn-green grow btn-sm row center gap-4" disabled={busyApt === apt.id} onClick={() => quickPayment(apt, "CONFIRM")}>
                      <Check size={14} /> Confirm
                    </button>
                    <button className="btn btn-outline grow btn-sm row center gap-4" style={{ color: "var(--red-600)", borderColor: "var(--red-100)" }} disabled={busyApt === apt.id} onClick={() => quickPayment(apt, "REJECT")}>
                      <XIcon size={14} /> Reject
                    </button>
                  </div>
                </div>
              ))}

              {/* Pending appointments — accept/decline inline */}
              {pendingAppts.map((apt) => (
                <div key={apt.id} className="card col gap-10" style={{ padding: 14 }}>
                  <div className="row gap-10 center-v">
                    <SafeImg src={apt.customerAvatar} variant="avatar" style={{ width: 40, height: 40, flexShrink: 0 }} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="semi small ellipsis">{ownerVisibleCustomerName(apt)}</div>
                      <div className="tiny muted row gap-4 center-v"><Calendar size={12} color="var(--brand-600)" /> {apt.dateLabel} at {apt.timeLabel}{apt.packageName ? ` · ${apt.packageName}` : ""}</div>
                    </div>
                  </div>
                  {requiresPaymentFirst(apt) ? (
                    <button className="btn btn-outline btn-sm btn-block" onClick={() => nav(`${base}/jobs`)}>
                      Waiting for payment — open in Jobs
                    </button>
                  ) : (
                    <div className="row gap-8">
                      <button className="btn btn-green grow btn-sm row center gap-4" disabled={busyApt === apt.id} onClick={() => quickAppt(apt, "ACCEPT")}>
                        <Check size={14} /> Accept
                      </button>
                      <button className="btn btn-outline grow btn-sm row center gap-4" style={{ color: "var(--red-600)", borderColor: "var(--red-100)" }} disabled={busyApt === apt.id} onClick={() => quickAppt(apt, "REJECT")}>
                        <XIcon size={14} /> Decline
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Today's timeline ── */}
        {todayAppts.length > 0 && (
          <div style={{ paddingBottom: 4 }}>
            <div className="row between page-pad" style={{ paddingBottom: 0 }}>
              <span className="semi small">Today's schedule</span>
              <button className="see-all" onClick={() => nav(`${base}/jobs`)}>View all</button>
            </div>
            <div className="hscroll today-rail" style={{ paddingTop: 10 }}>
              {todayAppts.map((a, idx) => (
                <button
                  key={a.id}
                  className="today-card fade-up"
                  style={{ "--today-accent": "var(--green-600)", animationDelay: `${idx * 35}ms`, cursor: "pointer" } as CSSProperties}
                  onClick={() => nav(`${base}/jobs`)}
                >
                  <div className="today-card-head">
                    <span className="today-card-icon">📅</span>
                    <span className="today-card-kicker grow">{a.status === "PENDING" ? "Requested" : "Confirmed"}</span>
                  </div>
                  <div>
                    <div className="today-card-title">{ownerVisibleCustomerName(a)}</div>
                    <div className="today-card-stat" style={{ marginTop: 6 }}>{a.timeLabel}</div>
                    {a.packageName && <div className="today-card-sub" style={{ marginTop: 2 }}>{a.packageName}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Money snapshot ── */}
        <div className="page-pad" style={{ paddingTop: 8 }}>
          <button className="card row gap-12 center-v" style={{ width: "100%", textAlign: "left" }} onClick={() => nav(`${base}/money`)}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--orange-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Wallet size={20} color="var(--orange-500)" />
            </div>
            <div className="grow">
              <div className="semi small">{inr(totalEarned)} earned</div>
              <div className="tiny muted">{paymentClaims.length > 0 ? `${paymentClaims.length} payment${paymentClaims.length > 1 ? "s" : ""} to confirm` : "View earnings & payments"}</div>
            </div>
            <ChevronRight size={18} color="var(--ink-300)" />
          </button>
        </div>

        {/* ── Idle? Find work ── */}
        {matchingRequests.length > 0 && (
          <div className="page-pad" style={{ paddingTop: 0 }}>
            <button className="card row gap-12 center-v" style={{ width: "100%", textAlign: "left", background: "var(--green-100)", border: "1px solid var(--green-500)" }} onClick={() => nav(`${base}/find-work`)}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Search size={20} color="var(--green-600)" />
              </div>
              <div className="grow">
                <div className="semi small" style={{ color: "var(--green-700)" }}>{matchingRequests.length} open request{matchingRequests.length > 1 ? "s" : ""} match you</div>
                <div className="tiny" style={{ color: "var(--green-600)" }}>Send a proposal to win the job</div>
              </div>
              <ChevronRight size={18} color="var(--green-600)" />
            </button>
          </div>
        )}

        {/* ── Grow — only actions that aren't already in the nav ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="small semi muted" style={{ marginBottom: 10, letterSpacing: 0.5 }}>Grow</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <GrowTile icon={Megaphone} color="var(--brand-600)" label="Post community update" onClick={() => nav("/community/new", { state: { providerId: id, providerName: p?.displayName, providerAvatar: p?.avatar } })} />
            <GrowTile icon={Camera} color="var(--pink-500)" label="Post a story" onClick={() => nav("/story/new", { state: { providerId: id, providerName: p?.displayName, providerAvatar: p?.avatar } })} />
            <GrowTile icon={QrCode} color="var(--ink-700)" label="Share QR" onClick={() => setShare(true)} />
            {!p?.isVerified
              ? <GrowTile icon={BadgeCheck} color="var(--green-600)" label="Get verified" onClick={() => nav(`${base}/verify`)} />
              : <GrowTile icon={FileText} color="var(--brand-600)" label="Edit profile" onClick={() => nav(`${base}/profile`)} />}
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

function GrowTile({ icon: Icon, color, label, onClick }: { icon: any; color: string; label: string; onClick: () => void }) {
  return (
    <button
      className="card row"
      style={{ padding: "12px 14px", gap: 12, alignItems: "center", textAlign: "left", width: "100%", background: "var(--surface)", cursor: "pointer" }}
      onClick={onClick}
    >
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--ink-50)", display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
        <Icon size={18} weight="bold" />
      </div>
      <span className="tiny semi grow" style={{ color: "var(--ink-800)", lineHeight: 1.25 }}>{label}</span>
    </button>
  );
}
