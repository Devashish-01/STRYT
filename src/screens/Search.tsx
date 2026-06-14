import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search as SearchIcon, X, TrendingUp, Clock } from "lucide-react";
import { catalogService, discoveryService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { BusinessCardWide, ProviderCard } from "@/components/cards";
import { EmptyState } from "@/components/common";
import type { Business, Provider } from "@/types";

const trending = ["Biryani", "Plumber", "Salon", "Birthday cake", "AC repair", "Tutor"];
const recent = ["Cappuccino", "Makeup artist", "Grocery"];

export default function Search() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  // Debounce input so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = debounced.toLowerCase();
  const { data: leaves } = useQuery(() => catalogService.leaves(), []);
  const { data: results, loading, error, refetch } = useQuery(
    () => (query ? discoveryService.search(query) : Promise.resolve({ businesses: [] as Business[], providers: [] as Provider[] })),
    [query]
  );

  const bizResults = results?.businesses ?? [];
  const provResults = results?.providers ?? [];
  const catResults = query ? (leaves ?? []).filter((c) => c.name.toLowerCase().includes(query)) : [];
  const total = bizResults.length + provResults.length;
  const searching = !!query && loading;

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
            <div className="small semi muted row gap-6" style={{ marginBottom: 12 }}>
              <Clock size={15} /> Recent
            </div>
            <div className="row wrap gap-8">
              {recent.map((r) => (
                <button key={r} className="chip" onClick={() => setQ(r)}>{r}</button>
              ))}
            </div>

            <div className="small semi muted row gap-6" style={{ margin: "22px 0 12px" }}>
              <TrendingUp size={15} /> Trending near you
            </div>
            <div className="row wrap gap-8">
              {trending.map((t) => (
                <button key={t} className="chip" onClick={() => setQ(t)}>🔥 {t}</button>
              ))}
            </div>
          </div>
        ) : searching ? (
          <ListSkeleton count={3} />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : total === 0 && catResults.length === 0 ? (
          <EmptyState emoji="🤷" title={`No results for "${debounced}"`} text="Try a different keyword or browse categories from Explore." />
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
            <div className="tiny muted">{total} results</div>
            {provResults.map((p) => <ProviderCard key={p.id} p={p} />)}
            {bizResults.map((b) => <BusinessCardWide key={b.id} b={b} />)}
          </div>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
