import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, Map } from "@/components/Icons";
import { catalogService, discoveryService, userService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { BusinessCardWide, ProviderCard } from "@/components/cards";
import { AppBar, EmptyState } from "@/components/common";
import RadiusSelector from "@/components/RadiusSelector";
import SortMenu, { type SortOption } from "@/components/SortMenu";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
import type { Category, Business, Provider } from "@/types";

// catalogService.get(id) is a flat single-row fetch — it never populates
// .children. The category tree (with children) only comes from getCategories(),
// which is cached under "categories" (Explore/AllCategories already warm it),
// so this looks the node up there instead of a second, tree-less fetch.
function findCategoryNode(tree: Category[], id: string): Category | undefined {
  for (const c of tree) {
    if (c.id === id) return c;
    const found = findCategoryNode(c.children ?? [], id);
    if (found) return found;
  }
  return undefined;
}

export default function CategoryListing() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { user, showToast } = useApp();
  const { t, tf } = useI18n();
  const { data: tree, loading: catLoading, error: catError, refetch: refetchCat } = useQuery(
    () => catalogService.getCategories(),
    [],
    "categories"
  );
  const cat = tree ? findCategoryNode(tree, id) : undefined;
  const [sub, setSub] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("nearby");
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

  const childIds = cat?.children?.map((c) => c.id) ?? [];
  const matchIds = sub ? [sub] : [id, ...childIds];

  const { data: bizPage, loading: bizLoading, error: bizError, refetch: refetchBiz } = useQuery(
    () => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined, radius, sort, categoryIds: matchIds }),
    [user.lat, user.lng, radius, sort, matchIds.join(",")]
  );
  const { data: provPage, loading: provLoading, error: provError, refetch: refetchProv } = useQuery(
    () => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined, radius, sort, categoryIds: matchIds }),
    [user.lat, user.lng, radius, sort, matchIds.join(",")]
  );

  // Load-more pagination — same extra/cursor/hasMore idiom as Requests.tsx,
  // doubled since this screen shows two independent entity feeds.
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
      const next = await discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined, radius, sort, categoryIds: matchIds, cursor: bizCursor });
      setExtraBiz((prev) => [...prev, ...next.data]);
      setBizCursor(next.page?.next_cursor ?? null);
      setBizHasMore(next.page?.has_more ?? false);
    } catch {
      showToast(t("catlist_load_more_failed"));
    } finally {
      setLoadingMoreBiz(false);
    }
  }
  async function loadMoreProv() {
    if (!provCursor || loadingMoreProv) return;
    setLoadingMoreProv(true);
    try {
      const next = await discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined, radius, sort, categoryIds: matchIds, cursor: provCursor });
      setExtraProv((prev) => [...prev, ...next.data]);
      setProvCursor(next.page?.next_cursor ?? null);
      setProvHasMore(next.page?.has_more ?? false);
    } catch {
      showToast(t("catlist_load_more_failed"));
    } finally {
      setLoadingMoreProv(false);
    }
  }

  const biz = [...(bizPage?.data ?? []), ...extraBiz];
  const prov = [...(provPage?.data ?? []), ...extraProv];
  const loading = catLoading || bizLoading || provLoading;
  const error = catError || bizError || provError;
  const extraBizIds = new Set(extraBiz.map((b) => b.id));
  const extraProvIds = new Set(extraProv.map((p) => p.id));

  if (catLoading) {
    return (
      <div className="screen">
        <AppBar title={t("catlist_title")} />
        <ListSkeleton count={4} />
      </div>
    );
  }

  if (error && !cat) {
    return (
      <div className="screen">
        <AppBar title={t("catlist_title")} />
        <ErrorView error={error} onRetry={refetchCat} />
      </div>
    );
  }

  if (!cat) {
    return (
      <div className="screen">
        <AppBar title={t("catlist_title")} />
        <EmptyState emoji="🗂️" title={t("catlist_not_found")} text={t("catlist_moved")} />
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="appbar" style={{ flexDirection: "column", alignItems: "stretch", gap: "var(--space-sm)", paddingBottom: 0 }}>
        <div className="row gap-12">
          <button className="icon-btn" onClick={() => nav(-1)}>←</button>
          <div className="row gap-8 grow">
            <span style={{ fontSize: 26 }}>{cat.icon}</span>
            <div className="col" style={{ gap: 0 }}>
              <span className="bold" style={{ fontSize: 18 }}>{cat.name}</span>
              <span className="tiny muted">{tf("catlist_near_you", { count: biz.length + prov.length })}</span>
            </div>
          </div>
          <button className="icon-btn" onClick={() => nav("/search")}><Search size={18} /></button>
          <button className="icon-btn" onClick={() => nav("/map")}><Map size={18} /></button>
        </div>
      </header>

      <div className="screen-scroll">
        {cat.children && cat.children.length > 0 && (
          <div className="hscroll" style={{ paddingTop: 12 }}>
            <button className={`chip ${!sub ? "active" : ""}`} onClick={() => { haptics.selection(); setSub(null); }}>{t("explore_tab_all")}</button>
            {cat.children.map((c) => (
              <button key={c.id} className={`chip ${sub === c.id ? "active" : ""}`} onClick={() => { haptics.selection(); setSub(sub === c.id ? null : c.id); }}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="page-pad col gap-10" style={{ paddingTop: 12, paddingBottom: 0 }}>
          <RadiusSelector value={radius} onChange={setRadius} accentColor="var(--brand-600)" label={t("explore_search_radius")} />
          <SortMenu value={sort} onChange={setSort} label={t("sort_label")} />
        </div>

        <div className="col gap-14 page-pad listings-cards-grid">
          {loading ? (
            <ListSkeleton count={3} />
          ) : (bizError || provError) ? (
            <ErrorView error={(bizError || provError)!} onRetry={() => { refetchBiz(); refetchProv(); }} />
          ) : biz.length + prov.length === 0 ? (
            <EmptyState
              emoji="🏷️"
              title={t("catlist_empty_title")}
              text={t("catlist_empty_text")}
            />
          ) : (
            <>
              {prov.map((p) => <ProviderCard key={p.id} p={p} entranceClass={extraProvIds.has(p.id) ? "queue-row-enter" : "fade-up"} />)}
              {biz.map((b) => <BusinessCardWide key={b.id} b={b} entranceClass={extraBizIds.has(b.id) ? "queue-row-enter" : "fade-up"} />)}
              {(bizHasMore || provHasMore) && (
                <button
                  className="btn btn-outline btn-block"
                  disabled={loadingMoreBiz || loadingMoreProv}
                  onClick={() => { if (bizHasMore) loadMoreBiz(); if (provHasMore) loadMoreProv(); }}
                >
                  {loadingMoreBiz || loadingMoreProv ? t("catlist_loading_more") : t("catlist_load_more")}
                </button>
              )}
            </>
          )}
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
