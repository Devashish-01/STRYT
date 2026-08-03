import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Rating, SafeImg, inr } from "@/components/common";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";
import { displayName as safeName } from "@/lib/publicName";
import { distanceLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { pinColors } from "./mapIcons";
import type { Story, Business, Provider, RequestPost } from "@/types";

/**
 * The map's results surface.
 *
 * Replaces four separate pieces of floating chrome — the "N places" badge, the
 * LayerToggles row, the availability toggle and the modal NearbySheet — with
 * one draggable sheet. That's the point of the redesign: the map screen was
 * carrying six competing overlays, and the stylesheet had six CSS variables and
 * four `:has()` selectors doing arithmetic just to stack them.
 *
 * Three detents (peek → half → full). Peek is the default so the map keeps most
 * of the screen.
 *
 * Two rules that come from having to work on native AND web:
 *   · The handle is a real button — tapping it cycles detents — so a mouse user
 *     is never forced to drag something.
 *   · Dragging is claimed only on the header. The list scrolls normally and the
 *     map keeps every gesture outside the sheet.
 */

export type ResultFilter = "all" | "business" | "provider" | "request" | "story";
type Detent = "peek" | "half" | "full";

const NEXT_DETENT: Record<Detent, Detent> = { peek: "half", half: "full", full: "peek" };

interface Row {
  key: string;
  kind: Exclude<ResultFilter, "all">;
  title: string;
  sub: string;
  distanceKm: number | null;
  onOpen: () => void;
  avatar?: string;
  emoji: string;
  rating?: number;
}

function kmBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MapResultsSheet({
  centerLat, centerLng, loading,
  businesses, providers, requests, stories,
  filter, setFilter, availOnly, setAvailOnly,
  radiusKm, onRadiusChange, radiusOptions = [],
  onStoryClick,
}: {
  centerLat: number;
  centerLng: number;
  loading: boolean;
  businesses: Business[];
  providers: Provider[];
  requests: RequestPost[];
  stories: Story[];
  filter: ResultFilter;
  setFilter: (f: ResultFilter) => void;
  availOnly: boolean;
  setAvailOnly: (v: boolean) => void;
  /** Explicit search radius in km, or null to follow the map's zoom. */
  radiusKm?: number | null;
  /** Omit to hide the radius row entirely (guests, who are capped). */
  onRadiusChange?: (km: number | null) => void;
  radiusOptions?: { label: string; km: number }[];
  onStoryClick: (stories: Story[], idx: number) => void;
}) {
  const nav = useNavigate();
  const { viewedStories } = useApp();
  const { t } = useI18n();
  const [detent, setDetent] = useState<Detent>("peek");
  const [dragY, setDragY] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; detent: Detent } | null>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const b of businesses) {
      out.push({
        key: `b:${b.id}`, kind: "business", title: b.name, sub: b.subCategory || b.categoryName || "Shop",
        distanceKm: b.distanceKm ?? (b.lat && b.lng ? kmBetween(centerLat, centerLng, b.lat, b.lng) : null),
        onOpen: () => nav(`/business/${b.id}`), emoji: "🏬", avatar: b.coverImage, rating: b.ratingAvg,
      });
    }
    for (const p of providers) {
      out.push({
        key: `p:${p.id}`, kind: "provider", title: safeName(p.displayName, "Local provider"),
        sub: `${p.categoryName ?? "Provider"}${p.startingPrice ? ` · from ${inr(p.startingPrice)}` : ""}`,
        distanceKm: p.lat && p.lng ? kmBetween(centerLat, centerLng, p.lat, p.lng) : null,
        onOpen: () => nav(`/provider/${p.id}`), emoji: "🧰", avatar: p.avatar, rating: p.ratingAvg,
      });
    }
    for (const r of requests) {
      out.push({
        key: `r:${r.id}`, kind: "request", title: r.title, sub: r.categoryName || "Request",
        distanceKm: r.lat && r.lng ? kmBetween(centerLat, centerLng, r.lat, r.lng) : null,
        onOpen: () => nav(`/request/${r.id}`), emoji: "🙋",
      });
    }
    stories.forEach((s, i) => {
      out.push({
        key: `s:${s.id}`, kind: "story",
        title: s.authorName || "Story",
        sub: viewedStories.includes(s.id) ? "Seen" : "New story",
        distanceKm: s.lat && s.lng ? kmBetween(centerLat, centerLng, s.lat, s.lng) : null,
        onOpen: () => onStoryClick(stories, i), emoji: "📸", avatar: s.authorAvatar,
      });
    });
    // Nearest first — with unlocatable rows last rather than sorting as 0.
    return out.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [businesses, providers, requests, stories, centerLat, centerLng, viewedStories, nav, onStoryClick]);

  const shown = filter === "all" ? rows : rows.filter((r) => r.kind === filter);

  const counts = useMemo(() => ({
    all: rows.length,
    business: businesses.length,
    provider: providers.length,
    request: requests.length,
    story: stories.length,
  }), [rows.length, businesses.length, providers.length, requests.length, stories.length]);

  const cycleDetent = useCallback(() => {
    haptics.selection();
    setDetent((d) => NEXT_DETENT[d]);
  }, []);

  // Pointer drag on the header only. Pointer events cover touch and mouse with
  // one code path, and setPointerCapture keeps the gesture even if the finger
  // leaves the handle.
  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = { y: e.clientY, detent };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    setDragY(e.clientY - dragStart.current.y);
  }
  function onPointerUp() {
    const delta = dragY ?? 0;
    if (dragStart.current && Math.abs(delta) > 40) {
      const order: Detent[] = ["peek", "half", "full"];
      const idx = order.indexOf(dragStart.current.detent);
      // Dragging UP (negative) opens further.
      const next = delta < 0 ? order[Math.min(order.length - 1, idx + 1)] : order[Math.max(0, idx - 1)];
      if (next !== detent) haptics.selection();
      setDetent(next);
    }
    dragStart.current = null;
    setDragY(null);
  }

  const chips: { id: ResultFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "business", label: "Shops" },
    { id: "provider", label: "People" },
    { id: "request", label: "Asks" },
    { id: "story", label: "Stories" },
  ];

  return (
    <div
      className={`map-sheet map-sheet--${detent}`}
      // Live drag offset, cleared on release so the CSS detent takes over.
      style={dragY != null ? { transform: `translateY(${Math.max(-40, dragY)}px)`, transition: "none" } : undefined}
    >
      <div
        className="map-sheet__grip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          className="map-sheet__handle"
          onClick={cycleDetent}
          aria-label={detent === "full" ? "Collapse results" : "Expand results"}
        />
        <div className="row between center-v" style={{ padding: "0 4px" }}>
          <span className="semi">
            {loading && shown.length === 0
              ? "Searching…"
              : `${counts.all} ${counts.all === 1 ? "place" : "places"} here`}
          </span>
          <button
            type="button"
            className={`chip tiny${availOnly ? " active" : ""}`}
            onClick={() => setAvailOnly(!availOnly)}
          >
            {t("map_open_now") || "Open now"}
          </button>
        </div>
      </div>

      <div className="map-sheet__filters hscroll">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip${filter === c.id ? " active" : ""}`}
            onClick={() => { haptics.selection(); setFilter(c.id); }}
          >
            {c.label}
            {counts[c.id] > 0 && <span className="tiny" style={{ marginLeft: 5, opacity: 0.7 }}>{counts[c.id]}</span>}
          </button>
        ))}
      </div>

      {/* How far to search.
          The redesign made radius derive from zoom, which removed the control
          entirely — but "how far" and "where" are two different questions and
          people want to answer them separately. So: radius is explicit here,
          panning still decides the centre.
          Leaving every option unselected means "follow the zoom", which is the
          redesigned behaviour and stays the default. */}
      {onRadiusChange && (
        <div className="map-sheet__radius hscroll">
          <span className="tiny muted map-sheet__radius-label">Within</span>
          <button
            type="button"
            className={`chip tiny${radiusKm == null ? " active" : ""}`}
            onClick={() => { haptics.selection(); onRadiusChange(null); }}
            title="Search whatever the map is showing"
          >
            Map view
          </button>
          {radiusOptions.map((o) => (
            <button
              key={o.km}
              type="button"
              className={`chip tiny${radiusKm === o.km ? " active" : ""}`}
              onClick={() => { haptics.selection(); onRadiusChange(o.km); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="map-sheet__list">
        {shown.length === 0 ? (
          <div className="col center" style={{ padding: "36px 20px", textAlign: "center", gap: 8 }}>
            <div style={{ fontSize: 30 }}>🗺️</div>
            <div className="semi small">Nothing here yet</div>
            <div className="tiny muted" style={{ maxWidth: 240 }}>
              Move the map and tap <b>Search this area</b> to look somewhere else.
            </div>
          </div>
        ) : (
          shown.map((r) => (
            <button key={r.key} type="button" className="map-sheet__row" onClick={r.onOpen}>
              {r.avatar ? (
                <SafeImg src={r.avatar} variant={r.kind === "provider" || r.kind === "story" ? "avatar" : "photo"} className="map-sheet__thumb" />
              ) : (
                <span className="map-sheet__thumb map-sheet__thumb--emoji" style={{ background: `${pinColors[r.kind === "story" ? "business" : r.kind]}14` }}>
                  {r.emoji}
                </span>
              )}
              <span className="col grow" style={{ minWidth: 0, gap: 2, textAlign: "left" }}>
                <span className="semi small ellipsis">{r.title}</span>
                <span className="tiny muted ellipsis">{r.sub}</span>
              </span>
              <span className="col" style={{ alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                {r.distanceKm != null && (
                  <span className="tiny muted">{distanceLabel(r.distanceKm, t)}</span>
                )}
                {r.rating != null && r.rating > 0 && <Rating value={r.rating} size={10} />}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
