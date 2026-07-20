import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, Map } from "@/components/Icons";
import { catalogService, discoveryService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { BusinessCardWide, ProviderCard } from "@/components/cards";
import { AppBar, EmptyState } from "@/components/common";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";

export default function CategoryListing() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { user } = useApp();
  const { t, tf } = useI18n();
  const { data: cat, loading: catLoading } = useQuery(() => catalogService.get(id), [id]);
  const { data: bizPage, loading: bizLoading } = useQuery(
    () => {
      const saved = localStorage.getItem("settings_radius");
      const radiusLimit = saved ? parseFloat(saved) : 5;
      return discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined, radius: radiusLimit });
    },
    [user.lat, user.lng]
  );
  const { data: provPage, loading: provLoading } = useQuery(
    () => {
      const saved = localStorage.getItem("settings_radius");
      const radiusLimit = saved ? parseFloat(saved) : 5;
      return discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined, radius: radiusLimit });
    },
    [user.lat, user.lng]
  );
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
        <AppBar title={t("catlist_title")} />
        <ListSkeleton count={4} />
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
      <header className="appbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 12, paddingBottom: 0 }}>
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
            <button className={`chip ${!sub ? "active" : ""}`} onClick={() => setSub(null)}>{t("explore_tab_all")}</button>
            {cat.children.map((c) => (
              <button key={c.id} className={`chip ${sub === c.id ? "active" : ""}`} onClick={() => setSub(sub === c.id ? null : c.id)}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="col gap-14 page-pad listings-cards-grid">
          {loading ? (
            <ListSkeleton count={3} />
          ) : biz.length + prov.length === 0 ? (
            <EmptyState
              emoji="🏷️"
              title={t("catlist_empty_title")}
              text={t("catlist_empty_text")}
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
