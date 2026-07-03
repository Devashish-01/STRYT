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
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: isBizOpen ? "#dcfce7" : "#f3f4f6", color: isBizOpen ? "#15803d" : "#4b5563", fontWeight: 700 }}>
                    {isBizOpen ? "Open" : "Closed"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{b.subCategory}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <Rating value={b.ratingAvg} size={11} />
                  {b.distanceKm != null && <span style={{ fontSize: 12, color: "#888" }}>{b.distanceKm} km</span>}
                </div>
                <button
                  onClick={() => nav(`/business/${b.id}`)}
                  style={{ marginTop: 8, padding: "6px 12px", background: isBizOpen ? pinColors.business : "#6b7280", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
                >
                  View shop
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
                  <strong>{p.displayName}</strong>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: evalRes.isOpenNow ? "#dcfce7" : "#f3f4f6", color: evalRes.isOpenNow ? "#15803d" : "#4b5563", fontWeight: 700 }}>
                    {evalRes.isOpenNow ? "Available" : "Offline"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{p.categoryName} · from {inr(p.startingPrice)}</div>
                <div style={{ marginTop: 4 }}><Rating value={p.ratingAvg} size={11} /></div>
                <button
                  onClick={() => nav(`/provider/${p.id}`)}
                  style={{ marginTop: 8, padding: "6px 12px", background: evalRes.isOpenNow ? pinColors.provider : "#6b7280", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
                >
                  View profile
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
                <span style={{ fontSize: 11, background: "#e9d5ff", color: "var(--brand-600)", padding: "2px 6px", borderRadius: 4 }}>{r.categoryName}</span>
                <div style={{ fontWeight: 700, marginTop: 4, fontSize: 14 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {r.budgetMin && r.budgetMax ? `${inr(r.budgetMin)}–${inr(r.budgetMax)}` : "Open budget"}
                </div>
                <button
                  onClick={() => nav(`/request/${r.id}`)}
                  style={{ marginTop: 8, padding: "6px 12px", background: pinColors.request, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
                >
                  View request
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
                {s.caption && <p style={{ fontSize: 12, color: "#555", marginTop: 4, lineHeight: 1.4 }}>{s.caption}</p>}
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{s.postedAt} · {s.expiresInHrs}h left</div>
                <button
                  onClick={() => onStoryClick(mapStories, i)}
                  style={{ marginTop: 8, padding: "6px 12px", background: "linear-gradient(135deg,#ff8400,#ec4899)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
                >
                  View story
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
