import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search as SearchIcon, X, TrendingUp, Clock, Bell } from "@/components/Icons";
import { catalogService, discoveryService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { SelectableChip } from "@/components/ui/SelectableChip";
import { BusinessCardWide, ProviderCard } from "@/components/cards";
import { EmptyState } from "@/components/common";
import { NoResultsIllustration } from "@/components/illustrations";
import { useApp } from "@/store";
import { useI18n, englishStrings } from "@/lib/i18n";
import { evaluateProviderAvailability } from "@/utils/availability";
import type { Business, Provider } from "@/types";
import { errorMessage } from "@/lib/errorMessage";
import { track, EVENTS } from "@/lib/analytics";

const TREND_KEYS = ["search_trend_1", "search_trend_2", "search_trend_3", "search_trend_4", "search_trend_5", "search_trend_6"] as const;
const RECENT_KEY = "stryt_recent_searches";

function loadRecent(): string[] {
  try {
    const s = localStorage.getItem(RECENT_KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

export default function Search() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [debounced, setDebounced] = useState("");

  // Keep ?q= in step with what's typed, so a search can be shared, bookmarked and restored by back/forward (S6).
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (debounced === current) return;
    const next = new URLSearchParams(params);
    if (debounced) next.set("q", debounced); else next.delete("q");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [openOnly, setOpenOnly] = useState(false);
  const [removingSavedId, setRemovingSavedId] = useState<string | null>(null);
  const { user, showToast, isGuest } = useApp();
  const { t, tf } = useI18n();

  // Debounce input so we don't hit the API on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const query = debounced.toLowerCase();
  const { data: leaves } = useQuery(() => catalogService.leaves(), [], "catalog:leaves");
  const { data: results, loading, error, refetch } = useQuery(
    () => (query
      ? discoveryService.search(query, { lat: user.lat || undefined, lng: user.lng || undefined })
      : Promise.resolve(null)),
    [query, user.lat, user.lng],
    query ? `search:${query}:${(user.lat ?? 0).toFixed(2)}:${(user.lng ?? 0).toFixed(2)}` : undefined
  );
  const { data: savedSearches, refetch: refetchSaved } = useQuery(() => discoveryService.savedSearches(), [user.id], `search:saved:${user.id}`);
  const saved = savedSearches ?? [];
  const isSaved = saved.some((s) => s.query.toLowerCase() === query);

  // Load-more pagination — same extra/cursor/hasMore idiom used elsewhere,
  // doubled since a search hits two independent entity feeds.
  const [extraBiz, setExtraBiz] = useState<Business[]>([]);
  const [bizCursor, setBizCursor] = useState<string | null>(null);
  const [bizHasMore, setBizHasMore] = useState(false);
  const [loadingMoreBiz, setLoadingMoreBiz] = useState(false);
  const [extraProv, setExtraProv] = useState<Provider[]>([]);
  const [provCursor, setProvCursor] = useState<string | null>(null);
  const [provHasMore, setProvHasMore] = useState(false);
  const [loadingMoreProv, setLoadingMoreProv] = useState(false);

  // One search_performed per query. The typed text never leaves the device — only that there was one. Keyed on the
  // query, because a cached result and its revalidation arrive as two result sets for the same search.
  const trackedQueryRef = useRef("");
  useEffect(() => {
    if (!query || !results || loading || trackedQueryRef.current === query) return;
    trackedQueryRef.current = query;
    track(EVENTS.SEARCH_PERFORMED, {
      surface: "search",
      has_query: true,
      result_count: results.businesses.data.length + results.providers.data.length,
      is_guest: isGuest,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, loading]);

  useEffect(() => {
    setExtraBiz([]);
    setBizCursor(results?.businesses.page?.next_cursor ?? null);
    setBizHasMore(results?.businesses.page?.has_more ?? false);
    setExtraProv([]);
    setProvCursor(results?.providers.page?.next_cursor ?? null);
    setProvHasMore(results?.providers.page?.has_more ?? false);
  }, [results]);

  async function loadMoreBiz() {
    if (!bizCursor || loadingMoreBiz || !query) return;
    setLoadingMoreBiz(true);
    try {
      const next = await discoveryService.search(query, { lat: user.lat || undefined, lng: user.lng || undefined, bizCursor });
      setExtraBiz((prev) => {
        const existingIds = new Set([...(results?.businesses.data ?? []).map((b) => b.id), ...prev.map((b) => b.id)]);
        const newItems = next.businesses.data.filter((b) => !existingIds.has(b.id));
        return [...prev, ...newItems];
      });
      setBizCursor(next.businesses.page?.next_cursor ?? null);
      setBizHasMore(next.businesses.page?.has_more ?? false);
    } catch {
      showToast(t("catlist_load_more_failed"));
    } finally {
      setLoadingMoreBiz(false);
    }
  }
  async function loadMoreProv() {
    if (!provCursor || loadingMoreProv || !query) return;
    setLoadingMoreProv(true);
    try {
      const next = await discoveryService.search(query, { lat: user.lat || undefined, lng: user.lng || undefined, provCursor });
      setExtraProv((prev) => {
        const existingIds = new Set([...(results?.providers.data ?? []).map((p) => p.id), ...prev.map((p) => p.id)]);
        const newItems = next.providers.data.filter((p) => !existingIds.has(p.id));
        return [...prev, ...newItems];
      });
      setProvCursor(next.providers.page?.next_cursor ?? null);
      setProvHasMore(next.providers.page?.has_more ?? false);
    } catch {
      showToast(t("catlist_load_more_failed"));
    } finally {
      setLoadingMoreProv(false);
    }
  }

  const rawBizResults = [...(results?.businesses.data ?? []), ...extraBiz];
  const rawProvResults = [...(results?.providers.data ?? []), ...extraProv];
  const bizResults = openOnly
    ? rawBizResults.filter((b) => evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil).isOpenNow)
    : rawBizResults;
  const provResults = openOnly
    ? rawProvResults.filter((p) => evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil).isOpenNow)
    : rawProvResults;
  const catResults = query ? (leaves ?? []).filter((c) => c.name.toLowerCase().includes(query)) : [];
  const total = bizResults.length + provResults.length;
  const rawTotal = rawBizResults.length + rawProvResults.length;
  const searching = !!query && loading;
  const loadingMore = loadingMoreBiz || loadingMoreProv;
  const extraBizIds = new Set(extraBiz.map((b) => b.id));
  const extraProvIds = new Set(extraProv.map((p) => p.id));

  // Remember a search once it settles and actually returns results — that's the
  // user's real recent history (deduped, most-recent-first, capped at 8).
  useEffect(() => {
    if (!debounced || loading || total === 0) return;
    setRecent((prev) => {
      const term = debounced.trim();
      const next = [term, ...prev.filter((r) => r.toLowerCase() !== term.toLowerCase())].slice(0, 8);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [debounced, loading, total]);

  function clearRecent() {
    setRecent([]);
    try { localStorage.removeItem(RECENT_KEY); } catch {}
  }

  async function handleRemoveSavedSearch(id: string) {
    if (removingSavedId) return;
    setRemovingSavedId(id);
    try {
      await discoveryService.removeSavedSearch(id);
      showToast(t("search_alert_removed") || "Alert removed");
      refetchSaved();
    } catch (e) {
      showToast(errorMessage(e, t("search_alert_update_failed") || "Failed to remove alert"));
    } finally {
      setRemovingSavedId(null);
    }
  }

  async function toggleSaveSearch() {
    if (!debounced) return;
    try {
      if (isSaved) {
        const match = saved.find((s) => s.query.toLowerCase() === query);
        if (match) await discoveryService.removeSavedSearch(match.id);
        showToast(t("search_alert_removed"));
      } else {
        await discoveryService.saveSearch(debounced, user.lat || undefined, user.lng || undefined);
        showToast(tf("search_will_notify", { query: debounced }));
      }
      refetchSaved();
    } catch (e) {
      // A guest gets the reason (they need an account), not a generic failure — saving used to no-op and still
      // report success (S5).
      showToast(errorMessage(e) || t("search_alert_update_failed"));
    }
  }

  return (
    <div className="screen screen-boxed">
      <header className="appbar">
        <div className="row gap-8 grow search-field">
          <SearchIcon size={18} color="var(--ink-500)" />
          <form
            role="search"
            style={{ display: "contents" }}
            onSubmit={(e) => { e.preventDefault(); (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur(); }}
          >
            <input
              className="search-field-input"
              type="search"
              enterKeyHint="search"
              aria-label={t("search_input_placeholder")}
              placeholder={t("search_input_placeholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </form>
          {q && (
            <button onClick={() => setQ("")} aria-label={t("search_clear_aria")}>
              <X size={18} color="var(--ink-500)" />
            </button>
          )}
        </div>
        <button className="semi small" style={{ color: "var(--brand-700)" }} onClick={() => nav(-1)}>
          {t("search_cancel")}
        </button>
      </header>

      <div className="screen-scroll">
        {!query ? (
          <div className="page-pad">
            {recent.length > 0 && (
              <>
                <div className="row between" style={{ marginBottom: "var(--space-sm)" }}>
                  <div className="small semi muted row gap-6">
                    <Clock size={15} /> {t("search_recent")}
                  </div>
                  <button className="tiny semi" style={{ color: "var(--brand-700)" }} onClick={clearRecent}>{t("search_clear")}</button>
                </div>
                <div className="row wrap gap-8">
                  {recent.map((r) => (
                    <button key={r} className="chip" onClick={() => setQ(r)}>{r}</button>
                  ))}
                </div>
              </>
            )}

            <div className="small semi muted row gap-6" style={{ margin: recent.length > 0 ? "22px 0 12px" : "0 0 12px" }}>
              <TrendingUp size={15} /> {t("search_trending")}
            </div>
            <div className="row wrap gap-8">
              {TREND_KEYS.map((key) => {
                const word = t(key);
                // Listings are written in English, so the chip searches the English term even when it reads in
                // Hindi or Marathi — translated chips used to return nothing at all (S3).
                const term = englishStrings[key] ?? word;
                return <button key={key} className="chip" onClick={() => setQ(term)}>🔥 {word}</button>;
              })}
            </div>

            {saved.length > 0 && (
              <>
                <div className="small semi muted row gap-6" style={{ margin: "22px 0 12px" }}>
                  <Bell size={15} /> {t("search_your_alerts")}
                </div>
                <div className="col gap-8">
                  {saved.map((s) => (
                    <div key={s.id} className="row between card card-condensed center-v" style={{ padding: "8px 12px" }}>
                      <button className="small semi grow" style={{ textAlign: "left", background: "none", border: 0, padding: 0 }} onClick={() => setQ(s.query)}>{s.query}</button>
                      <button
                        type="button"
                        className="icon-btn-sm"
                        style={{ minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: removingSavedId === s.id ? 0.5 : 1 }}
                        disabled={removingSavedId === s.id}
                        aria-label={t("search_remove_alert_aria")}
                        onClick={() => handleRemoveSavedSearch(s.id)}
                      >
                        <X size={16} color="var(--ink-400)" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : searching ? (
          <ListSkeleton count={3} />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : total === 0 && catResults.length === 0 ? (
          openOnly && rawTotal > 0 ? (
            <div className="col center" style={{ gap: 14, padding: "32px 16px" }}>
              <EmptyState
                illustration={<NoResultsIllustration />}
                emoji="🌙"
                title={tf("search_no_open_results", { query: debounced })}
                text={t("search_no_open_results_hint")}
                action={
                  <button className="btn btn-secondary btn-sm" onClick={() => setOpenOnly(false)}>
                    {t("search_show_all_places")}
                  </button>
                }
              />
            </div>
          ) : (
            <div className="col center" style={{ gap: 14 }}>
              <EmptyState illustration={<NoResultsIllustration />} emoji="🤷" title={tf("search_no_results", { query: debounced })} text={t("search_no_results_hint")} />
              <button className="btn btn-outline btn-sm" onClick={toggleSaveSearch}>
                <Bell size={15} weight={isSaved ? "fill" : "regular"} />
                {isSaved ? t("search_alert_on_long") : tf("search_notify_me", { query: debounced })}
              </button>
            </div>
          )
        ) : (
          <div className="page-pad col gap-14">
            {catResults.length > 0 && (
              <div className="row wrap gap-8">
                {catResults.map((c) => (
                  <button key={c.id} className="chip active" onClick={() => nav(`/category/${c.parentId ?? c.id}`)}>
                    {c.icon} {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="row between align-center wrap gap-8">
              <div className="row gap-10 align-center">
                <span className="small semi" style={{ color: "var(--ink-900)" }}>
                  {total === 1 ? t("search_result_one") : tf("search_results_count", { count: total })}
                </span>
                <SelectableChip
                  role="checkbox"
                  label={`🟢 ${t("search_filter_open_now")}`}
                  selected={openOnly}
                  onSelect={() => setOpenOnly((prev) => !prev)}
                  size="sm"
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm row gap-6"
                style={{
                  minHeight: 44,
                  padding: "0 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: isSaved ? "var(--brand-700)" : "var(--ink-700)",
                }}
                onClick={toggleSaveSearch}
                aria-label={isSaved ? t("search_alert_on") : t("search_get_alerts")}
              >
                <Bell size={16} weight={isSaved ? "fill" : "regular"} />
                <span>{isSaved ? t("search_alert_on") : t("search_get_alerts")}</span>
              </button>
            </div>
            {provResults.map((p) => <ProviderCard key={p.id} p={p} entranceClass={extraProvIds.has(p.id) ? "queue-row-enter" : "fade-up"} />)}
            {bizResults.map((b) => <BusinessCardWide key={b.id} b={b} entranceClass={extraBizIds.has(b.id) ? "queue-row-enter" : "fade-up"} />)}
            {(bizHasMore || provHasMore) && (
              <button
                className="btn btn-outline btn-block"
                disabled={loadingMore}
                onClick={() => {
                  if (bizHasMore && !loadingMoreBiz) loadMoreBiz();
                  if (provHasMore && !loadingMoreProv) loadMoreProv();
                }}
              >
                {loadingMore ? t("catlist_loading_more") : t("catlist_load_more")}
              </button>
            )}
          </div>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
