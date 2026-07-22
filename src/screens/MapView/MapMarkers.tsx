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
type Selected =
  | { kind: "business"; data: Business }
  | { kind: "provider"; data: Provider }
  | { kind: "request"; data: RequestPost }
  | null;

function PinMarker({ lng, lat, html, onClick }: { lng: number; lat: number; html: string; onClick: () => void }) {
  return (
    <Marker longitude={lng} latitude={lat} anchor="bottom" onClick={onClick}>
      <span style={{ cursor: "pointer", display: "block" }} dangerouslySetInnerHTML={{ __html: html }} />
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
            onClick={() => setSelected({ kind: "business", data: b })}
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
            onClick={() => setSelected({ kind: "provider", data: p })}
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
          onClick={() => setSelected({ kind: "request", data: r })}
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
                __html: `<div style="width:44px;height:44px;border-radius:50%;${seen ? "background:var(--ink-400)" : "background:linear-gradient(135deg,#ff8400,var(--pink-500),var(--brand-600))"};padding:2.5px;box-shadow:0 2px 10px rgba(0,0,0,0.35)"><div style="width:100%;height:100%;border-radius:50%;background:var(--ink-200);overflow:hidden;border:2px solid #fff">${s.authorAvatar ? `<img src="${s.authorAvatar}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" />` : ""}</div></div>`,
              }}
            />
          </Marker>
        );
      })}

      {selected && (
        <Popup
          longitude={selected.kind === "request" ? (selected.data.lng as number) : selected.data.lng}
          latitude={selected.kind === "request" ? (selected.data.lat as number) : selected.data.lat}
          anchor="bottom"
          offset={40}
          closeButton
          closeOnClick={false}
          onClose={() => setSelected(null)}
        >
          {selected.kind === "business" && (() => {
            const b = selected.data;
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

          {selected.kind === "provider" && (() => {
            const p = selected.data;
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

          {selected.kind === "request" && (() => {
            const r = selected.data;
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
