import { useNavigate } from "react-router-dom";
import { Marker, Popup } from "react-leaflet";
import { Rating, inr } from "@/components/common";
import { useApp } from "@/store";
import { evaluateProviderAvailability } from "@/utils/availability";
import type { Story } from "@/types";
import type { Layer } from "./mapIcons";
import {
  pinColors, businessIcon, businessOfflineIcon,
  providerIcon, providerOfflineIcon, requestIcon, makeStoryIcon,
} from "./mapIcons";
import type { Business, Provider } from "@/types";
import type { RequestPost } from "@/types";
import { displayName as safeName } from "@/lib/publicName";
import { distanceLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

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

  return (
    <>
      {/* Businesses */}
      {layers.business && filteredBusinesses.map((b) => {
        const evalRes = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil);
        const isBizOpen = evalRes.isOpenNow;
        return (
          <Marker key={b.id} position={[b.lat, b.lng]} icon={isBizOpen ? businessIcon : businessOfflineIcon}>
            <Popup>
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
            </Popup>
          </Marker>
        );
      })}

      {/* Providers */}
      {layers.provider && filteredProviders.map((p) => {
        const evalRes = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil);
        return (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={evalRes.isOpenNow ? providerIcon : providerOfflineIcon}>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{safeName(p.displayName, "Local provider")}</strong>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: evalRes.isOpenNow ? "var(--green-100)" : "var(--ink-100)", color: evalRes.isOpenNow ? "var(--green-600)" : "var(--ink-600)", fontWeight: 700 }}>
                    {evalRes.isOpenNow ? t("map_available") : t("map_offline")}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-600)", marginTop: 2 }}>{p.categoryName} · from {inr(p.startingPrice)}</div>
                <div style={{ marginTop: 4 }}><Rating value={p.ratingAvg} size={11} /></div>
                <button
                  onClick={() => nav(`/provider/${p.id}`)}
                  style={{ marginTop: 8, padding: "6px 12px", background: evalRes.isOpenNow ? pinColors.provider : "var(--ink-500)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
                >
                  {t("map_view_profile")}
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Requests */}
      {layers.request && nearbyRequests.map((r) => {
        const lat = r.lat as number;
        const lng = r.lng as number;
        return (
          <Marker key={r.id} position={[lat, lng]} icon={requestIcon}>
            <Popup>
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
            </Popup>
          </Marker>
        );
      })}

      {/* Stories — avatar bubbles */}
      {layers.story && mapStories.map((s, i) => {
        const seen = viewedStories.includes(s.id);
        return (
          <Marker
            key={s.id}
            position={[s.lat!, s.lng!]}
            icon={makeStoryIcon(s.authorAvatar, seen)}
            eventHandlers={{ click: () => onStoryClick(mapStories, i) }}
          >
            <Popup>
              <div style={{ minWidth: 160, textAlign: "center" }}>
                <strong style={{ fontSize: 13 }}>{s.authorName.split(" ")[0]}</strong>
                {s.caption && <p style={{ fontSize: 12, color: "var(--ink-700)", marginTop: 4, lineHeight: 1.4 }}>{s.caption}</p>}
                <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>{s.postedAt} · {s.expiresInHrs}h left</div>
                <button
                  onClick={() => onStoryClick(mapStories, i)}
                  style={{ marginTop: 8, padding: "6px 12px", background: "linear-gradient(135deg,#ff8400,var(--pink-500))", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
                >
                  {t("map_view_story")}
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
