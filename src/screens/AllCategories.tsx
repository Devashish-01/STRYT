import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, X, SlidersHorizontal } from "@/components/Icons";
import { catalogService, userService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import type { Category } from "@/types";
import { useApp } from "@/store";
import RadiusSelector from "@/components/RadiusSelector";
import { useI18n } from "@/lib/i18n";


function getAllIds(cat: Category): string[] {
  return [cat.id, ...(cat.children ?? []).flatMap(getAllIds)];
}

export default function AllCategories() {
  const nav = useNavigate();
  const { user } = useApp();
  const { t } = useI18n();
  const [q, setQ] = useState("");

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


  const { data: categories, loading } = useQuery(() => catalogService.getCategories(), [], "categories");
  const { data: counts } = useQuery(() => {
    return catalogService.getCategoryCounts(user.lat || undefined, user.lng || undefined, radius);
  }, [user.lat, user.lng, radius]);

  const sorted = useMemo(() => {
    const all = categories ?? [];
    return [...all].sort((a, b) =>
      a.slug === "other" ? 1 : b.slug === "other" ? -1 : 0
    );
  }, [categories]);

  const filtered = useMemo(() => {
    if (!q.trim()) return sorted;
    const lq = q.toLowerCase();
    return sorted.filter(
      (c) =>
        c.name.toLowerCase().includes(lq) ||
        (c.children ?? []).some((ch) => ch.name.toLowerCase().includes(lq))
    );
  }, [sorted, q]);

  function countFor(cat: Category) {
    const ids = getAllIds(cat);
    const biz = ids.reduce((s, id) => s + (counts?.bizCounts[id] ?? 0), 0);
    const prov = ids.reduce((s, id) => s + (counts?.provCounts[id] ?? 0), 0);
    return { biz, prov };
  }

  return (
    <div className="screen">
      <header className="appbar">
        <button className="icon-btn" onClick={() => nav(-1)}><ArrowLeft size={20} /></button>
        <div className="col grow" style={{ gap: 1 }}>
          <span className="bold" style={{ fontSize: 18 }}>{t("allcat_title")}</span>
          <span className="tiny muted">{t("allcat_subtitle")}</span>
        </div>
      </header>

      {/* Search */}
      <div className="page-pad" style={{ paddingBottom: 0 }}>
        <div
          className="row gap-8"
          style={{ background: "var(--ink-50)", border: "1.5px solid var(--ink-200)", borderRadius: 12, padding: "0 12px" }}
        >
          <Search size={16} color="var(--ink-400)" />
          <input
            className="input"
            style={{ border: "none", background: "transparent", padding: "11px 0" }}
            placeholder={t("allcat_search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button onClick={() => setQ("")} style={{ color: "var(--ink-400)", padding: 2 }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="screen-scroll">
        {/* Radius selector */}
        <div className="page-pad" style={{ paddingTop: 12, paddingBottom: 4 }}>
          <RadiusSelector
            value={radius}
            onChange={setRadius}
            accentColor="var(--brand-600)"
            label={t("allcat_radius")}
          />
        </div>

        {loading ? (
          <div
            className="page-pad"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingTop: 16 }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 120, borderRadius: 18, background: "var(--ink-100)" }} className="skel" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="col center" style={{ paddingTop: 60, gap: 12 }}>
            <span style={{ fontSize: 44 }}>🔍</span>
            <div className="semi" style={{ fontSize: 16 }}>{t("allcat_no_results")}</div>
            <div className="small muted">{t("allcat_try_different")}</div>
          </div>
        ) : (
          <div
            className="page-pad"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingTop: 16, paddingBottom: 32 }}
          >
            {filtered.map((c) => {
              const { biz, prov } = countFor(c);
              const total = biz + prov;
              const isOther = c.slug === "other";
              const subNames = (c.children ?? []).slice(0, 3).map((ch) => ch.name.split(" ")[0]);

              return (
                <button
                  key={c.id}
                  onClick={() => nav(`/category/${c.id}`)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: 14,
                    borderRadius: 18,
                    background: `${c.color}12`,
                    border: `1.5px solid ${c.color}30`,
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "transform 0.08s ease",
                  }}
                  onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
                  onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  onPointerLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                >
                  {/* Icon */}
                  <span
                    style={{
                      width: 52, height: 52, borderRadius: 16,
                      background: `${c.color}22`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 28, flexShrink: 0,
                    }}
                  >
                    {c.icon}
                  </span>

                  <div style={{ width: "100%" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)", lineHeight: 1.2 }}>
                      {c.name}
                    </div>

                    {/* Count row */}
                    {total > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                        {biz > 0 && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 7px",
                            borderRadius: 20, background: `${c.color}22`, color: c.color,
                          }}>
                            🏪 {biz}
                          </span>
                        )}
                        {prov > 0 && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 7px",
                            borderRadius: 20, background: `${c.color}22`, color: c.color,
                          }}>
                            👤 {prov}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 5, lineHeight: 1.4 }}>
                        {isOther
                          ? t("allcat_other_desc")
                          : subNames.length > 0
                            ? subNames.join(" · ")
                            : t("allcat_be_first")}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
