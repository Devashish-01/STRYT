import { useEffect, useMemo, useRef } from "react";
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
import type { Selected } from "./MapMarkers";
import type { Story, Business, Provider, RequestPost } from "@/types";

/**
 * The map's results surface (MAP_SNAPCHAT_STYLE_PLAN.md, Phase B) — replaces
 * `MapResultsSheet`'s 3-detent drawer with a snap-scrolling card tray, same
 * spirit as Snap Map's story tray. No background panel: cards float directly
 * over the full-bleed map (D1 — "browsing moves the map, it doesn't open a
 * panel over it").
 *
 * Phase C adds the bidirectional half: `selected` is the SAME state
 * MapMarkers' Popup uses, lifted to MapView/index.tsx ("one state, two views
 * of it"). Scrolling settles on a card → that card is selected and the map
 * eases to it. Tapping a map pin sets `selected` from the other side → this
 * component scrolls to match. Each direction tracks the last key IT
 * synced so the resulting scroll/select doesn't immediately echo back and
 * re-trigger the other direction.
 *
 * Stories are excluded from this sync on purpose: they don't have a Popup/
 * selection state on the map either (tapping a story pin opens the viewer
 * directly today) — a story card keeps that same direct-open behavior.
 */

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
  /** Stories only — they open the viewer directly and sit outside the selection sync (see file header). Everything else goes through selectRow(). */
  onOpen?: () => void;
}

/** Milliseconds of scroll inactivity before the resting card counts as "picked" — long enough to not fire mid-swipe, short enough to still feel live. */
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
  /** Ease the map to a result's point — never re-searches, just looks. */
  onEaseTo: (lat: number, lng: number) => void;
  onStoryClick: (stories: Story[], idx: number) => void;
}) {
  const { viewedStories } = useApp();
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const settleTimerRef = useRef<number | null>(null);
  // The row key THIS component last synced in either direction — lets each
  // direction recognize an echo of its own action and skip re-acting on it.
  const lastSyncedKeyRef = useRef<string | null>(null);

  function selectRow(r: Row) {
    if (r.kind === "story") return;
    lastSyncedKeyRef.current = r.key;
    onSelect({ kind: r.kind, id: r.id });
    onEaseTo(r.lat, r.lng);
  }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const b of businesses) {
      if (b.lat == null || b.lng == null) continue;
      const isOpen = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil).isOpenNow;
      out.push({
        key: `b:${b.id}`, kind: "business", id: b.id, title: b.name, sub: b.subCategory || b.categoryName || "Shop",
        distanceKm: b.distanceKm ?? kmBetween(centerLat, centerLng, b.lat, b.lng),
        lat: b.lat, lng: b.lng, photo: b.coverImage, tone: isOpen ? "open" : "closed", fallback: Store,
        rating: b.ratingAvg,
      });
    }
    for (const p of providers) {
      if (p.lat == null || p.lng == null) continue;
      const isOpen = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil).isOpenNow;
      out.push({
        key: `p:${p.id}`, kind: "provider", id: p.id, title: safeName(p.displayName, "Local provider"),
        sub: `${p.categoryName ?? "Provider"}${p.startingPrice ? ` · from ${inr(p.startingPrice)}` : ""}`,
        distanceKm: kmBetween(centerLat, centerLng, p.lat, p.lng),
        lat: p.lat, lng: p.lng, photo: p.avatar, tone: isOpen ? "available" : "unavailable", fallback: Briefcase,
        rating: p.ratingAvg,
      });
    }
    for (const r of requests) {
      if (r.lat == null || r.lng == null) continue;
      out.push({
        key: `r:${r.id}`, kind: "request", id: r.id, title: r.title, sub: r.categoryName || "Request",
        distanceKm: kmBetween(centerLat, centerLng, r.lat, r.lng),
        lat: r.lat, lng: r.lng,
      });
    }
    stories.forEach((s, i) => {
      if (s.lat == null || s.lng == null) return;
      out.push({
        key: `s:${s.id}`, kind: "story", id: s.id, title: s.authorName || "Story",
        sub: viewedStories.includes(s.id) ? "Seen" : "New story",
        distanceKm: kmBetween(centerLat, centerLng, s.lat, s.lng),
        lat: s.lat, lng: s.lng, photo: s.authorAvatar,
        tone: viewedStories.includes(s.id) ? "story-seen" : "story-new",
        onOpen: () => onStoryClick(stories, i),
      });
    });
    // Nearest first — with unlocatable rows last rather than sorting as 0.
    return out.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [businesses, providers, requests, stories, centerLat, centerLng, viewedStories, onStoryClick]);

  // Row on mobile (horizontal snap-scroll), column on desktop (Phase F's
  // left-docked vertical panel — MAP_SNAPCHAT_STYLE_PLAN.md §2.2) — CSS
  // alone decides which, via the @media (min-width: 768px) breakpoint on
  // .map-carousel. Reading it back here (rather than a second JS breakpoint
  // check) means this can never drift out of sync with whatever the actual
  // rendered layout is.
  function isColumnLayout(container: HTMLElement): boolean {
    return getComputedStyle(container).flexDirection.startsWith("column");
  }

  // Map → carousel: an external selection (a map-pin tap) scrolls the
  // matching card into view. Skipped when the key matches what THIS
  // component just synced itself, so the scroll our own settle handler
  // caused below doesn't bounce back into a second, redundant scroll.
  useEffect(() => {
    if (!selected) return;
    const key = `${selected.kind[0]}:${selected.id}`;
    if (key === lastSyncedKeyRef.current) return;
    const el = cardRefs.current.get(key);
    const container = containerRef.current;
    if (!el || !container) return; // not in this carousel's current rows (filtered out, etc.)
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

  // Carousel → map: after a scroll gesture settles (debounced, not per-frame
  // — easing the map on every scroll event would fight the user's own
  // swipe), find whichever card is now leading the row and select + ease to
  // it. Cards snap-align "start", so the nearest offset to the current
  // scroll position (along whichever axis is actually scrolling) is the
  // resting one.
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
      // Settling on the card a map-pin tap just scrolled us to isn't a new
      // pick — skip it, or every pin tap would re-fire an identical
      // onSelect/onEaseTo once the resulting scrollIntoView settles.
      if (nearest && nearest.key !== lastSyncedKeyRef.current) selectRow(nearest);
    }, SCROLL_SETTLE_MS);
  }

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
    <div className="map-carousel" ref={containerRef} onScroll={handleScroll}>
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
            {r.kind === "request" ? (
              <span className="map-carousel__dot" style={{ background: pinColors.request }} />
            ) : (
              <AvatarPin photo={r.photo} name={r.title} tone={r.tone ?? "closed"} fallback={r.fallback} size={44} />
            )}
            {/* display:contents on mobile — invisible to the row layout, same
                as if title/sub/rating sat directly in the card. On desktop
                (Phase F) this becomes the column that sits beside the avatar
                in a list row instead of stacking under it. */}
            <span className="map-carousel__info">
              <span className="map-carousel__title ellipsis">{r.title}</span>
              <span className="map-carousel__sub ellipsis">
                {r.distanceKm != null ? distanceLabel(r.distanceKm, t) : r.sub}
              </span>
              {r.rating != null && r.rating > 0 && <Rating value={r.rating} size={9} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
