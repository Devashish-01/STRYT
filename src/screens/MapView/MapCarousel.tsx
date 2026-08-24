import { useEffect, useMemo, useRef } from "react";
import type { ComponentType } from "react";
import { inr } from "@/components/common";
import { Store, Briefcase, Mountains, Trophy, Binoculars, MapPin as MapPinIcon } from "@/components/Icons";
import { useApp } from "@/store";
import { evaluateProviderAvailability } from "@/utils/availability";
import { displayName as safeName } from "@/lib/publicName";
import { pedestrianDistanceLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { AvatarPin, type RingTone } from "./AvatarPin";
import { pinColors } from "./mapIcons";
import type { Selected } from "./MapMarkers";
import type { Story, Business, Provider, RequestPost, Place, PlaceCategory } from "@/types";

const PLACE_CATEGORY_ICON: Record<PlaceCategory, ComponentType<{ size?: number | string; color?: string }>> = {
  MOUNTAIN: Mountains,
  TREK: Binoculars,
  SPORTS_VENUE: Trophy,
  TOURIST_SPOT: MapPinIcon,
  OTHER: Mountains,
};

interface Row {
  key: string;
  kind: "business" | "provider" | "request" | "story" | "place";
  id: string;
  title: string;
  sub: string;
  distanceKm: number | null;
  lat: number;
  lng: number;
  photo?: string | null;
  tone?: RingTone;
  fallback?: ComponentType<{ size?: number | string; color?: string }>;
  /** "square" tells the shop's photo from a provider's/story's circular
   *  avatar at a glance, matching how the rest of the app already
   *  differentiates them — omitted (defaults to circle) for everything else. */
  shape?: "circle" | "square";
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
  businesses, providers, requests, stories, places,
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
  places: Place[];
  selected: Selected;
  onSelect: (s: Selected) => void;
  onEaseTo: (lat: number, lng: number) => void;
  onStoryClick: (stories: Story[], idx: number) => void;
  isListView?: boolean;
}) {
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
          shape: "square",
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
          sub: p.subCategory || p.categoryName || "Provider",
          distanceKm: dist,
          lat: p.lat,
          lng: p.lng,
          photo: p.avatar,
          tone: isOpen ? "available" : "unavailable",
          fallback: Briefcase,
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
    if (places.length > 0) {
      for (const pl of places) {
        if (!pl.lat || !pl.lng) continue;
        const dist = kmBetween(centerLat, centerLng, pl.lat, pl.lng);
        out.push({
          key: `pl:${pl.id}`,
          kind: "place",
          id: pl.id,
          title: pl.name,
          sub: pl.category.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()),
          distanceKm: dist,
          lat: pl.lat,
          lng: pl.lng,
          photo: pl.coverImage,
          tone: "place",
          fallback: PLACE_CATEGORY_ICON[pl.category] ?? Mountains,
        });
      }
    }
    out.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    return out;
  }, [businesses, providers, requests, stories, places, centerLat, centerLng, viewedStories, onStoryClick]);

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
                <AvatarPin
                  photo={r.photo}
                  name={r.title}
                  tone={r.tone ?? "closed"}
                  fallback={r.fallback}
                  shape={r.shape}
                  size={52}
                />
              )}
              <span className="map-carousel__info">
                <span className="map-carousel__title ellipsis">{r.title}</span>
                <span className="map-carousel__sub ellipsis">
                  {r.distanceKm != null ? pedestrianDistanceLabel(r.distanceKm, t) : r.sub}
                </span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
