import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Map, SlidersHorizontal } from "lucide-react";
import { catalogService, discoveryService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { BusinessCardWide, ProviderCard } from "@/components/cards";
import { EmptyState } from "@/components/common";
import { useApp } from "@/store";

type Tab = "all" | "business" | "provider";
type Sort = "nearby" | "rating" | "new";

export default function Explore() {
  const nav = useNavigate();
  const { area } = useApp();
  const [tab, setTab] = useState<Tab>("all");
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("nearby");
  const [radius, setRadius] = useState(5);

  const { data: categories } = useQuery(() => catalogService.getCategories(), []);
  const { data: bizPage, loading: bizLoading, error: bizError, refetch: refetchBiz } = useQuery(
    () => discoveryService.businesses({ category: cat ?? undefined, sort, radius }),
    [cat, sort, radius]
  );
  const { data: provPage, loading: provLoading } = useQuery(
    () => discoveryService.providers({ category: cat ?? undefined, sort, radius }),
    [cat, sort, radius]
  );

  const biz = bizPage?.data ?? [];
  const prov = provPage?.data ?? [];
  const catTree = categories ?? [];
  const loading = bizLoading || provLoading;

  const showBiz = tab === "all" || tab === "business";
  const showProv = tab === "all" || tab === "provider";
  const empty = (showBiz ? biz.length : 0) + (showProv ? prov.length : 0) === 0;

  return (
    <div className="screen with-nav">
      <header className="appbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 12, paddingBottom: 0 }}>
        <div className="row between">
          <div className="col" style={{ gap: 0 }}>
            <span className="bold" style={{ fontSize: 20 }}>Explore</span>
            <span className="tiny muted">Near {area}</span>
          </div>
          <div className="row gap-8">
            <button className="icon-btn" onClick={() => nav("/search")}><Search size={20} /></button>
            <button className="icon-btn" onClick={() => nav("/map")}><Map size={20} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="row" style={{ borderBottom: "1px solid var(--line)" }}>
          {([["all", "All"], ["business", "Businesses"], ["provider", "Providers"]] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="semi"
              style={{
                flex: 1,
                padding: "12px 0",
                fontSize: 14,
                color: tab === t ? "var(--brand-700)" : "var(--ink-500)",
                borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="screen-scroll">
        {/* Category chips */}
        <div className="hscroll" style={{ paddingTop: 12 }}>
          <button className={`chip ${!cat ? "active" : ""}`} onClick={() => setCat(null)}>All</button>
          {catTree.map((c) => (
            <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} onClick={() => setCat(cat === c.id ? null : c.id)}>
              {c.icon} {c.name.split(" ")[0]}
            </button>
          ))}
        </div>

        {/* Sort + radius */}
        <div className="row between page-pad" style={{ paddingTop: 12, paddingBottom: 4 }}>
          <div className="row gap-8">
            {([["nearby", "Nearby"], ["rating", "Top rated"], ["new", "Newest"]] as [Sort, string][]).map(([s, label]) => (
              <button key={s} className={`chip ${sort === s ? "active" : ""}`} onClick={() => setSort(s)} style={{ padding: "6px 12px", fontSize: 12.5 }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="page-pad" style={{ paddingTop: 4 }}>
          <div className="card" style={{ padding: "10px 14px" }}>
            <div className="row between small semi">
              <span className="row gap-6"><SlidersHorizontal size={14} /> Radius</span>
              <span style={{ color: "var(--brand-700)" }}>{radius} km</span>
            </div>
            <input
              type="range"
              min={1}
              max={15}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#6b21cc", marginTop: 8 }}
            />
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <ListSkeleton count={4} />
        ) : bizError ? (
          <ErrorView error={bizError} onRetry={refetchBiz} />
        ) : (
          <div className="col gap-14 page-pad">
            {empty && (
              <EmptyState
                emoji="🔍"
                title="Nothing here yet"
                text="Try widening your radius or picking a different category."
                action={<button className="btn btn-ghost btn-sm" onClick={() => { setCat(null); setRadius(15); }}>Reset filters</button>}
              />
            )}
            {showProv && prov.map((p) => <ProviderCard key={p.id} p={p} />)}
            {showBiz && biz.map((b) => <BusinessCardWide key={b.id} b={b} />)}
          </div>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
