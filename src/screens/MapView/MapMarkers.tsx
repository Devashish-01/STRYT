import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { Marker, Popup } from "react-map-gl/maplibre";
import { Rating, inr } from "@/components/common";
import { Store, Briefcase } from "@/components/Icons";
import { useApp } from "@/store";
import { evaluateProviderAvailability } from "@/utils/availability";
import type { Story } from "@/types";
import type { Layer } from "./mapIcons";
import { pinColors, requestIconHtml } from "./mapIcons";
import { AvatarPin, MIN_TAP_PX, RING_BACKGROUND, type RingTone } from "./AvatarPin";
import type { Business, Provider } from "@/types";
import type { RequestPost } from "@/types";
import { displayName as safeName } from "@/lib/publicName";
import { distanceLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

// react-map-gl separates <Popup> from <Marker> (no nested-children-opens-
// on-click like react-leaflet) — one "which pin is selected" state drives a
// single conditionally-rendered Popup, positioned at that pin's coordinates.
//
// Selection is held as a REFERENCE (kind + id), not a snapshot of the object.
// It used to hold the row itself, which meant the popup outlived its pin: turn
// the layer off, narrow the radius, or let a query refetch, and the pin
// vanished while a popup full of stale data stayed floating over the map.
// Resolving it against the current lists on every render makes the popup
// strictly a view of something that is still on screen.
//
// Owned by MapView/index.tsx (Phase C, MAP_SNAPCHAT_STYLE_PLAN.md §2.1) —
// used to live as local state here, but the carousel needs to read and drive
// the same selection ("one state, two views of it"), so it's a controlled
// prop now instead.
export type Selected =
  | { kind: "business"; id: string }
  | { kind: "provider"; id: string }
  | { kind: "request"; id: string }
  | null;

/** AvatarPin wired into a map <Marker> — center-anchored, since a circle (unlike a teardrop) sits directly on its point rather than pointing down at it. */
function AvatarMarker({ lng, lat, label, onClick, badge, livePulse, ...avatar }: {
  lng: number; lat: number; label: string; onClick: () => void;
  photo?: string | null; name?: string | null; tone: RingTone;
  fallback?: ComponentType<{ size?: number | string; color?: string }>;
  badge?: string | null;
  livePulse?: boolean;
}) {
  return (
    <Marker longitude={lng} latitude={lat} anchor="center" onClick={onClick}>
      <span role="button" aria-label={label} style={{ display: "block" }}>
        <AvatarPin {...avatar} badge={badge} livePulse={livePulse} />
      </span>
    </Marker>
  );
}

/** The plain teardrop pin — kept for requests only. See mapIcons.ts's pinHtml comment for why. */
function PinMarker({ lng, lat, html, label, onClick }: {
  lng: number; lat: number; html: string; label: string; onClick: () => void;
}) {
  return (
    <Marker longitude={lng} latitude={lat} anchor="bottom" onClick={onClick}>
      <span style={{ cursor: "pointer", display: "block", position: "relative" }} role="button" aria-label={label}>
        <span style={{ display: "block" }} dangerouslySetInnerHTML={{ __html: html }} />
        {/* The pin art is 32×40 (mapIcons.ts) — under the 44pt minimum, which
            is why pins felt fiddly to hit on a phone. This transparent overlay
            widens the hit area without moving the pin or its anchor: it's
            absolutely positioned, so it contributes no layout. */}
        <span
          aria-hidden
          style={{
            position: "absolute", left: "50%", top: "50%",
            transform: "translate(-50%, -50%)",
            width: MIN_TAP_PX, height: MIN_TAP_PX,
          }}
        />
      </span>
    </Marker>
  );
}

export function MapMarkers({
  layers, filteredBusinesses, filteredProviders, nearbyRequests, mapStories, onStoryClick,
  selected, onSelect,
}: {
  layers: Record<Layer, boolean>;
  filteredBusinesses: Business[];
  filteredProviders: Provider[];
  nearbyRequests: RequestPost[];
  mapStories: Story[];
  onStoryClick: (stories: Story[], idx: number) => void;
  selected: Selected;
  onSelect: (s: Selected) => void;
}) {
  const nav = useNavigate();
  const { viewedStories } = useApp();
  const { t } = useI18n();

  // Resolve the selection against the CURRENT lists. If the pin is gone —
  // layer toggled off, radius narrowed, refetch dropped it — this is
  // undefined and no popup renders, instead of one hanging over empty map.
  const selectedBusiness = selected?.kind === "business"
    ? filteredBusinesses.find((b) => b.id === selected.id) : undefined;
  const selectedProvider = selected?.kind === "provider"
    ? filteredProviders.find((p) => p.id === selected.id) : undefined;
  const selectedRequest = selected?.kind === "request"
    ? nearbyRequests.find((r) => r.id === selected.id) : undefined;
  const selectedPoint = selectedBusiness ?? selectedProvider ?? selectedRequest;

  return (
    <>
      {/* Businesses — the shop's own cover photo in a ring, open now = brand,
          closed = grey. No photo yet: a Store glyph, not a blank circle. */}
      {layers.business && filteredBusinesses.map((b) => {
        const isBizOpen = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil).isOpenNow;
        const queueCount = (b as any).queueLength ?? 0;
        const badgeText = isBizOpen
          ? (queueCount > 0 ? `🟢 ${queueCount} queue` : "🟢 Open")
          : null;
        const livePulse = isBizOpen && queueCount > 0;
        return (
          <AvatarMarker
            key={b.id}
            lng={b.lng}
            lat={b.lat}
            photo={b.coverImage}
            name={b.name}
            tone={isBizOpen ? "open" : "closed"}
            fallback={Store}
            label={b.name}
            badge={badgeText}
            livePulse={livePulse}
            onClick={() => onSelect({ kind: "business", id: b.id })}
          />
        );
      })}

      {/* Providers — same treatment, green ring while available. */}
      {layers.provider && filteredProviders.map((p) => {
        const isOpen = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil).isOpenNow;
        const badgeText = isOpen ? "⚡ Free" : null;
        return (
          <AvatarMarker
            key={p.id}
            lng={p.lng}
            lat={p.lat}
            photo={p.avatar}
            name={safeName(p.displayName, "Local provider")}
            tone={isOpen ? "available" : "unavailable"}
            fallback={Briefcase}
            label={safeName(p.displayName, "Local provider")}
            badge={badgeText}
            livePulse={isOpen}
            onClick={() => onSelect({ kind: "provider", id: p.id })}
          />
        );
      })}

      {/* Requests */}
      {layers.request && nearbyRequests.map((r) => (
        <PinMarker
          key={r.id}
          lng={r.lng as number}
          lat={r.lat as number}
          html={requestIconHtml}
          label={r.title}
          onClick={() => onSelect({ kind: "request", id: r.id })}
        />
      ))}

      {/* Stories — avatar bubbles, tap opens the viewer directly (no popup).
          Same AvatarPin as businesses/providers now — gradient ring = unseen,
          grey = seen, unchanged from before this was generalized. */}
      {layers.story && mapStories.map((s, i) => {
        const seen = viewedStories.includes(s.id);
        return (
          <Marker key={s.id} longitude={s.lng!} latitude={s.lat!} anchor="center" onClick={() => onStoryClick(mapStories, i)}>
            <AvatarPin photo={s.authorAvatar} name={s.authorName} tone={seen ? "story-seen" : "story-new"} />
          </Marker>
        );
      })}

      {selectedPoint && (
        <Popup
          longitude={selectedPoint.lng as number}
          latitude={selectedPoint.lat as number}
          anchor="bottom"
          // 40 clears the OLD teardrop (anchor="bottom", 40px tall, so the geo
          // point sits at its tip and the popup needs the pin's full height of
          // clearance above it) — still correct for requests, which kept that
          // pin. Businesses/providers now render as a 44px circle centered ON
          // the point (anchor="center"), so only half its height plus a small
          // gap is needed, or the popup floats with an obvious empty gap above
          // the avatar.
          offset={selected?.kind === "request" ? 40 : 30}
          closeButton
          closeOnClick={false}
          onClose={() => onSelect(null)}
        >
          {selectedBusiness && (() => {
            const b = selectedBusiness;
            const isBizOpen = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil).isOpenNow;
            return (
              <div style={{ minWidth: 180 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{b.name}</strong>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: isBizOpen ? "var(--green-100)" : "var(--ink-100)", color: isBizOpen ? "var(--green-600)" : "var(--ink-600)", fontWeight: 700 }}>
                    {isBizOpen ? t("map_open") : t("map_closed")}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-600)", marginTop: 2 }}>{b.subCategory}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <Rating value={b.ratingAvg} size={11} />
                  {b.distanceKm != null && <span style={{ fontSize: 12, color: "var(--ink-500)" }}>{distanceLabel(b.distanceKm, t)}</span>}
                </div>
                <button
                  onClick={() => nav(`/business/${b.id}`)}
                  style={{ marginTop: 8, padding: "6px 12px", background: isBizOpen ? RING_BACKGROUND.open : "var(--ink-500)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, width: "100%" }}
                >
                  {t("map_view_shop")}
                </button>
              </div>
            );
          })()}

          {selectedProvider && (() => {
            const p = selectedProvider;
            const isOpen = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil).isOpenNow;
            return (
              <div style={{ minWidth: 180 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{safeName(p.displayName, "Local provider")}</strong>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: isOpen ? "var(--green-100)" : "var(--ink-100)", color: isOpen ? "var(--green-600)" : "var(--ink-600)", fontWeight: 700 }}>
                    {isOpen ? t("map_available") : t("map_offline")}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-600)", marginTop: 2 }}>{p.categoryName} · from {inr(p.startingPrice)}</div>
                <div style={{ marginTop: 4 }}><Rating value={p.ratingAvg} size={11} /></div>
                <button
                  onClick={() => nav(`/provider/${p.id}`)}
                  style={{ marginTop: 8, padding: "6px 12px", background: isOpen ? RING_BACKGROUND.available : "var(--ink-500)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, width: "100%" }}
                >
                  {t("map_view_profile")}
                </button>
              </div>
            );
          })()}

          {selectedRequest && (() => {
            const r = selectedRequest;
            return (
              <div style={{ minWidth: 180 }}>
                <span style={{ fontSize: 11, background: "var(--brand-200)", color: "var(--brand-600)", padding: "2px 6px", borderRadius: 4 }}>{r.categoryName}</span>
                <div style={{ fontWeight: 700, marginTop: 4, fontSize: 14 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
                  {r.budgetMin && r.budgetMax ? `${inr(r.budgetMin)}–${inr(r.budgetMax)}` : t("budget_open")}
                </div>
                <button
                  onClick={() => nav(`/request/${r.id}`)}
                  style={{ marginTop: 8, padding: "6px 12px", background: pinColors.request, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, width: "100%" }}
                >
                  {t("map_view_request")}
                </button>
              </div>
            );
          })()}
        </Popup>
      )}
    </>
  );
}
