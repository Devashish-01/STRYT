import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, ChevronDown, ChevronRight, X, QrCode, MessageSquare } from "lucide-react";
import { useApp } from "@/store";
import { catalogService, requestService, appointmentService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { StoriesBar } from "@/components/Stories";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import QrScannerSheet from "@/components/QrScannerSheet";
import LocationPickerSheet from "@/components/LocationPickerSheet";

function reorderCategories(
  all: { id: string; slug: string; name: string; icon: string; color: string }[],
  boost: string[]
): typeof all {
  const rank = new Map(boost.map((slug, i) => [slug, i]));
  return [...all].sort((a, b) => {
    const ra = rank.has(a.slug) ? rank.get(a.slug)! : Infinity;
    const rb = rank.has(b.slug) ? rank.get(b.slug)! : Infinity;
    return ra - rb;
  });
}

export default function Home() {
  const nav = useNavigate();
  const { area: rawArea, unreadCount, chatUnread, user } = useApp();
  const area = rawArea || "your area";

  const theme = useAmbientTheme(user.lat, user.lng);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  const { data: categories } = useQuery(() => catalogService.getCategories(), []);
  const { data: agreementsList } = useQuery(() => requestService.agreements(), []);
  const { data: myAppointments } = useQuery(() => appointmentService.listForCustomer(user.id), [user.id]);

  const agreements = agreementsList ?? [];
  const activeAgreements = agreements.filter((a) => !["COMPLETED", "CANCELLED", "DISPUTED"].includes(a.status));

  // Upcoming = still-live bookings scheduled in the future.
  const upcomingCount = (myAppointments ?? []).filter(
    (a) => (a.status === "PENDING" || a.status === "ACCEPTED") && new Date(a.scheduledForISO).getTime() > Date.now()
  ).length;

  const orderedCategories = (categories ?? []).length > 0
    ? reorderCategories(categories as any[], theme.boostCategories)
    : (categories ?? []);

  const showBanner = !!theme.banner && !bannerDismissed;
  const firstName = user.name?.split(" ")[0] ?? "";

  const tiles = [
    { emoji: "🧭", label: "Explore", sub: "Shops & people", tint: "#e8f0ff", color: "#2563eb", onClick: () => nav("/explore") },
    { emoji: "🏘️", label: "Community", sub: "Street feed", tint: "#ffeef4", color: "#db2777", onClick: () => nav("/community-hub"), badge: chatUnread || undefined },
    { emoji: "🤝", label: "My deals", sub: activeAgreements.length > 0 ? `${activeAgreements.length} active` : "Agreements", tint: "#e7f7ee", color: "#16a34a", onClick: () => nav("/agreements"), badge: activeAgreements.length || undefined },
    { emoji: "📅", label: "Appointments", sub: upcomingCount > 0 ? `${upcomingCount} upcoming` : "Your bookings", tint: "#eef2ff", color: "var(--brand-600)", onClick: () => nav("/appointments"), badge: upcomingCount || undefined },
  ];

  return (
    <div className="screen with-nav">
      {/* ── Sticky gradient header ── */}
      <div style={{
        background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent}cc)`,
        color: "#fff",
        padding: "14px 16px 16px",
        position: "sticky",
        top: 0,
        zIndex: 20,
        transition: "background 0.6s ease",
      }}>
        <div className="row between">
          <button className="col" style={{ alignItems: "flex-start", gap: 2 }} onClick={() => setLocationOpen(true)}>
            <span className="tiny" style={{ opacity: 0.78, letterSpacing: 0.4 }}>
              {theme.greeting}{firstName ? `, ${firstName}` : ""}
            </span>
            <span className="row gap-4 bold" style={{ fontSize: 17 }}>
              {area} <ChevronDown size={16} />
            </span>
          </button>
          <div className="row gap-8">
            <button
              className="icon-btn"
              style={{ background: "rgba(255,255,255,0.16)", color: "#fff", position: "relative" }}
              onClick={() => nav("/chats")}
              aria-label="Chats"
            >
              <MessageSquare size={20} />
              {chatUnread > 0 && (
                <span style={{
                  position: "absolute", top: 6, right: 6,
                  width: 8, height: 8, background: "#ef4444",
                  borderRadius: "50%", border: "2px solid rgba(0,0,0,0.2)",
                }} />
              )}
            </button>
            <button
              className="icon-btn"
              style={{ background: "rgba(255,255,255,0.16)", color: "#fff", position: "relative" }}
              onClick={() => nav("/notifications")}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: 6, right: 6,
                  width: 8, height: 8, background: "#ff9500",
                  borderRadius: "50%", border: "2px solid rgba(0,0,0,0.2)",
                }} />
              )}
            </button>
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 12 }}>
          <button
            className="row gap-10"
            style={{ width: "100%", background: "#fff", borderRadius: 14, padding: "12px 14px", color: "var(--ink-500)", border: "none", textAlign: "left", cursor: "pointer" }}
            onClick={() => nav("/search")}
          >
            <Search size={18} />
            <span style={{ fontSize: 14 }}>Search "biryani", "plumber", "salon"…</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setScanner(true); }}
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              background: "transparent", border: "none", color: "var(--brand-700)", cursor: "pointer",
              padding: 4, display: "flex", alignItems: "center", justifyContent: "center"
            }}
            aria-label="Scan QR Code"
          >
            <QrCode size={20} />
          </button>
        </div>
      </div>

      {/* ── Ambient banner ── */}
      {showBanner && (
        <div style={{
          background: theme.accent + "18",
          borderBottom: `1px solid ${theme.accent}30`,
          padding: "8px 14px 8px 16px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span className="tiny grow" style={{ color: theme.accent, fontWeight: 500, lineHeight: 1.4 }}>
            {theme.banner}
          </span>
          <button onClick={() => setBannerDismissed(true)} style={{ color: theme.accent, opacity: 0.6, flexShrink: 0, padding: 2 }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="screen-scroll" style={{ background: theme.bgGradient, transition: "background 0.6s ease" }}>
        {/* ── Stories ── */}
        <StoriesBar />

        {/* ── Browse by category (top position) ── */}
        {orderedCategories.length > 0 && (
          <div style={{ paddingTop: 14 }}>
            <div className="row between page-pad" style={{ paddingBottom: 0, paddingTop: 0 }}>
              <span className="semi" style={{ fontSize: 15 }}>Browse</span>
              <button className="see-all" onClick={() => nav("/categories")}>All categories</button>
            </div>
            <div className="hscroll" style={{ paddingTop: 8 }}>
              {orderedCategories.map((c) => (
                <button
                  key={c.id}
                  className="col center fade-up"
                  style={{ gap: 5, flexShrink: 0, width: 64 }}
                  onClick={() => nav(`/category/${c.id}`)}
                >
                  <div style={{
                    width: 54, height: 54, borderRadius: 16,
                    background: `${c.color}1a`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 26,
                  }}>
                    {c.icon}
                  </div>
                  <span className="tiny semi" style={{ textAlign: "center", lineHeight: 1.2 }}>
                    {c.name.split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Hero "Need something?" ── */}
        <div className="page-pad" style={{ paddingTop: 16, paddingBottom: 0 }}>
          <button className="launch-hero fade-up" onClick={() => nav("/ask")}>
            <span className="launch-hero-icon">📋</span>
            <div className="grow">
              <div style={{ fontSize: 17, fontWeight: 800 }}>Need something?</div>
              <div style={{ fontSize: 13, opacity: 0.92, marginTop: 2 }}>Ask your street — get offers from nearby</div>
            </div>
            <ChevronRight size={22} style={{ opacity: 0.9, flexShrink: 0 }} />
          </button>
        </div>

        {/* ── 2×2 tile grid ── */}
        <div className="page-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
          <div className="launch-grid">
            {tiles.map((t) => (
              <button key={t.label} className="launch-tile fade-up" onClick={t.onClick}>
                {t.badge ? <span className="launch-tile-badge">{t.badge > 9 ? "9+" : t.badge}</span> : null}
                <span className="launch-tile-icon" style={{ background: t.tint, color: t.color }}>{t.emoji}</span>
                <div>
                  <div className="launch-tile-label">{t.label}</div>
                  <div className="launch-tile-sub">{t.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Leaderboard (moved below the grid, slim row) ── */}
        <div className="page-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
          <button className="activity-banner" style={{ width: "100%" }} onClick={() => nav("/leaderboard")}>
            <span style={{ fontSize: 22 }}>🏆</span>
            <div className="grow" style={{ textAlign: "left" }}>
              <div className="semi small">Leaderboard</div>
              <div className="tiny muted">Top contributors on your street →</div>
            </div>
            <ChevronRight size={18} color="var(--ink-400)" />
          </button>
        </div>

        {/* ── Active agreement banner ── */}
        {activeAgreements.length > 0 && (
          <div className="page-pad" style={{ paddingTop: 14, paddingBottom: 0 }}>
            <button className="activity-banner" style={{ width: "100%" }} onClick={() => nav("/agreements")}>
              <span style={{ fontSize: 22 }}>🤝</span>
              <div className="grow" style={{ textAlign: "left" }}>
                <div className="semi small" style={{ color: "#15803d" }}>
                  {activeAgreements.length} active {activeAgreements.length === 1 ? "deal" : "deals"}
                </div>
                <div className="tiny muted">Tap to track progress →</div>
              </div>
              <ChevronRight size={18} color="#16a34a" />
            </button>
          </div>
        )}

        {/* ── Empty street CTA ── */}
        {agreements.length === 0 && (categories ?? []).length === 0 && (
          <div className="page-pad col gap-12" style={{ paddingTop: 20 }}>
            <div className="card col center" style={{ padding: 28, gap: 12, textAlign: "center", background: "linear-gradient(135deg, var(--brand-50), #fff)" }}>
              <span style={{ fontSize: 52 }}>🏘️</span>
              <div className="bold" style={{ fontSize: 18 }}>Your street is just getting started</div>
              <p className="small muted" style={{ maxWidth: 280, lineHeight: 1.5 }}>
                Be among the first to list a spot, offer a service, or post a request.
              </p>
              <div className="row gap-10" style={{ marginTop: 4 }}>
                <button className="btn btn-primary btn-sm" onClick={() => nav("/onboard/business")}>List a spot</button>
                <button className="btn btn-ghost btn-sm" onClick={() => nav("/ask")}>Post a request</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
      {scanner && <QrScannerSheet onClose={() => setScanner(false)} />}
      {locationOpen && <LocationPickerSheet onClose={() => setLocationOpen(false)} />}
    </div>
  );
}
