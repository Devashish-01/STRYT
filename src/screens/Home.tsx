import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, ChevronDown, ChevronRight, X, QrCode, MessageSquare } from "@/components/Icons";
import { useApp } from "@/store";
import { catalogService, requestService, appointmentService, businessService, locationService, discoveryService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { StoriesBar } from "@/components/Stories";
import { BusinessCardSmall, ProviderCardSmall } from "@/components/cards";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import { firstName as safeFirstName } from "@/lib/publicName";
import { getRecentlyViewed } from "@/lib/recentlyViewed";
import LocationPickerSheet from "@/components/LocationPickerSheet";
import { SafeImg } from "@/components/common";

// Wraps the html5-qrcode camera library (~340kB) — deferred so it's only
// fetched when the user actually opens the scanner, not on every Home visit.
const QrScannerSheet = lazy(() => import("@/components/QrScannerSheet"));

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

function timeGreeting() {
  const hr = new Date().getHours();
  if (hr < 12) return "Good morning";
  if (hr < 17) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const nav = useNavigate();
  const { area: rawArea, unreadCount, chatUnread, user } = useApp();
  const area = rawArea || "your area";

  const theme = useAmbientTheme(user.lat, user.lng);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [recentlyViewed] = useState(getRecentlyViewed);

  const { data: categories, error: categoriesError, refetch: refetchCategories } = useQuery(() => catalogService.getCategories(), []);
  const { data: agreementsList } = useQuery(() => requestService.agreements(), []);
  // Real, always-populated discovery content — the dashboard shouldn't rely
  // solely on conditional "you have an active X" cards to feel complete.
  const { data: nearbyBizPage } = useQuery(
    () => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined, sort: "nearby" }),
    [user.lat, user.lng]
  );
  const { data: nearbyProvPage } = useQuery(
    () => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined, sort: "nearby" }),
    [user.lat, user.lng]
  );
  const { data: myAppointments } = useQuery(() => appointmentService.listForCustomer(user.id), [user.id]);
  const { data: myQueuesData } = useQueryWithRealtime(() => businessService.myQueues(), "queue_tokens", []);
  const { data: pendingLocReqs } = useQueryWithRealtime(() => locationService.pendingForMe(), "location_share_grants", []);

  const agreements = agreementsList ?? [];
  const activeAgreements = agreements.filter((a) => !["COMPLETED", "CANCELLED", "DISPUTED"].includes(a.status));
  const activeQueues = (myQueuesData ?? []).filter((q) => q.status === "WAITING" || q.status === "CALLED");
  const nearbyBiz = (nearbyBizPage?.data ?? []).slice(0, 8);
  const nearbyProv = (nearbyProvPage?.data ?? []).slice(0, 8);

  // Upcoming = still-live bookings scheduled in the future.
  const upcomingCount = (myAppointments ?? []).filter(
    (a) => (a.status === "PENDING" || a.status === "ACCEPTED") && new Date(a.scheduledForISO).getTime() > Date.now()
  ).length;

  const orderedCategories = (categories ?? []).length > 0
    ? reorderCategories(categories as any[], theme.boostCategories)
    : (categories ?? []);

  const showBanner = !!theme.banner && !bannerDismissed;
  // Phone-safe: never greet someone with their raw phone number as a name.
  const greetName = safeFirstName(user.name);
  const firstName = greetName === "Neighbor" ? "" : greetName;

  const tiles = [
    { emoji: "🧭", label: "Explore", sub: "Shops & people", tint: "#e8f0ff", color: "#2563eb", onClick: () => nav("/explore") },
    { emoji: "🏘️", label: "Community", sub: "Street feed", tint: "#ffeef4", color: "#db2777", onClick: () => nav("/community-hub"), badge: chatUnread || undefined },
    { emoji: "🤝", label: "My deals", sub: activeAgreements.length > 0 ? `${activeAgreements.length} active` : "Agreements", tint: "#e7f7ee", color: "var(--green-500)", onClick: () => nav("/agreements"), badge: activeAgreements.length || undefined },
    { emoji: "📅", label: "Appointments", sub: upcomingCount > 0 ? `${upcomingCount} upcoming` : "Your bookings", tint: "#eef2ff", color: "var(--brand-600)", onClick: () => nav("/appointments"), badge: upcomingCount || undefined },
  ];

  return (
    <div className="screen with-nav home-screen-wrapper" style={{ padding: 0, maxWidth: "100%", margin: 0 }}>
      
      {/* ==========================================================
          MOBILE-ONLY HOME VIEW (Matches original mobile flow)
         ========================================================== */}
      <div className="mobile-only" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", width: "100%" }}>
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
            <button className="col" style={{ alignItems: "flex-start", gap: 2, background: "none", border: "none", color: "#fff", textAlign: "left", cursor: "pointer", padding: 0 }} onClick={() => setLocationOpen(true)}>
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
                    width: 8, height: 8, background: "var(--red-500)",
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
            <button onClick={() => setBannerDismissed(true)} style={{ color: theme.accent, opacity: 0.6, flexShrink: 0, padding: 2, background: "none", border: "none", cursor: "pointer" }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Location Share Request Alert Banner ── */}
        {pendingLocReqs && pendingLocReqs.length > 0 && (
          <div
            onClick={() => nav("/settings")}
            style={{
              background: "linear-gradient(135deg, #fef3c7, #fde68a)",
              borderBottom: "1px solid #f59e0b",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 16 }}>📍</span>
            <span className="small grow" style={{ color: "#92400e", fontWeight: 700 }}>
              {pendingLocReqs.length} neighbor{pendingLocReqs.length > 1 ? "s want" : " wants"} to see your location
            </span>
            <span className="tiny semi" style={{ color: "#b45309", background: "rgba(255,255,255,0.5)", padding: "3px 8px", borderRadius: 12 }}>
              Manage
            </span>
          </div>
        )}

        <div className="screen-scroll" style={{ background: theme.bgGradient, transition: "background 0.6s ease", flex: 1 }}>
          {/* Stories */}
          <StoriesBar />

          {/* Browse Categories */}
          {categoriesError && (
            <div className="page-pad" style={{ paddingTop: 14 }}>
              <button className="row between card" style={{ padding: "12px 14px", width: "100%", textAlign: "left" }} onClick={() => refetchCategories()}>
                <span className="tiny muted">Couldn't load categories</span>
                <span className="tiny semi" style={{ color: "var(--brand-700)" }}>Retry</span>
              </button>
            </div>
          )}
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
                    style={{ gap: 5, flexShrink: 0, width: 64, background: "none", border: "none", cursor: "pointer" }}
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

          {/* Hero "Need something?" */}
          <div className="page-pad" style={{ paddingTop: 16, paddingBottom: 0 }}>
            <button className="launch-hero fade-up" onClick={() => nav("/ask")} style={{ width: "100%", border: "none", cursor: "pointer" }}>
              <span className="launch-hero-icon">📋</span>
              <div className="grow" style={{ textAlign: "left" }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>Need something?</div>
                <div style={{ fontSize: 13, opacity: 0.92, marginTop: 2 }}>Ask your street — get offers from nearby</div>
              </div>
              <ChevronRight size={22} style={{ opacity: 0.9, flexShrink: 0 }} />
            </button>
          </div>

          {/* 2x2 Launch Grid */}
          <div className="page-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
            <div className="launch-grid">
              {tiles.map((t) => (
                <button key={t.label} className="launch-tile fade-up" onClick={t.onClick} style={{ border: "none", cursor: "pointer" }}>
                  {t.badge ? <span className="launch-tile-badge">{t.badge > 9 ? "9+" : t.badge}</span> : null}
                  <span className="launch-tile-icon" style={{ background: t.tint, color: t.color }}>{t.emoji}</span>
                  <div style={{ textAlign: "left" }}>
                    <div className="launch-tile-label">{t.label}</div>
                    <div className="launch-tile-sub">{t.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Live Queue Ticket */}
          {activeQueues.length > 0 && (
            <div className="page-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
              <button
                className="activity-banner fade-up"
                style={{
                  width: "100%",
                  background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
                  border: "1.5px solid #93c5fd",
                  position: "relative",
                  overflow: "hidden",
                  cursor: "pointer",
                }}
                onClick={() => nav("/queues")}
              >
                <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, flexShrink: 0 }}>
                  <span style={{
                    position: "absolute",
                    width: 38, height: 38,
                    borderRadius: "50%",
                    background: "#3b82f6",
                    opacity: 0.15,
                    animation: "pulse 1.8s ease-in-out infinite",
                  }} />
                  <span style={{ fontSize: 22 }}>🎟️</span>
                </span>
                <div className="grow" style={{ textAlign: "left" }}>
                  <div className="row gap-6" style={{ alignItems: "center" }}>
                    <span className="semi small" style={{ color: "#1d4ed8" }}>Live Queue</span>
                    <span style={{
                      background: "#ef4444",
                      color: "#fff",
                      borderRadius: 99,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "1px 7px",
                      lineHeight: "18px",
                    }}>LIVE</span>
                  </div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    {activeQueues.length === 1
                      ? `You're in the queue at ${activeQueues[0].businessName} — tap to track`
                      : `You're in ${activeQueues.length} queues — tap to track`}
                  </div>
                </div>
                <ChevronRight size={18} color="#3b82f6" />
              </button>
            </div>
          )}

          {/* Leaderboard */}
          <div className="page-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
            <button className="activity-banner" style={{ width: "100%", border: "none", cursor: "pointer" }} onClick={() => nav("/leaderboard")}>
              <span style={{ fontSize: 22 }}>🏆</span>
              <div className="grow" style={{ textAlign: "left" }}>
                <div className="semi small">Leaderboard</div>
                <div className="tiny muted">Top contributors on your street →</div>
              </div>
              <ChevronRight size={18} color="var(--ink-400)" />
            </button>
          </div>

          {/* Active agreements */}
          {activeAgreements.length > 0 && (
            <div className="page-pad" style={{ paddingTop: 14, paddingBottom: 0 }}>
              <button className="activity-banner" style={{ width: "100%", border: "none", cursor: "pointer" }} onClick={() => nav("/agreements")}>
                <span style={{ fontSize: 22 }}>🤝</span>
                <div className="grow" style={{ textAlign: "left" }}>
                  <div className="semi small" style={{ color: "#15803d" }}>
                    {activeAgreements.length} active {activeAgreements.length === 1 ? "deal" : "deals"}
                  </div>
                  <div className="tiny muted">Tap to track progress →</div>
                </div>
                <ChevronRight size={18} color="var(--green-500)" />
              </button>
            </div>
          )}

          {/* Empty street CTA */}
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
      </div>

      {/* ==========================================================
          DESKTOP-ONLY DASHBOARD VIEW (Designed for desktop web app)
         ========================================================== */}
      <div className="desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", width: "100%", padding: "24px 32px", boxSizing: "border-box", background: "#fbfaff" }}>
        
        {/* Desktop Header */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "var(--ink-900)", margin: 0 }}>Dashboard</h2>
            <button
              onClick={() => setLocationOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, marginTop: 4, cursor: "pointer", color: "var(--brand-700)", fontSize: 13, fontWeight: 700 }}
            >
              <span>📍 {area}</span>
              <span style={{ fontSize: 10, opacity: 0.8 }}>(change)</span>
            </button>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => nav("/chats")}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, border: "1px solid var(--line)", background: "#fff", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "var(--ink-700)", position: "relative" }}
            >
              <MessageSquare size={16} />
              <span>Inbox</span>
              {chatUnread > 0 && <span className="sidebar-badge" style={{ padding: "2px 6px", fontSize: 9 }}>{chatUnread}</span>}
            </button>
            <button
              onClick={() => nav("/notifications")}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, border: "1px solid var(--line)", background: "#fff", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "var(--ink-700)", position: "relative" }}
            >
              <Bell size={16} />
              <span>Notifications</span>
              {unreadCount > 0 && <span className="sidebar-badge" style={{ padding: "2px 6px", fontSize: 9 }}>{unreadCount}</span>}
            </button>
            <button
              onClick={() => setScanner(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, border: "none", background: "var(--brand-600)", color: "#fff", cursor: "pointer", fontSize: 13.5, fontWeight: 700 }}
            >
              <QrCode size={16} />
              <span>Scan QR</span>
            </button>
          </div>
        </header>

        {/* Dashboard Content Grid */}
        <div className="home-dashboard-grid" style={{ padding: 0 }}>
          
          {/* Main Column */}
          <div className="home-main-col">
            
            {/* Elegant Greeting Hero */}
            <div style={{
              background: "linear-gradient(135deg, var(--brand-500) 0%, #a855f7 100%)",
              color: "#fff",
              borderRadius: 20,
              padding: "20px 24px",
              boxShadow: "0 10px 30px rgba(124,58,237,0.12)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              overflow: "hidden",
              position: "relative",
            }}>
              <div style={{ zIndex: 2, maxWidth: "60%" }}>
                <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: "-0.5px" }}>
                  {timeGreeting()}{firstName ? `, ${firstName}` : ""}! 👋
                </h1>
                <p style={{ fontSize: 13.5, opacity: 0.9, lineHeight: 1.45, margin: "6px 0 14px" }}>
                  Welcome back to your street console. View active listings, coordinate service handshakes, and chat with neighbors.
                </p>
                <div style={{ display: "flex", gap: 12 }}>
                  <button className="btn btn-sm" style={{ background: "#fff", color: "var(--brand-700)", border: "none", fontWeight: 700 }} onClick={() => nav("/explore")}>
                    🔍 Explore Shops
                  </button>
                  <button className="btn btn-sm" style={{ background: "rgba(255, 255, 255, 0.22)", color: "#fff", border: "1.5px solid rgba(255, 255, 255, 0.45)", fontWeight: 700 }} onClick={() => nav("/ask")}>
                    📋 Ask Street
                  </button>
                </div>
              </div>
              <div className="desktop-only" style={{ display: "flex", flexDirection: "column", gap: 10, zIndex: 2, flexShrink: 0 }}>
                <div className="desktop-hero-stat-card" onClick={() => nav("/queues")}>
                  <span style={{ fontSize: 20, display: "block", marginBottom: 2 }}>🎟️</span>
                  <span style={{ fontSize: 18, fontWeight: 900, display: "block" }}>{activeQueues.length}</span>
                  <span style={{ fontSize: 9, opacity: 0.9, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Queues</span>
                </div>
                <div className="desktop-hero-stat-card" onClick={() => nav("/agreements")}>
                  <span style={{ fontSize: 20, display: "block", marginBottom: 2 }}>🤝</span>
                  <span style={{ fontSize: 18, fontWeight: 900, display: "block" }}>{activeAgreements.length}</span>
                  <span style={{ fontSize: 9, opacity: 0.9, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Deals</span>
                </div>
                <div className="desktop-hero-stat-card" onClick={() => nav("/appointments")}>
                  <span style={{ fontSize: 20, display: "block", marginBottom: 2 }}>📅</span>
                  <span style={{ fontSize: 18, fontWeight: 900, display: "block" }}>{upcomingCount}</span>
                  <span style={{ fontSize: 9, opacity: 0.9, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Bookings</span>
                </div>
              </div>
              <div style={{ position: "absolute", right: "-40px", bottom: "-40px", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 60%)", zIndex: 1 }} />
            </div>

            {/* Quick Browse Services */}
            {orderedCategories.length > 0 && (
              <div className="card" style={{ padding: 24, borderRadius: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--ink-900)", margin: 0 }}>Quick Browse Services</h3>
                  <button className="see-all" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand-700)", border: "none", background: "none", cursor: "pointer" }} onClick={() => nav("/categories")}>View all categories &rarr;</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 12 }}>
                  {orderedCategories.slice(0, 8).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => nav(`/category/${c.id}`)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        padding: "16px 12px",
                        borderRadius: 16,
                        border: "1px solid var(--line)",
                        background: "#fff",
                        cursor: "pointer",
                        transition: "all 0.2s ease"
                      }}
                      className="category-tile-hover-tweak"
                    >
                      <span style={{ fontSize: 24 }}>{c.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-800)" }}>{c.name.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recently viewed — quick way back to a listing without re-searching. */}
            {recentlyViewed.length > 0 && (
              <div className="card" style={{ padding: 24, borderRadius: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--ink-900)", margin: "0 0 16px" }}>Recently viewed</h3>
                <div className="hscroll" style={{ padding: 0 }}>
                  {recentlyViewed.map((r) => (
                    <button
                      key={`${r.type}:${r.id}`}
                      className="col center"
                      style={{ gap: 6, width: 72, flexShrink: 0 }}
                      onClick={() => nav(r.type === "business" ? `/business/${r.id}` : `/provider/${r.id}`)}
                    >
                      <SafeImg src={r.image} variant={r.type === "provider" ? "avatar" : "photo"} style={{ width: 56, height: 56, borderRadius: r.type === "provider" ? "50%" : 12, objectFit: "cover" }} />
                      <span className="tiny semi ellipsis" style={{ maxWidth: 68, textAlign: "center" }}>{r.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Nearby on Your Street — real, near-always-populated discovery
                content. A brand-new account otherwise sees nothing but zeros
                (0 queues, 0 deals, 0 bookings) and "no active agreements yet",
                which reads as a broken/empty product rather than a fresh one. */}
            {(nearbyBiz.length > 0 || nearbyProv.length > 0) && (
              <div className="card" style={{ padding: 24, borderRadius: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--ink-900)", margin: 0 }}>Nearby on Your Street</h3>
                  <button className="see-all" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand-700)", border: "none", background: "none", cursor: "pointer" }} onClick={() => nav("/explore")}>Explore all &rarr;</button>
                </div>
                <div className="hscroll" style={{ padding: 0 }}>
                  {nearbyBiz.slice(0, 6).map((b) => <BusinessCardSmall key={b.id} b={b} />)}
                  {nearbyProv.slice(0, 6).map((p) => <ProviderCardSmall key={p.id} p={p} />)}
                </div>
              </div>
            )}

            {/* Recent Agreements Feed */}
            <div className="card" style={{ padding: 24, borderRadius: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--ink-900)", margin: 0 }}>Active Neighborhood Agreements</h3>
                <button className="see-all" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand-700)", border: "none", background: "none", cursor: "pointer" }} onClick={() => nav("/agreements")}>View all &rarr;</button>
              </div>
              {agreements.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--ink-400)" }}>
                  <span style={{ fontSize: 32, display: "block", marginBottom: 8 }}>🤝</span>
                  <p style={{ fontSize: 13, margin: 0 }}>No active service agreements on your street yet.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {agreements.slice(0, 3).map((a) => (
                    <div
                      key={a.id}
                      onClick={() => nav("/agreements")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 18px",
                        borderRadius: 14,
                        border: "1px solid var(--line)",
                        background: "#fff",
                        cursor: "pointer",
                        transition: "background 0.2s"
                      }}
                      className="activity-banner"
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 20 }}>🤝</span>
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-800)" }}>{a.requestTitle || "Street service request"}</div>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: a.status === "COMPLETED" ? "var(--green-500)" : "var(--brand-600)",
                            textTransform: "uppercase"
                          }}>{a.status}</span>
                        </div>
                      </div>
                      <ChevronRight size={18} color="var(--ink-400)" />
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Sidebar Widgets Column */}
          <div className="home-sidebar-col">
            
            {/* Active Queue Ticket widget */}
            {activeQueues.length > 0 && (
              <div className="card" style={{
                padding: "20px",
                borderRadius: 20,
                background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                border: "1.5px solid #93c5fd",
                position: "relative",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: 0.5 }}>Live queue slot</span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "pulse 1.5s infinite" }} />
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 32 }}>🎟️</span>
                  <div style={{ textAlign: "left" }}>
                    <h4 style={{ fontSize: 15, fontWeight: 800, color: "#1e3a8a", margin: 0 }}>{activeQueues[0].businessName}</h4>
                    <p style={{ fontSize: 12, color: "#1e40af", margin: "2px 0 0" }}>Position: <strong>#{activeQueues[0].position}</strong></p>
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-primary"
                  style={{ width: "100%", background: "#2563eb", border: "none", color: "#fff", fontWeight: 700, borderRadius: 10 }}
                  onClick={() => nav("/queues")}
                >
                  Track Queue Status
                </button>
              </div>
            )}

            {/* Location Sharing Security Panel */}
            <div className="card" style={{ padding: 20, borderRadius: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h4 style={{ fontSize: 14, fontWeight: 800, color: "var(--ink-900)", margin: 0 }}>Location Privacy</h4>
                <span style={{ fontSize: 16 }}>📍</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "0 0 14px", lineHeight: 1.4 }}>
                Control which neighbors can view your exact map pins. Approvals are strictly by request only.
              </p>
              
              {pendingLocReqs && pendingLocReqs.length > 0 ? (
                <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", padding: 12, borderRadius: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#92400e" }}>
                    ⚠️ {pendingLocReqs.length} Location Request{pendingLocReqs.length > 1 ? "s" : ""}
                  </div>
                  <button
                    className="btn btn-sm btn-amber"
                    style={{ width: "100%", background: "#d97706", color: "#fff", border: "none", marginTop: 8, borderRadius: 8, fontSize: 11.5 }}
                    onClick={() => nav("/settings")}
                  >
                    Review Access Requests
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--ink-50)", borderRadius: 12, marginBottom: 12 }}>
                  <span style={{ color: "var(--green-500)", fontWeight: 700, fontSize: 14 }}>✓</span>
                  <span style={{ fontSize: 12, color: "var(--ink-700)" }}>All sharing requests completed</span>
                </div>
              )}

              <button
                className="btn btn-sm btn-ghost"
                style={{ width: "100%", borderRadius: 10, fontSize: 12, border: "1px solid var(--line)" }}
                onClick={() => nav("/settings")}
              >
                Privacy Logs & History
              </button>
            </div>

            {/* Community Activity Board (Short listing) */}
            <div className="card" style={{ padding: 20, borderRadius: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h4 style={{ fontSize: 14, fontWeight: 800, color: "var(--ink-900)", margin: 0 }}>Street Stars Leaderboard</h4>
                <span style={{ fontSize: 16 }}>🏆</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "0 0 14px", lineHeight: 1.4 }}>
                View top contributing neighbors, review points, and street rankings.
              </p>
              <button
                className="btn btn-sm btn-primary"
                style={{ width: "100%", borderRadius: 10, fontSize: 12 }}
                onClick={() => nav("/leaderboard")}
              >
                View Leaderboard
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* Sheets */}
      {scanner && (
        <Suspense fallback={null}>
          <QrScannerSheet onClose={() => setScanner(false)} />
        </Suspense>
      )}
      {locationOpen && <LocationPickerSheet onClose={() => setLocationOpen(false)} />}
    </div>
  );
}
