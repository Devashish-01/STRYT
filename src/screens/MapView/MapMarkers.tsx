import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Marker, Popup } from "react-map-gl/maplibre";
import { Rating, inr } from "@/components/common";
import { useApp } from "@/store";
import { evaluateProviderAvailability } from "@/utils/availability";
import type { Story } from "@/types";
import type { Layer } from "./mapIcons";
import {
  pinColors, businessIconHtml, businessOfflineIconHtml,
  providerIconHtml, providerOfflineIconHtml, requestIconHtml,
} from "./mapIcons";
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
type Selected =
  | { kind: "business"; id: string }
  | { kind: "provider"; id: string }
  | { kind: "request"; id: string }
  | null;

/** Minimum comfortable touch target (iOS HIG / Material both land here). */
const MIN_TAP_PX = 44;

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
}: {
  layers: Record<Layer, boolean>;
  filteredBusinesses: Business[];
  filteredProviders: Provider[];
  nearbyRequests: RequestPost[];
  mapStories: Story[];
  onStoryClick: (stories: Story[], idx: number) => void;
}) {
  const nav = useNavigate();
  const { viewedStories } = useApp();
  const { t } = useI18n();
  const [selected, setSelected] = useState<Selected>(null);

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
      {/* Businesses */}
      {layers.business && filteredBusinesses.map((b) => {
        const isBizOpen = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil).isOpenNow;
        return (
          <PinMarker
            key={b.id}
            lng={b.lng}
            lat={b.lat}
            html={isBizOpen ? businessIconHtml : businessOfflineIconHtml}
            label={b.name}
            onClick={() => setSelected({ kind: "business", id: b.id })}
          />
        );
      })}

      {/* Providers */}
      {layers.provider && filteredProviders.map((p) => {
        const isOpen = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil).isOpenNow;
        return (
          <PinMarker
            key={p.id}
            lng={p.lng}
            lat={p.lat}
            html={isOpen ? providerIconHtml : providerOfflineIconHtml}
            label={safeName(p.displayName, "Local provider")}
            onClick={() => setSelected({ kind: "provider", id: p.id })}
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
          onClick={() => setSelected({ kind: "request", id: r.id })}
        />
      ))}

      {/* Stories — avatar bubbles, tap opens the viewer directly (no popup) */}
      {layers.story && mapStories.map((s, i) => {
        const seen = viewedStories.includes(s.id);
        return (
          <Marker key={s.id} longitude={s.lng!} latitude={s.lat!} anchor="center" onClick={() => onStoryClick(mapStories, i)}>
            <span
              style={{ cursor: "pointer", display: "block" }}
              dangerouslySetInnerHTML={{
                __html: `<div style="width:44px;height:44px;border-radius:50%;${seen ? "background:var(--ink-400)" : "background:linear-gradient(135deg,#ff8400,var(--pink-500),var(--brand-600))"};padding:2.5px;box-shadow:0 2px 10px rgba(0,0,0,0.35)"><div style="width:100%;height:100%;border-radius:50%;background:var(--ink-200);overflow:hidden;border:2px solid #fff">${s.authorAvatar ? `<img src="${s.authorAvatar}" alt="${s.authorName ?? ""}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" />` : ""}</div></div>`,
              }}
            />
          </Marker>
        );
      })}

      {selectedPoint && (
        <Popup
          longitude={selectedPoint.lng as number}
          latitude={selectedPoint.lat as number}
          anchor="bottom"
          offset={40}
          closeButton
          closeOnClick={false}
          onClose={() => setSelected(null)}
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
                  style={{ marginTop: 8, padding: "6px 12px", background: isBizOpen ? pinColors.business : "var(--ink-500)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
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
                  style={{ marginTop: 8, padding: "6px 12px", background: isOpen ? pinColors.provider : "var(--ink-500)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
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
                  style={{ marginTop: 8, padding: "6px 12px", background: pinColors.request, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
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
