import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Map, MessageSquare, ChevronDown, ArrowLeft } from "@/components/Icons";
import { catalogService, discoveryService, userService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { ErrorView, ExploreSkeleton } from "@/components/states";
import { BusinessCardWide, ProviderCard } from "@/components/cards";
import RequestsFeedPanel from "@/components/RequestsFeedPanel";
import { EmptyState, PullToRefreshIndicator, ButtonSpinner } from "@/components/common";
import { NoResultsIllustration } from "@/components/illustrations";
import { useApp } from "@/store";
import { forwardGeocode, type GeoPlace } from "@/lib/geocode";
import RadiusSelector from "@/components/RadiusSelector";
import SortMenu from "@/components/SortMenu";
import { useI18n } from "@/lib/i18n";
import { useSmartBack } from "@/hooks/useSmartBack";
import { haptics } from "@/lib/haptics";
import type { Business, Provider } from "@/types";

type Tab = "all" | "business" | "provider" | "requests";
type Sort = "nearby" | "rating" | "new";

function tabFromParam(v: string | null): Tab {
  return v === "business" || v === "provider" || v === "requests" ? v : "all";
}

type ExploreItem =
  | { kind: "business"; data: Business }
  | { kind: "provider"; data: Provider };

// The All tab shows both entity types in one scroll — when ranked by
// distance (the "nearby" sort) they should read as one blended list, not a
// block of every provider followed by a block of every business. Only
// applies when sort === "nearby": rating/new have their own ordering that a
// hardcoded distance sort would silently override.
function mergeByDistance(businesses: Business[], providers: Provider[]): ExploreItem[] {
  const items: ExploreItem[] = [
    ...businesses.map((b): ExploreItem => ({ kind: "business", data: b })),
    ...providers.map((p): ExploreItem => ({ kind: "provider", data: p })),
  ];
  return items.sort((a, b) => (a.data.distanceKm ?? Infinity) - (b.data.distanceKm ?? Infinity));
}

// The address search input + results dropdown was duplicated near-verbatim
// between the desktop sidebar and the mobile inline block — one shared
// component instead, with a consistent look for both (fixes the desktop
// version's raw #fff background too, now a token like everywhere else here).
function LocationSearchBox({
  value, onChange, onClear, results, onPick, searching, placeholder,
}: {
  value: string;
  onChange: (q: string) => void;
  onClear: () => void;
  results: GeoPlace[];
  onPick: (p: GeoPlace) => void;
  searching: boolean;
  placeholder: string;
}) {
  const { t } = useI18n();
  const showDropdown = value.trim().length >= 2 && !searching;
  return (
    <div style={{ position: "relative" }}>
      <Search size={14} color="var(--ink-400)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      <input
        type="text"
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", paddingLeft: 32, paddingRight: value ? 32 : 12, fontSize: 13, borderRadius: "var(--radius-sm)", background: "var(--ink-50)", border: "1.5px solid var(--ink-200)" }}
      />
      {searching ? (
        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }}>
          <ButtonSpinner />
        </span>
      ) : value && (
        <button
          onClick={onClear}
          style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            border: "none", background: "transparent", color: "var(--ink-400)", cursor: "pointer",
            fontSize: 16, fontWeight: 700
          }}
        >
          &times;
        </button>
      )}
      {showDropdown && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: "var(--space-xxs)",
          background: "var(--surface)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--line)", overflow: "hidden", zIndex: 1010, maxHeight: 240, overflowY: "auto",
        }}>
          {results.length > 0 ? (
            results.map((r, idx) => (
              <button
                key={idx}
                onClick={() => onPick(r)}
                style={{
                  width: "100%", padding: "10px 12px", border: "none", background: "none",
                  textAlign: "left", cursor: "pointer", display: "block",
                  borderBottom: idx < results.length - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <div className="bold" style={{ fontSize: 12, color: "var(--ink-900)" }}>{r.area}</div>
                <div className="tiny muted ellipsis" style={{ marginTop: 2 }}>{r.full}</div>
              </button>
            ))
          ) : (
            <div style={{ padding: "10px 12px" }}>
              <span className="tiny muted">{t("explore_location_no_matches")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Radius as a compact pill — tapping it drops down the existing RadiusSelector
// (unchanged, still shared with every other screen that uses it) instead of
// leaving the full preset row permanently visible above the results.
function RadiusDropdown({
  value, onChange, accentColor = "var(--brand-600)", label, align = "right",
}: {
  value: number;
  onChange: (v: number) => void;
  accentColor?: string;
  label: string;
  /** Which side the popover hangs from — "right" (default, for a button sitting
   *  near the right edge of a row) or "left" (for the narrow desktop sidebar,
   *  where opening rightward into the main content area is what has room). */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const valueLabel = value >= 5000 ? "🌍 World" : value === 0.5 ? "500m" : `${value} km`;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="chip"
        style={{ gap: 6 }}
        onClick={() => { haptics.selection(); setOpen((v) => !v); }}
      >
        📍 {valueLabel}
        <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", [align]: 0, zIndex: 1010, width: "min(280px, calc(100vw - 32px))" }}>
          <RadiusSelector
            value={value}
            onChange={(v) => { onChange(v); setOpen(false); }}
            accentColor={accentColor}
            label={label}
          />
        </div>
      )}
    </div>
  );
}

export default function Explore() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { area, user, refreshUser, showToast, chatUnread } = useApp();
  const { t, tf } = useI18n();
  const goBack = useSmartBack("/home");
  // ?tab=requests lands straight on the Requests tab — the deep link Profile's
  // "My requests" tile, AskCompose's post-submit redirect, and the
  // Neighborhood Today digest signal all use now that request browsing no
  // longer has its own screen. Same lazy-initializer pattern CommunityHub
  // uses for its own ?view=deals.
  const [tab, setTab] = useState<Tab>(() => tabFromParam(searchParams.get("tab")));
  const [cat, setCat] = useState<string | null>(() => searchParams.get("cat"));

  // Re-sync whenever the URL's ?cat=/?tab= actually change (e.g. navigating to
  // /explore?cat=Y while already mounted on /explore) — searchParams only
  // gets a new reference on real navigation, never on local state changes
  // from the chips/tabs below, so this can't fight a tap.
  useEffect(() => {
    const fromUrl = searchParams.get("cat");
    if (fromUrl !== cat) setCat(fromUrl);
    const tabFromUrl = tabFromParam(searchParams.get("tab"));
    if (tabFromUrl !== tab) setTab(tabFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [sort, setSort] = useState<Sort>("nearby");
  
  const [radius, setRadius] = useState(() => {
    const saved = localStorage.getItem("settings_radius");
    return saved ? parseFloat(saved) : (user.notificationRadiusKm || 5);
  });

  useEffect(() => {
    localStorage.setItem("settings_radius", String(radius));
    if (user.id && radius !== user.notificationRadiusKm) {
      void userService.update({ notificationRadiusKm: radius }).catch(() => {
        showToast(t("explore_radius_save_failed"));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      showToast(t("explore_location_search_failed"));
    } finally {
      setSearching(false);
    }
  }

  async function pickPlace(p: GeoPlace) {
    haptics.selection();
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

  // Categories are a single universal filter shown once, above the tabs —
  // one merged tree rather than swapping between a BUSINESS-only and
  // SERVICE-only list depending on which tab happens to be active, since
  // picking a category should mean the same thing no matter which tab you
  // then view it through; the tabs just lens the results, same as radius
  // already does. Own cache key (not the plain "categories" key
  // AllCategories/CategoryListing use) — those expect the exact same
  // unfiltered tree, but the cache is a bare string->value map, so sharing
  // the key would let either screen's fetch silently overwrite the other's
  // cache entry.
  const { data: categories } = useQuery(() => catalogService.getCategories(), [], "cat_tree:explore");
  const exploreGeoKey = `${(user.lat ?? 0).toFixed(2)}:${(user.lng ?? 0).toFixed(2)}`;
  const { data: bizPage, loading: bizLoading, error: bizError, refetch: refetchBiz } = useQuery(
    () => discoveryService.businesses({
      category: cat ?? undefined,
      sort,
      radius,
      lat: user.lat || undefined,
      lng: user.lng || undefined,
    }),
    [cat, sort, radius, user.lat, user.lng],
    `explore:biz:${cat ?? "all"}:${sort}:${radius}:${exploreGeoKey}`
  );
  const { data: provPage, loading: provLoading, error: provError, refetch: refetchProv } = useQuery(
    () => discoveryService.providers({
      category: cat ?? undefined,
      sort,
      radius,
      lat: user.lat || undefined,
      lng: user.lng || undefined,
    }),
    [cat, sort, radius, user.lat, user.lng],
    `explore:prov:${cat ?? "all"}:${sort}:${radius}:${exploreGeoKey}`
  );

  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh<HTMLDivElement>(async () => {
    refetchBiz();
    refetchProv();
  });

  // Load-more pagination — same extra/cursor/hasMore idiom as Requests.tsx,
  // doubled since the All tab blends two independent entity feeds.
  const [extraBiz, setExtraBiz] = useState<Business[]>([]);
  const [bizCursor, setBizCursor] = useState<string | null>(null);
  const [bizHasMore, setBizHasMore] = useState(false);
  const [loadingMoreBiz, setLoadingMoreBiz] = useState(false);
  const [extraProv, setExtraProv] = useState<Provider[]>([]);
  const [provCursor, setProvCursor] = useState<string | null>(null);
  const [provHasMore, setProvHasMore] = useState(false);
  const [loadingMoreProv, setLoadingMoreProv] = useState(false);

  useEffect(() => {
    setExtraBiz([]);
    setBizCursor(bizPage?.page?.next_cursor ?? null);
    setBizHasMore(bizPage?.page?.has_more ?? false);
  }, [bizPage]);
  useEffect(() => {
    setExtraProv([]);
    setProvCursor(provPage?.page?.next_cursor ?? null);
    setProvHasMore(provPage?.page?.has_more ?? false);
  }, [provPage]);

  async function loadMoreBiz() {
    if (!bizCursor || loadingMoreBiz) return;
    setLoadingMoreBiz(true);
    try {
      const next = await discoveryService.businesses({ category: cat ?? undefined, sort, radius, lat: user.lat || undefined, lng: user.lng || undefined, cursor: bizCursor });
      setExtraBiz((prev) => [...prev, ...next.data]);
      setBizCursor(next.page?.next_cursor ?? null);
      setBizHasMore(next.page?.has_more ?? false);
    } catch {
      showToast(t("explore_load_more_failed"));
    } finally {
      setLoadingMoreBiz(false);
    }
  }
  async function loadMoreProv() {
    if (!provCursor || loadingMoreProv) return;
    setLoadingMoreProv(true);
    try {
      const next = await discoveryService.providers({ category: cat ?? undefined, sort, radius, lat: user.lat || undefined, lng: user.lng || undefined, cursor: provCursor });
      setExtraProv((prev) => [...prev, ...next.data]);
      setProvCursor(next.page?.next_cursor ?? null);
      setProvHasMore(next.page?.has_more ?? false);
    } catch {
      showToast(t("explore_load_more_failed"));
    } finally {
      setLoadingMoreProv(false);
    }
  }

  const biz = [...(bizPage?.data ?? []), ...extraBiz];
  const prov = [...(provPage?.data ?? []), ...extraProv];
  const catTree = categories ?? [];
  // requestService.feed()'s category filter matches on category NAME, not
  // id, so the selected id needs resolving through the same tree — but it IS
  // the same taxonomy: AskCompose sets a request's categoryName from this
  // exact catalog tree when the poster picks a category, so the lookup below
  // is an exact match, not an approximation.
  const selectedCategoryName = cat ? catTree.find((c) => c.id === cat)?.name ?? null : null;
  const loading = bizLoading || provLoading;

  const showBiz = tab === "all" || tab === "business";
  const showProv = tab === "all" || tab === "provider";
  const empty = (showBiz ? biz.length : 0) + (showProv ? prov.length : 0) === 0;
  const canLoadMoreBiz = showBiz && bizHasMore;
  const canLoadMoreProv = showProv && provHasMore;
  const loadingMore = loadingMoreBiz || loadingMoreProv;
  // Only load-more-appended cards get the row-enter animation — the initial
  // page already animates in via each card's own unconditional fade-up, so
  // re-wrapping those too would double-animate them on every re-render.
  const extraBizIds = new Set(extraBiz.map((b) => b.id));
  const extraProvIds = new Set(extraProv.map((p) => p.id));

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
            <LocationSearchBox
              value={locQuery}
              onChange={searchPlaces}
              onClear={() => { setLocQuery(""); setLocResults([]); }}
              results={locResults}
              onPick={pickPlace}
              searching={searching}
              placeholder={t("explore_search_address")}
            />
          </div>

          {/* Category + radius come first, above the tab selector — they're
              universal filters (the same choice regardless of which tab
              you're then looking at results through), so choosing one here
              shouldn't reset or vary by tab. The tabs below just lens
              whatever's already selected — Requests included, it's passed
              this same selection as a prop (see selectedCategoryName below). */}
          <div className="filter-section">
            <label className="filter-label">{t("explore_categories")}</label>
            <div className="desktop-categories-list">
              <button className={`category-item-btn ${!cat ? "active" : ""}`} onClick={() => { haptics.selection(); setCat(null); }}>
                <span>{t("explore_show_all")}</span>
              </button>
              {catTree.map((c) => (
                <button
                  key={c.id}
                  className={`category-item-btn ${cat === c.id ? "active" : ""}`}
                  onClick={() => { haptics.selection(); setCat(cat === c.id ? null : c.id); }}
                >
                  <span style={{ marginRight: 6 }}>{c.icon}</span>
                  <span>{c.name}</span>
                </button>
              ))}
              {/* The full category browser (/categories) is a real, working
                  screen that had ZERO links pointing at it anywhere in the app
                  — reachable only by typing the URL. This is its way in. */}
              <button className="category-item-btn" onClick={() => nav("/categories")}>
                <span>Browse all categories →</span>
              </button>
            </div>
          </div>

          {/* Radius selector — shared across all four tabs. requestService.feed()
              already reads the same settings_radius key this control writes, so
              it governs the Requests tab's results too with no extra wiring. */}
          <div className="filter-section">
            <label className="filter-label">{t("explore_search_radius")}</label>
            <RadiusDropdown
              value={radius}
              onChange={setRadius}
              accentColor="var(--brand-600)"
              label={t("explore_search_radius")}
              align="left"
            />
          </div>

          {/* View Tab Selector — a lens over the category+radius already
              chosen above, not a reset of it. */}
          <div className="filter-section">
            <label className="filter-label">{t("explore_browse_type")}</label>
            <div className="desktop-tabs">
              {([["all", t("explore_tab_all")], ["business", t("explore_tab_shops")], ["provider", t("explore_tab_helpers")], ["requests", t("explore_tab_requests")]] as [Tab, string][]).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  onClick={() => { haptics.selection(); setTab(tabKey); }}
                  className={`tab-btn ${tab === tabKey ? "active" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sort applies to businesses/providers only — Requests has no
              sort concept of its own, rendered inline by RequestsFeedPanel. */}
          {tab !== "requests" && (
            <div className="filter-section">
              <SortMenu value={sort} onChange={setSort} label={t("sort_label")} />
            </div>
          )}
        </div>

        {/* Right Side: Main explore listings */}
        <div className="explore-listings-feed">
          {/* Mobile header — safe-area aware, single scroll region below */}
          <header className="explore-mobile-header mobile-only">
            <div className="row gap-8 center-v" style={{ marginBottom: 10 }}>
              <button className="icon-btn" onClick={goBack} aria-label="Go back">
                <ArrowLeft size={20} />
              </button>
              <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
                <span className="bold" style={{ fontSize: 20, lineHeight: 1.15 }}>{t("explore")}</span>
                <span className="tiny muted ellipsis">{tf("explore_near", { area })}</span>
              </div>
              <div className="row gap-6" style={{ flexShrink: 0 }}>
                <button className="icon-btn" onClick={() => nav("/search")} aria-label={t("search_input_placeholder")}><Search size={20} /></button>
                <button className="icon-btn" onClick={() => nav("/map")} aria-label={t("map")}><Map size={20} /></button>
                <button className="icon-btn" style={{ position: "relative" }} onClick={() => nav("/chats?scope=CUSTOMER")} aria-label={t("explore_chats_aria")}>
                  <MessageSquare size={20} />
                  {chatUnread > 0 && (
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      width: 8, height: 8, background: "var(--red-500)",
                      borderRadius: "50%", border: "2px solid var(--surface)",
                    }} />
                  )}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <LocationSearchBox
                value={locQuery}
                onChange={searchPlaces}
                onClear={() => { setLocQuery(""); setLocResults([]); }}
                results={locResults}
                onPick={pickPlace}
                searching={searching}
                placeholder={t("explore_search_address_area")}
              />
            </div>

            {/* Category + radius, above the tab row — universal filters (the
                same choice regardless of which tab you're then looking at
                results through), not something that resets or varies per
                tab. Requests included: it's passed this same selection as a
                prop (see selectedCategoryName in the render below). */}
            <div className="row gap-8 center-v" style={{ margin: "0 -16px 10px", padding: "0 16px" }}>
              <div className="hscroll grow" style={{ padding: 0, margin: 0 }}>
                <button className={`chip ${!cat ? "active" : ""}`} onClick={() => { haptics.selection(); setCat(null); }}>{t("explore_tab_all")}</button>
                {catTree.map((c) => (
                  <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} onClick={() => { haptics.selection(); setCat(cat === c.id ? null : c.id); }}>
                    {c.icon} {c.name.split(" ")[0]}
                  </button>
                ))}
              </div>
              <RadiusDropdown
                value={radius}
                onChange={setRadius}
                accentColor="var(--brand-600)"
                label={t("explore_radius_label")}
              />
            </div>

            <div className="row" style={{ borderBottom: "1px solid var(--line)", margin: "0 -16px", padding: "0 16px" }}>
              {([["all", t("explore_tab_all")], ["business", t("explore_tab_businesses")], ["provider", t("explore_tab_providers")], ["requests", t("explore_tab_requests")]] as [Tab, string][]).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  onClick={() => { haptics.selection(); setTab(tabKey); }}
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
            {/* Sort (mobile only) — category+radius already live in the header,
                above the tab row; sort is a "how to order within what's
                already selected" concern, so it stays down here next to the
                results it orders. Hidden on Requests, which has no sort
                concept of its own. */}
            {tab !== "requests" && (
              <div className="mobile-only page-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
                <SortMenu value={sort} onChange={setSort} label={t("sort_label")} />
              </div>
            )}

            {tab === "requests" ? (
              <RequestsFeedPanel categoryName={selectedCategoryName} radius={radius} />
            ) : (
              <>
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
                ) : (bizError || provError) ? (
                  <ErrorView error={(bizError || provError)!} onRetry={() => { refetchBiz(); refetchProv(); }} />
                ) : (
                  <div className="col gap-14 listings-cards-grid">
                    {empty && (
                      <EmptyState
                        illustration={<NoResultsIllustration />}
                        emoji="🔍"
                        title={t("explore_empty_title")}
                        text={t("explore_empty_text")}
                        action={<button className="btn btn-ghost btn-sm" onClick={() => { setCat(null); setRadius(15); }}>{t("explore_reset_filters")}</button>}
                      />
                    )}
                    {showBiz && showProv && sort === "nearby" ? (
                      mergeByDistance(biz, prov).map((item, idx) =>
                        item.kind === "business" ? (
                          <BusinessCardWide key={item.data.id} b={item.data} style={{ animationDelay: `${idx * 35}ms` }} entranceClass={extraBizIds.has(item.data.id) ? "queue-row-enter" : "fade-up"} />
                        ) : (
                          <ProviderCard key={item.data.id} p={item.data} style={{ animationDelay: `${idx * 35}ms` }} entranceClass={extraProvIds.has(item.data.id) ? "queue-row-enter" : "fade-up"} />
                        )
                      )
                    ) : (
                      <>
                        {showProv && prov.map((p, idx) => <ProviderCard key={p.id} p={p} style={{ animationDelay: `${idx * 35}ms` }} entranceClass={extraProvIds.has(p.id) ? "queue-row-enter" : "fade-up"} />)}
                        {showBiz && biz.map((b, idx) => <BusinessCardWide key={b.id} b={b} style={{ animationDelay: `${idx * 35}ms` }} entranceClass={extraBizIds.has(b.id) ? "queue-row-enter" : "fade-up"} />)}
                      </>
                    )}
                    {(canLoadMoreBiz || canLoadMoreProv) && (
                      <button
                        className="btn btn-outline btn-block"
                        disabled={loadingMore}
                        onClick={() => { if (canLoadMoreBiz) loadMoreBiz(); if (canLoadMoreProv) loadMoreProv(); }}
                      >
                        {loadingMore ? t("explore_loading_more") : t("explore_load_more")}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            <div style={{ height: 24 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
