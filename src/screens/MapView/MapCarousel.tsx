import { useMemo } from "react";
import type { ComponentType } from "react";
import { Rating, inr } from "@/components/common";
import { Store, Briefcase } from "@/components/Icons";
import { useApp } from "@/store";
import { evaluateProviderAvailability } from "@/utils/availability";
import { displayName as safeName } from "@/lib/publicName";
import { distanceLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { AvatarPin, type RingTone } from "./AvatarPin";
import { pinColors } from "./mapIcons";
import type { Story, Business, Provider, RequestPost } from "@/types";

/**
 * The map's results surface (MAP_SNAPCHAT_STYLE_PLAN.md, Phase B) — replaces
 * `MapResultsSheet`'s 3-detent drawer with a snap-scrolling card tray, same
 * spirit as Snap Map's story tray. No background panel: cards float directly
 * over the full-bleed map (D1 — "browsing moves the map, it doesn't open a
 * panel over it").
 *
 * Tapping a card eases the map to that point (`onFlyTo`, the same one-
 * directional action Phase D's search dropdown uses) rather than navigating
 * to the shop's detail page — this keeps browsing on the map. Full
 * bidirectional scroll↔map sync ("swipe the tray, the map follows") is
 * Phase C, which depends on this shipping first.
 */

interface Row {
  key: string;
  kind: "business" | "provider" | "request" | "story";
  title: string;
  sub: string;
  distanceKm: number | null;
  lat: number;
  lng: number;
  photo?: string | null;
  tone?: RingTone;
  fallback?: ComponentType<{ size?: number | string; color?: string }>;
  rating?: number;
  onOpen: () => void;
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

export function MapCarousel({
  centerLat, centerLng, loading,
  businesses, providers, requests, stories,
  onFlyTo, onStoryClick,
}: {
  centerLat: number;
  centerLng: number;
  loading: boolean;
  businesses: Business[];
  providers: Provider[];
  requests: RequestPost[];
  stories: Story[];
  /** Ease the map to a result's point. */
  onFlyTo: (lat: number, lng: number) => void;
  onStoryClick: (stories: Story[], idx: number) => void;
}) {
  const { viewedStories } = useApp();
  const { t } = useI18n();

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const b of businesses) {
      if (b.lat == null || b.lng == null) continue;
      const isOpen = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil).isOpenNow;
      out.push({
        key: `b:${b.id}`, kind: "business", title: b.name, sub: b.subCategory || b.categoryName || "Shop",
        distanceKm: b.distanceKm ?? kmBetween(centerLat, centerLng, b.lat, b.lng),
        lat: b.lat, lng: b.lng, photo: b.coverImage, tone: isOpen ? "open" : "closed", fallback: Store,
        rating: b.ratingAvg, onOpen: () => onFlyTo(b.lat!, b.lng!),
      });
    }
    for (const p of providers) {
      if (p.lat == null || p.lng == null) continue;
      const isOpen = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil).isOpenNow;
      out.push({
        key: `p:${p.id}`, kind: "provider", title: safeName(p.displayName, "Local provider"),
        sub: `${p.categoryName ?? "Provider"}${p.startingPrice ? ` · from ${inr(p.startingPrice)}` : ""}`,
        distanceKm: kmBetween(centerLat, centerLng, p.lat, p.lng),
        lat: p.lat, lng: p.lng, photo: p.avatar, tone: isOpen ? "available" : "unavailable", fallback: Briefcase,
        rating: p.ratingAvg, onOpen: () => onFlyTo(p.lat!, p.lng!),
      });
    }
    for (const r of requests) {
      if (r.lat == null || r.lng == null) continue;
      out.push({
        key: `r:${r.id}`, kind: "request", title: r.title, sub: r.categoryName || "Request",
        distanceKm: kmBetween(centerLat, centerLng, r.lat, r.lng),
        lat: r.lat, lng: r.lng, onOpen: () => onFlyTo(r.lat!, r.lng!),
      });
    }
    stories.forEach((s, i) => {
      if (s.lat == null || s.lng == null) return;
      out.push({
        key: `s:${s.id}`, kind: "story", title: s.authorName || "Story",
        sub: viewedStories.includes(s.id) ? "Seen" : "New story",
        distanceKm: kmBetween(centerLat, centerLng, s.lat, s.lng),
        lat: s.lat, lng: s.lng, photo: s.authorAvatar,
        tone: viewedStories.includes(s.id) ? "story-seen" : "story-new",
        onOpen: () => onStoryClick(stories, i),
      });
    });
    // Nearest first — with unlocatable rows last rather than sorting as 0.
    return out.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [businesses, providers, requests, stories, centerLat, centerLng, viewedStories, onFlyTo, onStoryClick]);

  if (rows.length === 0) {
    return (
      <div className="map-carousel">
        <div className="map-carousel__card map-carousel__card--empty map-glass-panel">
          <span style={{ fontSize: 22 }}>🗺️</span>
          <span className="tiny semi">{loading ? "Searching…" : "Nothing here yet"}</span>
          {!loading && <span className="tiny muted">Try Search this area</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="map-carousel">
      {rows.map((r) => (
        <button key={r.key} type="button" className="map-carousel__card map-glass-panel" onClick={r.onOpen}>
          {r.kind === "request" ? (
            <span className="map-carousel__dot" style={{ background: pinColors.request }} />
          ) : (
            <AvatarPin photo={r.photo} name={r.title} tone={r.tone ?? "closed"} fallback={r.fallback} size={44} />
          )}
          <span className="map-carousel__title ellipsis">{r.title}</span>
          <span className="map-carousel__sub ellipsis">
            {r.distanceKm != null ? distanceLabel(r.distanceKm, t) : r.sub}
          </span>
          {r.rating != null && r.rating > 0 && <Rating value={r.rating} size={9} />}
        </button>
      ))}
    </div>
  );
}
