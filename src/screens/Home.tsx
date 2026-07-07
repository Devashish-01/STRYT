import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, ChevronDown, ChevronRight, X, QrCode, MessageSquare } from "@/components/Icons";
import { useApp } from "@/store";
import { catalogService, requestService, appointmentService, businessService, locationService, discoveryService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { StoriesBar } from "@/components/Stories";
import { BusinessCardSmall, ProviderCardSmall } from "@/components/cards";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import { firstName as safeFirstName } from "@/lib/publicName";
import { getRecentlyViewed } from "@/lib/recentlyViewed";
import LocationPickerSheet from "@/components/LocationPickerSheet";
import { SafeImg, PullToRefreshIndicator } from "@/components/common";

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
  const { data: agreementsList, refetch: refetchAgreements } = useQuery(() => requestService.agreements(), []);
  // Real, always-populated discovery content — the dashboard shouldn't rely
  // solely on conditional "you have an active X" cards to feel complete.
  const { data: nearbyBizPage, refetch: refetchNearbyBiz } = useQuery(
    () => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined, sort: "nearby" }),
    [user.lat, user.lng]
  );
  const { data: nearbyProvPage, refetch: refetchNearbyProv } = useQuery(
    () => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined, sort: "nearby" }),
    [user.lat, user.lng]
  );
  const { data: myAppointments, refetch: refetchAppointments } = useQuery(() => appointmentService.listForCustomer(user.id), [user.id]);
  const { data: myQueuesData, refetch: refetchQueues } = useQueryWithRealtime(() => businessService.myQueues(), "queue_tokens", []);
  const { data: pendingLocReqs, refetch: refetchPendingLoc } = useQueryWithRealtime(() => locationService.pendingForMe(), "location_share_grants", []);

  const handleRefresh = async () => {
    await Promise.allSettled([
      refetchCategories(),
      refetchAgreements(),
      refetchNearbyBiz(),
      refetchNearbyProv(),
      refetchAppointments(),
      refetchQueues(),
      refetchPendingLoc(),
    ]);
  };

  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh<HTMLDivElement>(handleRefresh);

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
    { emoji: "🧭", label: "Explore", sub: "Shops & people", tint: "var(--brand-100)", color: "var(--blue-500)", onClick: () => nav("/explore") },
    { emoji: "🏘️", label: "Community", sub: "Street feed", tint: "var(--ink-50)", color: "var(--pink-500)", onClick: () => nav("/community-hub"), badge: chatUnread || undefined },
    { emoji: "🤝", label: "My deals", sub: activeAgreements.length > 0 ? `${activeAgreements.length} active` : "Agreements", tint: "var(--green-100)", color: "var(--green-500)", onClick: () => nav("/agreements"), badge: activeAgreements.length || undefined },
    { emoji: "📅", label: "Appointments", sub: upcomingCount > 0 ? `${upcomingCount} upcoming` : "Your bookings", tint: "var(--brand-50)", color: "var(--brand-600)", onClick: () => nav("/appointments"), badge: upcomingCount || undefined },
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
                    width: 8, height: 8, background: "var(--accent-500)",
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
              background: "linear-gradient(135deg, var(--amber-100), var(--amber-100))",
              borderBottom: "1px solid var(--amber-500)",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 16 }}>📍</span>
            <span className="small grow" style={{ color: "var(--amber-700)", fontWeight: 700 }}>
              {pendingLocReqs.length} neighbor{pendingLocReqs.length > 1 ? "s want" : " wants"} to see your location
            </span>
            <span className="tiny semi" style={{ color: "var(--amber-700)", background: "rgba(255,255,255,0.5)", padding: "3px 8px", borderRadius: 12 }}>
              Manage
            </span>
          </div>
        )}

        <div ref={containerRef} className="screen-scroll" style={{ background: theme.bgGradient, transition: "background 0.6s ease", flex: 1 }}>
          <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} threshold={threshold} />
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
                {orderedCategories.map((c, idx) => (
                  <button
                    key={c.id}
                    className="col center fade-up"
                    style={{ gap: 5, flexShrink: 0, width: 64, background: "none", border: "none", cursor: "pointer", animationDelay: `${idx * 35}ms` }}
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
              {tiles.map((t, idx) => (
                <button key={t.label} className="launch-tile fade-up" onClick={t.onClick} style={{ border: "none", cursor: "pointer", animationDelay: `${idx * 35}ms` }}>
                  {t.badge ? <span className="count-badge launch-tile-badge">{t.badge > 9 ? "9+" : t.badge}</span> : null}
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
                  background: "linear-gradient(135deg, var(--ink-50), var(--ink-100))",
                  border: "1.5px solid var(--ink-300)",
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
                    background: "var(--blue-500)",
                    opacity: 0.15,
                    animation: "pulse 1.8s ease-in-out infinite",
                  }} />
                  <span style={{ fontSize: 22 }}>🎟️</span>
                </span>
                <div className="grow" style={{ textAlign: "left" }}>
                  <div className="row gap-6" style={{ alignItems: "center" }}>
                    <span className="semi small" style={{ color: "var(--blue-500)" }}>Live Queue</span>
                    <span style={{
                      background: "var(--red-500)",
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
                <ChevronRight size={18} color="var(--blue-500)" />
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
                  <div className="semi small" style={{ color: "var(--green-600)" }}>
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
          DESKTOP DASHBOARD — the mobile "Launchpad" IA, widened.
          Same sections and component vocabulary as the mobile view
          (hero → launch tiles → live banners → discovery), laid out
          in a two-column grid so it reads as the SAME product, not a
          separate console.
         ========================================================== */}
      <div className="desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", width: "100%", padding: "24px 32px", boxSizing: "border-box", background: theme.bgGradient }}>

        {/* Header — mirrors the mobile header actions (location, chat, bell, search, QR) */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginBottom: 22 }}>
          <div>
            <span className="tiny" style={{ color: "var(--ink-500)", fontWeight: 600 }}>
              {theme.greeting}{firstName ? `, ${firstName}` : ""}
            </span>
            <button
              onClick={() => setLocationOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, marginTop: 2, cursor: "pointer", color: "var(--ink-900)", fontSize: 20, fontWeight: 800 }}
            >
              <span>{area}</span>
              <ChevronDown size={18} color="var(--brand-600)" />
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
            <button
              onClick={() => nav("/search")}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, border: "1px solid var(--line)", background: "#fff", cursor: "pointer", fontSize: 13, color: "var(--ink-500)", minWidth: 240, textAlign: "left" }}
            >
              <Search size={16} />
              <span>Search "biryani", "plumber"…</span>
            </button>
            <button className="icon-btn" style={{ background: "#fff", border: "1px solid var(--line)", position: "relative" }} onClick={() => nav("/chats")} aria-label="Chats">
              <MessageSquare size={18} />
              {chatUnread > 0 && <span className="count-badge btn-badge">{chatUnread > 9 ? "9+" : chatUnread}</span>}
            </button>
            <button className="icon-btn" style={{ background: "#fff", border: "1px solid var(--line)", position: "relative" }} onClick={() => nav("/notifications")} aria-label="Notifications">
              <Bell size={18} />
              {unreadCount > 0 && <span className="count-badge btn-badge count-badge-accent">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>
            <button className="icon-btn" style={{ background: "var(--brand-600)", color: "#fff" }} onClick={() => setScanner(true)} aria-label="Scan QR">
              <QrCode size={18} />
            </button>
          </div>
        </header>

        {/* Contextual banners — same triggers as mobile */}
        {showBanner && (
          <button
            onClick={() => setBannerDismissed(true)}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: theme.accent + "14", border: `1px solid ${theme.accent}33`, borderRadius: 14, padding: "10px 16px", marginBottom: 16, cursor: "pointer" }}
          >
            <span className="small grow" style={{ color: theme.accent, fontWeight: 600 }}>{theme.banner}</span>
            <X size={15} color={theme.accent} style={{ opacity: 0.6 }} />
          </button>
        )}
        {pendingLocReqs && pendingLocReqs.length > 0 && (
          <button
            onClick={() => nav("/settings")}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "linear-gradient(135deg, var(--amber-100), var(--amber-100))", border: "1px solid var(--amber-500)", borderRadius: 14, padding: "10px 16px", marginBottom: 16, cursor: "pointer" }}
          >
            <span style={{ fontSize: 16 }}>📍</span>
            <span className="small grow" style={{ color: "var(--amber-700)", fontWeight: 700 }}>
              {pendingLocReqs.length} neighbor{pendingLocReqs.length > 1 ? "s want" : " wants"} to see your location
            </span>
            <span className="tiny semi" style={{ color: "var(--amber-700)", background: "rgba(255,255,255,0.5)", padding: "3px 10px", borderRadius: 12 }}>Manage</span>
          </button>
        )}

        <div className="home-dashboard-grid" style={{ padding: 0 }}>

          {/* ── Main column — the Launchpad ── */}
          <div className="home-main-col">

            {/* "Need something?" hero — identical to mobile */}
            <button className="launch-hero" onClick={() => nav("/ask")} style={{ border: "none", cursor: "pointer" }}>
              <span className="launch-hero-icon">📋</span>
              <div className="grow" style={{ textAlign: "left" }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Need something?</div>
                <div style={{ fontSize: 13.5, opacity: 0.92, marginTop: 2 }}>Ask your street — get offers from nearby people, shops & providers</div>
              </div>
              <ChevronRight size={22} style={{ opacity: 0.9, flexShrink: 0 }} />
            </button>

            {/* Launch tiles — same four as mobile, one row of four on desktop */}
            <div className="launch-grid">
              {tiles.map((t, idx) => (
                <button key={t.label} className="launch-tile fade-up" onClick={t.onClick} style={{ border: "none", cursor: "pointer", animationDelay: `${idx * 35}ms` }}>
                  {t.badge ? <span className="count-badge launch-tile-badge">{t.badge > 9 ? "9+" : t.badge}</span> : null}
                  <span className="launch-tile-icon" style={{ background: t.tint, color: t.color }}>{t.emoji}</span>
                  <div style={{ textAlign: "left" }}>
                    <div className="launch-tile-label">{t.label}</div>
                    <div className="launch-tile-sub">{t.sub}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Browse categories — same horizontal rail as mobile */}
            {orderedCategories.length > 0 && (
              <div className="card" style={{ padding: 20 }}>
                <div className="row between" style={{ marginBottom: 14 }}>
                  <span className="semi" style={{ fontSize: 15 }}>Browse</span>
                  <button className="see-all" style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => nav("/categories")}>All categories</button>
                </div>
                <div className="hscroll" style={{ padding: 0 }}>
                  {orderedCategories.map((c, idx) => (
                    <button
                      key={c.id}
                      className="col center fade-up"
                      style={{ gap: 6, flexShrink: 0, width: 72, background: "none", border: "none", cursor: "pointer", animationDelay: `${idx * 35}ms` }}
                      onClick={() => nav(`/category/${c.id}`)}
                    >
                      <div style={{ width: 56, height: 56, borderRadius: 16, background: `${c.color}1a`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
                        {c.icon}
                      </div>
                      <span className="tiny semi" style={{ textAlign: "center", lineHeight: 1.2 }}>{c.name.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Nearby on Your Street — discovery content the wide canvas can afford */}
            {(nearbyBiz.length > 0 || nearbyProv.length > 0) && (
              <div className="card" style={{ padding: 20 }}>
                <div className="row between" style={{ marginBottom: 14 }}>
                  <span className="semi" style={{ fontSize: 15 }}>Nearby on your street</span>
                  <button className="see-all" style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => nav("/explore")}>Explore all</button>
                </div>
                <div className="hscroll" style={{ padding: 0 }}>
                  {nearbyBiz.slice(0, 6).map((b, idx) => <BusinessCardSmall key={b.id} b={b} style={{ animationDelay: `${idx * 35}ms` }} />)}
                  {nearbyProv.slice(0, 6).map((p, idx) => <ProviderCardSmall key={p.id} p={p} style={{ animationDelay: `${idx * 35}ms` }} />)}
                </div>
              </div>
            )}

            {/* Recently viewed */}
            {recentlyViewed.length > 0 && (
              <div className="card" style={{ padding: 20 }}>
                <span className="semi" style={{ fontSize: 15, display: "block", marginBottom: 14 }}>Recently viewed</span>
                <div className="hscroll" style={{ padding: 0 }}>
                  {recentlyViewed.map((r) => (
                    <button
                      key={`${r.type}:${r.id}`}
                      className="col center"
                      style={{ gap: 6, width: 72, flexShrink: 0, background: "none", border: "none", cursor: "pointer" }}
                      onClick={() => nav(r.type === "business" ? `/business/${r.id}` : `/provider/${r.id}`)}
                    >
                      <SafeImg src={r.image} variant={r.type === "provider" ? "avatar" : "photo"} style={{ width: 56, height: 56, borderRadius: r.type === "provider" ? "50%" : 12, objectFit: "cover" }} />
                      <span className="tiny semi ellipsis" style={{ maxWidth: 68, textAlign: "center" }}>{r.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty street CTA — same as mobile, for brand-new accounts */}
            {agreements.length === 0 && (categories ?? []).length === 0 && nearbyBiz.length === 0 && nearbyProv.length === 0 && (
              <div className="card col center" style={{ padding: 40, gap: 12, textAlign: "center", background: "linear-gradient(135deg, var(--brand-50), #fff)" }}>
                <span style={{ fontSize: 52 }}>🏘️</span>
                <div className="bold" style={{ fontSize: 18 }}>Your street is just getting started</div>
                <p className="small muted" style={{ maxWidth: 320, lineHeight: 1.5 }}>Be among the first to list a spot, offer a service, or post a request.</p>
                <div className="row gap-10" style={{ marginTop: 4 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => nav("/onboard/business")}>List a spot</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => nav("/ask")}>Post a request</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Sidebar — the mobile "live" banners as sticky cards ── */}
          <div className="home-sidebar-col">

            {/* Live queue — same content as mobile's live-queue ticket */}
            {activeQueues.length > 0 && (
              <button
                className="activity-banner"
                style={{ width: "100%", background: "linear-gradient(135deg, var(--ink-50), var(--ink-100))", border: "1.5px solid var(--ink-300)", cursor: "pointer" }}
                onClick={() => nav("/queues")}
              >
                <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, flexShrink: 0 }}>
                  <span style={{ position: "absolute", width: 38, height: 38, borderRadius: "50%", background: "var(--blue-500)", opacity: 0.15, animation: "pulse 1.8s ease-in-out infinite" }} />
                  <span style={{ fontSize: 22 }}>🎟️</span>
                </span>
                <div className="grow" style={{ textAlign: "left" }}>
                  <div className="row gap-6" style={{ alignItems: "center" }}>
                    <span className="semi small" style={{ color: "var(--blue-500)" }}>Live Queue</span>
                    <span style={{ background: "var(--red-500)", color: "#fff", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "1px 7px", lineHeight: "18px" }}>LIVE</span>
                  </div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    {activeQueues.length === 1
                      ? `${activeQueues[0].businessName} · position #${activeQueues[0].position} — tap to track`
                      : `You're in ${activeQueues.length} queues — tap to track`}
                  </div>
                </div>
                <ChevronRight size={18} color="var(--blue-500)" />
              </button>
            )}

            {/* Active deals — same as mobile's active-agreements banner */}
            {activeAgreements.length > 0 && (
              <button className="activity-banner" style={{ width: "100%", border: "none", cursor: "pointer" }} onClick={() => nav("/agreements")}>
                <span style={{ fontSize: 22 }}>🤝</span>
                <div className="grow" style={{ textAlign: "left" }}>
                  <div className="semi small" style={{ color: "var(--green-600)" }}>
                    {activeAgreements.length} active {activeAgreements.length === 1 ? "deal" : "deals"}
                  </div>
                  <div className="tiny muted">Tap to track progress →</div>
                </div>
                <ChevronRight size={18} color="var(--green-500)" />
              </button>
            )}

            {/* Leaderboard — same entry point as mobile */}
            <button className="activity-banner" style={{ width: "100%", border: "none", cursor: "pointer" }} onClick={() => nav("/leaderboard")}>
              <span style={{ fontSize: 22 }}>🏆</span>
              <div className="grow" style={{ textAlign: "left" }}>
                <div className="semi small">Leaderboard</div>
                <div className="tiny muted">Top contributors on your street →</div>
              </div>
              <ChevronRight size={18} color="var(--ink-400)" />
            </button>

            {/* Location privacy quick access */}
            <button className="activity-banner" style={{ width: "100%", border: "none", cursor: "pointer" }} onClick={() => nav("/settings")}>
              <span style={{ fontSize: 22 }}>📍</span>
              <div className="grow" style={{ textAlign: "left" }}>
                <div className="semi small">Location privacy</div>
                <div className="tiny muted">
                  {pendingLocReqs && pendingLocReqs.length > 0
                    ? `${pendingLocReqs.length} request${pendingLocReqs.length > 1 ? "s" : ""} to review →`
                    : "Who can see your pins →"}
                </div>
              </div>
              <ChevronRight size={18} color="var(--ink-400)" />
            </button>
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
