import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, Map } from "lucide-react";
import { catalogService, discoveryService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { BusinessCardWide, ProviderCard } from "@/components/cards";
import { AppBar, EmptyState } from "@/components/common";

export default function CategoryListing() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: cat, loading: catLoading } = useQuery(() => catalogService.get(id), [id]);
  const { data: bizPage, loading: bizLoading } = useQuery(() => discoveryService.businesses(), []);
  const { data: provPage, loading: provLoading } = useQuery(() => discoveryService.providers(), []);
  const [sub, setSub] = useState<string | null>(null);

  const allBiz = bizPage?.data ?? [];
  const allProv = provPage?.data ?? [];
  const loading = catLoading || bizLoading || provLoading;

  const childIds = cat?.children?.map((c) => c.id) ?? [];
  const matchIds = sub ? [sub] : [id, ...childIds];

  const biz = allBiz.filter((b) => matchIds.includes(b.categoryId));
  const prov = allProv.filter((p) => matchIds.includes(p.categoryId));

  if (catLoading) {
    return (
      <div className="screen">
        <AppBar title="Category" />
        <ListSkeleton count={4} />
      </div>
    );
  }

  if (!cat) {
    return (
      <div className="screen">
        <AppBar title="Category" />
        <EmptyState emoji="🗂️" title="Category not found" text="This category may have moved." />
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="appbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 12, paddingBottom: 0 }}>
        <div className="row gap-12">
          <button className="icon-btn" onClick={() => nav(-1)}>←</button>
          <div className="row gap-8 grow">
            <span style={{ fontSize: 26 }}>{cat.icon}</span>
            <div className="col" style={{ gap: 0 }}>
              <span className="bold" style={{ fontSize: 18 }}>{cat.name}</span>
              <span className="tiny muted">{biz.length + prov.length} near you</span>
            </div>
          </div>
          <button className="icon-btn" onClick={() => nav("/search")}><Search size={18} /></button>
          <button className="icon-btn" onClick={() => nav("/map")}><Map size={18} /></button>
        </div>
      </header>

      <div className="screen-scroll">
        {cat.children && cat.children.length > 0 && (
          <div className="hscroll" style={{ paddingTop: 12 }}>
            <button className={`chip ${!sub ? "active" : ""}`} onClick={() => setSub(null)}>All</button>
            {cat.children.map((c) => (
              <button key={c.id} className={`chip ${sub === c.id ? "active" : ""}`} onClick={() => setSub(sub === c.id ? null : c.id)}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="col gap-14 page-pad">
          {loading ? (
            <ListSkeleton count={3} />
          ) : biz.length + prov.length === 0 ? (
            <EmptyState
              emoji="🏷️"
              title="No listings yet"
              text="Be the first to list here, or check a nearby category."
            />
          ) : (
            <>
              {prov.map((p) => <ProviderCard key={p.id} p={p} />)}
              {biz.map((b) => <BusinessCardWide key={b.id} b={b} />)}
            </>
          )}
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
