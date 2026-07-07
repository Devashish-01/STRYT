import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search as SearchIcon, X, TrendingUp, Clock, Bell } from "@/components/Icons";
import { catalogService, discoveryService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { BusinessCardWide, ProviderCard } from "@/components/cards";
import { EmptyState } from "@/components/common";
import type { Business, Provider } from "@/types";
import { useApp } from "@/store";

const trending = ["Biryani", "Plumber", "Salon", "Birthday cake", "AC repair", "Tutor"];
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
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const { user, showToast } = useApp();

  // Debounce input so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = debounced.toLowerCase();
  const { data: leaves } = useQuery(() => catalogService.leaves(), []);
  const { data: results, loading, error, refetch } = useQuery(
    () => (query ? discoveryService.search(query, user.lat || undefined, user.lng || undefined) : Promise.resolve({ businesses: [] as Business[], providers: [] as Provider[] })),
    [query, user.lat, user.lng]
  );
  const { data: savedSearches, refetch: refetchSaved } = useQuery(() => discoveryService.savedSearches(), []);
  const saved = savedSearches ?? [];
  const isSaved = saved.some((s) => s.query.toLowerCase() === query);

  const bizResults = results?.businesses ?? [];
  const provResults = results?.providers ?? [];
  const catResults = query ? (leaves ?? []).filter((c) => c.name.toLowerCase().includes(query)) : [];
  const total = bizResults.length + provResults.length;
  const searching = !!query && loading;

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

  async function toggleSaveSearch() {
    if (!debounced) return;
    try {
      if (isSaved) {
        const match = saved.find((s) => s.query.toLowerCase() === query);
        if (match) await discoveryService.removeSavedSearch(match.id);
        showToast("Alert removed");
      } else {
        await discoveryService.saveSearch(debounced, user.lat || undefined, user.lng || undefined);
        showToast(`We'll notify you when a "${debounced}" joins nearby`);
      }
      refetchSaved();
    } catch {
      showToast("Couldn't update alert — try again");
    }
  }

  return (
    <div className="screen">
      <header className="appbar">
        <div
          className="row gap-8 grow"
          style={{ background: "var(--ink-50)", borderRadius: 12, padding: "0 12px", border: "1.5px solid var(--ink-200)" }}
        >
          <SearchIcon size={18} color="var(--ink-500)" />
          <input
            className="input"
            style={{ border: "none", background: "transparent", padding: "11px 0", flex: 1 }}
            placeholder="Search businesses, services, items…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search">
              <X size={18} color="var(--ink-500)" />
            </button>
          )}
        </div>
        <button className="semi small" style={{ color: "var(--brand-700)" }} onClick={() => nav(-1)}>
          Cancel
        </button>
      </header>

      <div className="screen-scroll">
        {!query ? (
          <div className="page-pad">
            {recent.length > 0 && (
              <>
                <div className="row between" style={{ marginBottom: 12 }}>
                  <div className="small semi muted row gap-6">
                    <Clock size={15} /> Recent
                  </div>
                  <button className="tiny semi" style={{ color: "var(--brand-700)" }} onClick={clearRecent}>Clear</button>
                </div>
                <div className="row wrap gap-8">
                  {recent.map((r) => (
                    <button key={r} className="chip" onClick={() => setQ(r)}>{r}</button>
                  ))}
                </div>
              </>
            )}

            <div className="small semi muted row gap-6" style={{ margin: recent.length > 0 ? "22px 0 12px" : "0 0 12px" }}>
              <TrendingUp size={15} /> Trending near you
            </div>
            <div className="row wrap gap-8">
              {trending.map((t) => (
                <button key={t} className="chip" onClick={() => setQ(t)}>🔥 {t}</button>
              ))}
            </div>

            {saved.length > 0 && (
              <>
                <div className="small semi muted row gap-6" style={{ margin: "22px 0 12px" }}>
                  <Bell size={15} /> Your alerts
                </div>
                <div className="col gap-8">
                  {saved.map((s) => (
                    <div key={s.id} className="row between card card-condensed" style={{ padding: "10px 12px" }}>
                      <button className="small semi" style={{ textAlign: "left" }} onClick={() => setQ(s.query)}>{s.query}</button>
                      <button
                        aria-label="Remove alert"
                        onClick={async () => { await discoveryService.removeSavedSearch(s.id); refetchSaved(); }}
                      >
                        <X size={15} color="var(--ink-400)" />
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
          <div className="col center" style={{ gap: 14 }}>
            <EmptyState emoji="🤷" title={`No results for "${debounced}"`} text="Try a different keyword or browse categories from Explore." />
            <button className="btn btn-outline btn-sm" onClick={toggleSaveSearch}>
              <Bell size={15} fill={isSaved ? "var(--brand-700)" : "none"} />
              {isSaved ? "Alert on — we'll notify you" : `Notify me when a "${debounced}" joins nearby`}
            </button>
          </div>
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
            <div className="row between align-center">
              <span className="tiny muted">{total} results</span>
              <button className="tiny semi row gap-4" style={{ color: isSaved ? "var(--brand-700)" : "var(--ink-500)", alignItems: "center" }} onClick={toggleSaveSearch}>
                <Bell size={13} fill={isSaved ? "var(--brand-700)" : "none"} /> {isSaved ? "Alert on" : "Get alerts"}
              </button>
            </div>
            {provResults.map((p) => <ProviderCard key={p.id} p={p} />)}
            {bizResults.map((b) => <BusinessCardWide key={b.id} b={b} />)}
          </div>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
