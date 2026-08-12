import { useEffect, useMemo, useRef } from "react";
import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { Rating, inr } from "@/components/common";
import { Store, Briefcase } from "@/components/Icons";
import { useApp } from "@/store";
import { evaluateProviderAvailability } from "@/utils/availability";
import { displayName as safeName } from "@/lib/publicName";
import { pedestrianDistanceLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { AvatarPin, type RingTone } from "./AvatarPin";
import { pinColors } from "./mapIcons";
import type { Selected } from "./MapMarkers";
import type { Story, Business, Provider, RequestPost } from "@/types";

interface Row {
  key: string;
  kind: "business" | "provider" | "request" | "story";
  id: string;
  title: string;
  sub: string;
  distanceKm: number | null;
  lat: number;
  lng: number;
  photo?: string | null;
  tone?: RingTone;
  fallback?: ComponentType<{ size?: number | string; color?: string }>;
  rating?: number;
  onOpen?: () => void;
}

const SCROLL_SETTLE_MS = 150;

function kmBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function MapCarousel({
  centerLat, centerLng, loading,
  businesses, providers, requests, stories,
  selected, onSelect, onEaseTo, onStoryClick,
  isListView,
}: {
  centerLat: number;
  centerLng: number;
  loading: boolean;
  businesses: Business[];
  providers: Provider[];
  requests: RequestPost[];
  stories: Story[];
  selected: Selected;
  onSelect: (s: Selected) => void;
  onEaseTo: (lat: number, lng: number) => void;
  onStoryClick: (stories: Story[], idx: number) => void;
  isListView?: boolean;
}) {
  const nav = useNavigate();
  const { viewedStories } = useApp();
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const settleTimerRef = useRef<number | null>(null);
  const lastSyncedKeyRef = useRef<string | null>(null);

  function selectRow(r: Row) {
    if (r.kind === "story") return;
    lastSyncedKeyRef.current = r.key;
    onSelect({ kind: r.kind, id: r.id });
    onEaseTo(r.lat, r.lng);
  }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (businesses.length > 0) {
      for (const b of businesses) {
        if (!b.lat || !b.lng) continue;
        const dist = kmBetween(centerLat, centerLng, b.lat, b.lng);
        const isOpen = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil).isOpenNow;
        out.push({
          key: `b:${b.id}`,
          kind: "business",
          id: b.id,
          title: b.name,
          sub: b.subCategory || b.categoryName || "Local Shop",
          distanceKm: dist,
          lat: b.lat,
          lng: b.lng,
          photo: b.coverImage,
          tone: isOpen ? "open" : "closed",
          fallback: Store,
          rating: b.ratingAvg,
        });
      }
    }
    if (providers.length > 0) {
      for (const p of providers) {
        if (!p.lat || !p.lng) continue;
        const dist = kmBetween(centerLat, centerLng, p.lat, p.lng);
        const isOpen = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil).isOpenNow;
        out.push({
          key: `p:${p.id}`,
          kind: "provider",
          id: p.id,
          title: safeName(p.displayName, "Local provider"),
          sub: p.categoryName || "Provider",
          distanceKm: dist,
          lat: p.lat,
          lng: p.lng,
          photo: p.avatar,
          tone: isOpen ? "available" : "unavailable",
          fallback: Briefcase,
          rating: p.ratingAvg,
        });
      }
    }
    if (requests.length > 0) {
      for (const r of requests) {
        if (!r.lat || !r.lng) continue;
        const dist = kmBetween(centerLat, centerLng, r.lat, r.lng);
        out.push({
          key: `r:${r.id}`,
          kind: "request",
          id: r.id,
          title: r.title,
          sub: r.budgetMax ? inr(r.budgetMax) : r.categoryName || "Request",
          distanceKm: dist,
          lat: r.lat,
          lng: r.lng,
        });
      }
    }
    if (stories.length > 0) {
      for (let i = 0; i < stories.length; i++) {
        const s = stories[i];
        if (!s.lat || !s.lng) continue;
        const dist = kmBetween(centerLat, centerLng, s.lat, s.lng);
        const seen = viewedStories.includes(s.id);
        out.push({
          key: `s:${s.id}`,
          kind: "story",
          id: s.id,
          title: s.authorName || "Local story",
          sub: "Story",
          distanceKm: dist,
          lat: s.lat,
          lng: s.lng,
          photo: s.authorAvatar,
          tone: seen ? "story-seen" : "story-new",
          onOpen: () => onStoryClick(stories, i),
        });
      }
    }
    out.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    return out;
  }, [businesses, providers, requests, stories, centerLat, centerLng, viewedStories, onStoryClick]);

  function isColumnLayout(container: HTMLElement): boolean {
    return getComputedStyle(container).flexDirection.startsWith("column");
  }

  useEffect(() => {
    if (!selected) return;
    const key = `${selected.kind[0]}:${selected.id}`;
    if (key === lastSyncedKeyRef.current) return;
    const el = cardRefs.current.get(key);
    const container = containerRef.current;
    if (!el || !container) return;
    lastSyncedKeyRef.current = key;
    const column = isColumnLayout(container);
    el.scrollIntoView({
      behavior: "smooth",
      inline: column ? "nearest" : "start",
      block: column ? "start" : "nearest",
    });
  }, [selected]);

  useEffect(() => () => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
  }, []);

  function handleScroll() {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const column = isColumnLayout(container);
      let nearest: Row | null = null;
      let nearestDist = Infinity;
      for (const r of rows) {
        const el = cardRefs.current.get(r.key);
        if (!el) continue;
        const dist = column
          ? Math.abs(el.offsetTop - container.scrollTop)
          : Math.abs(el.offsetLeft - container.scrollLeft);
        if (dist < nearestDist) { nearestDist = dist; nearest = r; }
      }
      if (nearest && nearest.key !== lastSyncedKeyRef.current) selectRow(nearest);
    }, SCROLL_SETTLE_MS);
  }

  if (rows.length === 0) {
    return (
      <div className={`map-carousel${isListView ? " is-list-view" : ""}`}>
        <div className="map-carousel__card map-carousel__card--empty map-glass-panel">
          <span style={{ fontSize: 22 }}>🗺️</span>
          <span className="tiny semi">{loading ? t("map_searching") : t("map_carousel_empty")}</span>
          {!loading && <span className="tiny muted">{t("map_carousel_empty_hint")}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`map-carousel${isListView ? " is-list-view" : ""}`} ref={containerRef} onScroll={handleScroll}>
      {rows.map((r) => {
        const isSelected = !!selected && selected.kind === r.kind && selected.id === r.id;
        return (
          <button
            key={r.key}
            type="button"
            className={`map-carousel__card map-glass-panel${isSelected ? " map-carousel__card--selected" : ""}`}
            ref={(el) => { if (el) cardRefs.current.set(r.key, el); else cardRefs.current.delete(r.key); }}
            onClick={() => (r.kind === "story" ? r.onOpen?.() : selectRow(r))}
          >
            <div className="map-carousel__row">
              {r.kind === "request" ? (
                <span className="map-carousel__dot" style={{ background: pinColors.request }} />
              ) : (
                <AvatarPin photo={r.photo} name={r.title} tone={r.tone ?? "closed"} fallback={r.fallback} size={44} />
              )}
              <span className="map-carousel__info">
                <span className="map-carousel__title ellipsis">{r.title}</span>
                <span className="map-carousel__sub ellipsis">
                  {r.distanceKm != null ? pedestrianDistanceLabel(r.distanceKm, t) : r.sub}
                </span>
                {r.rating != null && r.rating > 0 && (
                  <span className="map-carousel__rating">
                    <Rating value={r.rating} size={9} />
                  </span>
                )}
              </span>
            </div>

            {/* Inline Quick Action bar — list / desktop only (CSS hides on tray chips). */}
            {isSelected && r.kind !== "story" && (
              <div className="map-carousel__actions">
                {r.kind === "business" && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        nav(`/business/${r.id}`);
                      }}
                      style={{
                        flex: 1,
                        padding: "6px 8px",
                        borderRadius: 10,
                        background: "var(--brand-600)",
                        color: "#fff",
                        border: "none",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      🎟️ {t("map_join_queue")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        nav("/chats");
                      }}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        background: "rgba(139, 71, 245, 0.12)",
                        color: "var(--brand-700)",
                        border: "none",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      💬 {t("map_chat")}
                    </button>
                  </>
                )}
                {r.kind === "provider" && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        nav(`/provider/${r.id}`);
                      }}
                      style={{
                        flex: 1,
                        padding: "6px 8px",
                        borderRadius: 10,
                        background: "var(--green-600)",
                        color: "#fff",
                        border: "none",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      📅 {t("map_book_slot")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        nav("/chats");
                      }}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        background: "rgba(22, 163, 74, 0.12)",
                        color: "var(--green-700)",
                        border: "none",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      💬 {t("map_chat")}
                    </button>
                  </>
                )}
                {r.kind === "request" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      nav(`/request/${r.id}`);
                    }}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: 10,
                      background: "var(--brand-600)",
                      color: "#fff",
                      border: "none",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    🤝 {t("map_submit_bid")}
                  </button>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
