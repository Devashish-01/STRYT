import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Map, SlidersHorizontal, MessageSquare } from "@/components/Icons";
import { catalogService, discoveryService, userService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { ListSkeleton, ErrorView, ExploreSkeleton } from "@/components/states";
import { BusinessCardWide, ProviderCard } from "@/components/cards";
import { EmptyState, PullToRefreshIndicator } from "@/components/common";
import { NoResultsIllustration } from "@/components/illustrations";
import { useApp } from "@/store";
import { forwardGeocode, type GeoPlace } from "@/lib/geocode";
import RadiusSelector from "@/components/RadiusSelector";
import { useI18n } from "@/lib/i18n";


type Tab = "all" | "business" | "provider";
type Sort = "nearby" | "rating" | "new";



export default function Explore() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { area, user, refreshUser, showToast, chatUnread } = useApp();
  const { t, tf } = useI18n();
  const [tab, setTab] = useState<Tab>("all");
  const [cat, setCat] = useState<string | null>(() => searchParams.get("cat"));

  useEffect(() => {
    const initial = searchParams.get("cat");
    if (initial) setCat(initial);
  }, []);
  const [sort, setSort] = useState<Sort>("nearby");
  
  const [radius, setRadius] = useState(() => {
    const saved = localStorage.getItem("settings_radius");
    return saved ? parseFloat(saved) : (user.notificationRadiusKm || 5);
  });

  useEffect(() => {
    localStorage.setItem("settings_radius", String(radius));
    if (user.id && radius !== user.notificationRadiusKm) {
      void userService.update({ notificationRadiusKm: radius }).catch(() => {});
    }
  }, [radius, user.id, user.notificationRadiusKm]);

  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);


  async function searchPlaces(q: string) {
    setLocQuery(q);
    if (q.trim().length < 2) { setLocResults([]); return; }
    setSearching(true);
    try {
      setLocResults(await forwardGeocode(q));
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }

  async function pickPlace(p: GeoPlace) {
    try {
      await userService.setLocation(p.lat, p.lng, p.area);
      await refreshUser();
      setLocQuery("");
      setLocResults([]);
      showToast(tf("explore_location_set", { area: p.area }));
    } catch {
      showToast(t("explore_location_failed"));
    }
  }

  const { data: categories } = useQuery(() => catalogService.getCategories(), [], "categories");
  const { data: bizPage, loading: bizLoading, error: bizError, refetch: refetchBiz } = useQuery(
    () => discoveryService.businesses({
      category: cat ?? undefined,
      sort,
      radius,
      lat: user.lat || undefined,
      lng: user.lng || undefined,
    }),
    [cat, sort, radius, user.lat, user.lng]
  );
  const { data: provPage, loading: provLoading, refetch: refetchProv } = useQuery(
    () => discoveryService.providers({
      category: cat ?? undefined,
      sort,
      radius,
      lat: user.lat || undefined,
      lng: user.lng || undefined,
    }),
    [cat, sort, radius, user.lat, user.lng]
  );

  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh<HTMLDivElement>(async () => {
    refetchBiz();
    refetchProv();
  });

  const biz = bizPage?.data ?? [];
  const prov = provPage?.data ?? [];
  const catTree = categories ?? [];
  const loading = bizLoading || provLoading;

  const showBiz = tab === "all" || tab === "business";
  const showProv = tab === "all" || tab === "provider";
  const empty = (showBiz ? biz.length : 0) + (showProv ? prov.length : 0) === 0;

  return (
    <div className="screen screen-boxed with-nav explore-screen-wrapper">
      <div className="explore-main-layout">
        
        {/* Left Side: Desktop Filter Panel (Visible only on desktop) */}
        <div className="explore-desktop-filters desktop-only">
          <div className="filters-header">
            <h3>{t("explore_filters")}</h3>
            <span className="tiny muted">{tf("explore_near", { area })}</span>
          </div>

          {/* Location search input */}
          <div className="filter-section">
            <label className="filter-label">{t("explore_change_location")}</label>
            <div style={{ position: "relative" }}>
              <Search size={14} color="var(--ink-400)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input
                type="text"
                className="input"
                value={locQuery}
                placeholder={t("explore_search_address")}
                onChange={(e) => searchPlaces(e.target.value)}
                style={{ width: "100%", paddingLeft: "32px", fontSize: 13, borderRadius: 10, background: "var(--ink-50)", border: "1.5px solid var(--ink-200)" }}
              />
              {locQuery && (
                <button
                  onClick={() => { setLocQuery(""); setLocResults([]); }}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    border: "none", background: "transparent", color: "var(--ink-400)", cursor: "pointer",
                    fontSize: 16, fontWeight: 700
                  }}
                >
                  &times;
                </button>
              )}
              {locResults.length > 0 && (
                <div className="search-dropdown">
                  {locResults.map((r, idx) => (
                    <button
                      key={idx}
                      onClick={() => pickPlace(r)}
                      className="dropdown-item"
                    >
                      <div className="bold">{r.area}</div>
                      <div className="tiny muted ellipsis">{r.full}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* View Tab Selector */}
          <div className="filter-section">
            <label className="filter-label">{t("explore_browse_type")}</label>
            <div className="desktop-tabs">
              {([["all", t("explore_tab_all")], ["business", t("explore_tab_shops")], ["provider", t("explore_tab_helpers")]] as [Tab, string][]).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  onClick={() => setTab(tabKey)}
                  className={`tab-btn ${tab === tabKey ? "active" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Radius selector */}
          <div className="filter-section">
            <RadiusSelector
              value={radius}
              onChange={setRadius}
              accentColor="var(--brand-600)"
              label={t("explore_search_radius")}
            />
          </div>

          {/* Categories Sidebar List */}
          <div className="filter-section">
            <label className="filter-label">{t("explore_categories")}</label>
            <div className="desktop-categories-list">
              <button className={`category-item-btn ${!cat ? "active" : ""}`} onClick={() => setCat(null)}>
                <span>{t("explore_show_all")}</span>
              </button>
              {catTree.map((c) => (
                <button
                  key={c.id}
                  className={`category-item-btn ${cat === c.id ? "active" : ""}`}
                  onClick={() => setCat(cat === c.id ? null : c.id)}
                >
                  <span style={{ marginRight: 6 }}>{c.icon}</span>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Main explore listings */}
        <div className="explore-listings-feed">
          {/* Mobile-only app bar (hidden on desktop) */}
          <header className="appbar mobile-only" style={{ flexDirection: "column", alignItems: "stretch", gap: 12, paddingBottom: 0, background: "transparent", borderBottom: "none", boxShadow: "none", padding: 0 }}>
            <div className="row between">
              <div className="col" style={{ gap: 0 }}>
                <span className="bold" style={{ fontSize: 20 }}>{t("explore")}</span>
                <span className="tiny muted">{tf("explore_near", { area })}</span>
              </div>
              <div className="row gap-8">
                <button className="icon-btn" onClick={() => nav("/search")}><Search size={20} /></button>
                <button className="icon-btn" onClick={() => nav("/map")}><Map size={20} /></button>
                <button className="icon-btn" style={{ position: "relative" }} onClick={() => nav("/chats?scope=CUSTOMER")} aria-label={t("explore_chats_aria")}>
                  <MessageSquare size={20} />
                  {chatUnread > 0 && (
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      width: 8, height: 8, background: "var(--red-500)",
                      borderRadius: "50%", border: "2px solid rgba(0,0,0,0.2)",
                    }} />
                  )}
                </button>
              </div>
            </div>

            {/* Remote location setting picker (mobile only) */}
            <div style={{ position: "relative", marginTop: 2, marginBottom: 2 }}>
              <Search size={14} color="var(--ink-400)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input
                type="text"
                className="input"
                value={locQuery}
                placeholder={t("explore_search_address_area")}
                onChange={(e) => searchPlaces(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--ink-50)",
                  border: "1.5px solid var(--ink-200)",
                  borderRadius: 12,
                  padding: "7px 12px",
                  paddingLeft: "32px",
                  paddingRight: locQuery ? "32px" : "12px",
                  fontSize: 12.5,
                  fontWeight: 500,
                  outline: "none"
                }}
              />
              {locQuery && (
                <button
                  onClick={() => { setLocQuery(""); setLocResults([]); }}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    border: "none", background: "transparent", color: "var(--ink-400)", cursor: "pointer",
                    fontSize: 16, fontWeight: 700
                  }}
                >
                  &times;
                </button>
              )}

              {locResults.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                  background: "#fff", borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                  border: "1px solid var(--line)", overflow: "hidden", zIndex: 1010
                }}>
                  {locResults.map((r, idx) => (
                    <button
                      key={idx}
                      onClick={() => pickPlace(r)}
                      style={{
                        width: "100%", padding: "10px 12px", border: "none", background: "none",
                        textAlign: "left", fontSize: 12, color: "var(--ink-800)", borderBottom: idx < locResults.length - 1 ? "1px solid var(--line)" : "none",
                        cursor: "pointer", display: "block"
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "var(--ink-900)" }}>{r.area}</div>
                      <div style={{ fontSize: 10, color: "var(--ink-500)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.full}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tabs (mobile only) */}
            <div className="row" style={{ borderBottom: "1px solid var(--line)" }}>
              {([["all", t("explore_tab_all")], ["business", t("explore_tab_businesses")], ["provider", t("explore_tab_providers")]] as [Tab, string][]).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  onClick={() => setTab(tabKey)}
                  className="semi"
                  style={{
                    flex: 1,
                    padding: "12px 0",
                    fontSize: 14,
                    color: tab === tabKey ? "var(--brand-700)" : "var(--ink-500)",
                    borderBottom: tab === tabKey ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>

          <div ref={containerRef} className="explore-listings-scroll">
            <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} threshold={threshold} />
            {/* Mobile Category chips horizontal scroll & Radius Selector (mobile only) */}
            <div className="mobile-only">
              <div className="hscroll" style={{ paddingTop: 12 }}>
                <button className={`chip ${!cat ? "active" : ""}`} onClick={() => setCat(null)}>{t("explore_tab_all")}</button>
                {catTree.map((c) => (
                  <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} onClick={() => setCat(cat === c.id ? null : c.id)}>
                    {c.icon} {c.name.split(" ")[0]}
                  </button>
                ))}
              </div>
              <div className="page-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
                <RadiusSelector
                  value={radius}
                  onChange={setRadius}
                  accentColor="var(--brand-600)"
                  label={t("explore_radius_label")}
                />
              </div>
            </div>

            {/* Results Grid Title & Count */}
            <div className="listings-grid-header desktop-only">
              <h2>{tab === "all" ? t("explore_title_all") : tab === "business" ? t("explore_title_business") : t("explore_title_provider")}</h2>
              <span className="results-count muted small">
                {loading ? t("explore_searching") : tf("explore_matches_found", { count: (showBiz ? biz.length : 0) + (showProv ? prov.length : 0) })}
              </span>
            </div>

            {/* Results */}
            {loading ? (
              <ExploreSkeleton tab={tab} />
            ) : bizError ? (
              <ErrorView error={bizError} onRetry={refetchBiz} />
            ) : (
              <div className="listings-cards-grid">
                {empty && (
                  <EmptyState
                    illustration={<NoResultsIllustration />}
                    emoji="🔍"
                    title={t("explore_empty_title")}
                    text={t("explore_empty_text")}
                    action={<button className="btn btn-ghost btn-sm" onClick={() => { setCat(null); setRadius(15); }}>{t("explore_reset_filters")}</button>}
                  />
                )}
                {showProv && prov.map((p, idx) => <ProviderCard key={p.id} p={p} style={{ animationDelay: `${idx * 35}ms` }} />)}
                {showBiz && biz.map((b, idx) => <BusinessCardWide key={b.id} b={b} style={{ animationDelay: `${idx * 35}ms` }} />)}
              </div>
            )}
            <div style={{ height: 24 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
