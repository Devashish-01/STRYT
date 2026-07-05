import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronRight } from "@/components/Icons";
import { Rating, inr } from "@/components/common";
import { PLACEHOLDER_AVATAR, PLACEHOLDER_AVATAR_ALT } from "@/lib/placeholders";
import { useApp } from "@/store";
import type { Story, Business, Provider, RequestPost } from "@/types";
import { pinColors } from "./mapIcons";
import { displayName as safeName } from "@/lib/publicName";
import { distanceLabel } from "@/lib/format";

export function NearbySheet({
  visibleCount, isWorld, radiusKm,
  filteredBusinesses, filteredProviders, mapStories, nearbyRequests,
  onClose, onStoryClick,
}: {
  visibleCount: number;
  isWorld: boolean;
  radiusKm: number;
  filteredBusinesses: Business[];
  filteredProviders: Provider[];
  mapStories: Story[];
  nearbyRequests: RequestPost[];
  onClose: () => void;
  onStoryClick: (stories: Story[], idx: number) => void;
}) {
  const nav = useNavigate();
  const { viewedStories } = useApp();
  const [activeTab, setActiveTab] = useState<"business" | "provider" | "story" | "request">("business");

  return (
    <div className="overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "24px 24px 0 0",
          background: "#fff",
          paddingBottom: 24,
        }}
      >
        <div className="sheet-grab" />

        {/* Header */}
        <div className="row between" style={{ marginBottom: 16 }}>
          <div>
            <h3 className="bold h2">Nearby on your Street</h3>
            <span className="tiny muted">
              Showing {visibleCount} {visibleCount === 1 ? "item" : "items"}{isWorld ? " globally" : ` within ${radiusKm} km`}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--ink-100)",
              border: "none",
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--ink-700)"
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab switchers */}
        <div className="row gap-8" style={{ marginBottom: 16, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
          <button
            onClick={() => setActiveTab("business")}
            style={{
              background: "none",
              border: "none",
              borderBottom: activeTab === "business" ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
              color: activeTab === "business" ? "var(--brand-700)" : "var(--ink-500)",
              fontWeight: activeTab === "business" ? 700 : 500,
              padding: "8px 12px",
              fontSize: 14,
              cursor: "pointer",
              flex: 1,
              textAlign: "center"
            }}
          >
            Shops ({filteredBusinesses.length})
          </button>
          <button
            onClick={() => setActiveTab("provider")}
            style={{
              background: "none",
              border: "none",
              borderBottom: activeTab === "provider" ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
              color: activeTab === "provider" ? "var(--brand-700)" : "var(--ink-500)",
              fontWeight: activeTab === "provider" ? 700 : 500,
              padding: "8px 12px",
              fontSize: 14,
              cursor: "pointer",
              flex: 1,
              textAlign: "center"
            }}
          >
            Providers ({filteredProviders.length})
          </button>
          <button
            onClick={() => setActiveTab("story")}
            style={{
              background: "none",
              border: "none",
              borderBottom: activeTab === "story" ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
              color: activeTab === "story" ? "var(--brand-700)" : "var(--ink-500)",
              fontWeight: activeTab === "story" ? 700 : 500,
              padding: "8px 12px",
              fontSize: 14,
              cursor: "pointer",
              flex: 1,
              textAlign: "center"
            }}
          >
            Stories ({mapStories.length})
          </button>
          <button
            onClick={() => setActiveTab("request")}
            style={{
              background: "none",
              border: "none",
              borderBottom: activeTab === "request" ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
              color: activeTab === "request" ? "var(--brand-700)" : "var(--ink-500)",
              fontWeight: activeTab === "request" ? 700 : 500,
              padding: "8px 12px",
              fontSize: 14,
              cursor: "pointer",
              flex: 1,
              textAlign: "center"
            }}
          >
            Requests ({nearbyRequests.length})
          </button>
        </div>

        {/* Scrollable contents */}
        <div className="grow col" style={{ overflowY: "auto", maxHeight: "50vh", paddingRight: 4 }}>
          {activeTab === "business" && (
            <div className="col gap-8">
              {filteredBusinesses.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--ink-400)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🏬</div>
                  <div className="semi small">No shops found in this radius</div>
                </div>
              ) : (
                filteredBusinesses.map((b) => (
                  <div
                    key={b.id}
                    className="card row gap-12"
                    style={{ padding: 12, cursor: "pointer", border: "1px solid var(--line)" }}
                    onClick={() => { nav(`/business/${b.id}`); onClose(); }}
                  >
                    <div style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: `${pinColors.business}12`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 22, flexShrink: 0
                    }}>
                      🏬
                    </div>
                    <div className="grow">
                      <div className="bold small" style={{ color: "var(--ink-900)" }}>{b.name}</div>
                      <div className="tiny muted">{b.subCategory}</div>
                      <div className="row gap-8" style={{ marginTop: 4 }}>
                        <Rating value={b.ratingAvg} size={10} />
                        {b.distanceKm != null && (
                          <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
                            • {distanceLabel(b.distanceKm)}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="muted" />
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "provider" && (
            <div className="col gap-8">
              {filteredProviders.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--ink-400)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🛠️</div>
                  <div className="semi small">No providers found in this radius</div>
                </div>
              ) : (
                filteredProviders.map((p) => (
                  <div
                    key={p.id}
                    className="card row gap-12"
                    style={{ padding: 12, cursor: "pointer", border: "1px solid var(--line)" }}
                    onClick={() => { nav(`/provider/${p.id}`); onClose(); }}
                  >
                    <img
                      src={p.avatar || PLACEHOLDER_AVATAR_ALT}
                      style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover", flexShrink: 0 }}
                    />
                    <div className="grow">
                      <div className="bold small" style={{ color: "var(--ink-900)" }}>{safeName(p.displayName, "Local provider")}</div>
                      <div className="tiny muted">{p.categoryName} · starting {inr(p.startingPrice)}</div>
                      <div style={{ marginTop: 4 }}><Rating value={p.ratingAvg} size={10} /></div>
                    </div>
                    <ChevronRight size={16} className="muted" />
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "story" && (
            <div className="col gap-8">
              {mapStories.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--ink-400)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
                  <div className="semi small">No stories found in this radius</div>
                </div>
              ) : (
                mapStories.map((s, idx) => {
                  const seen = viewedStories.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      className="card row gap-12"
                      style={{ padding: 12, cursor: "pointer", border: "1px solid var(--line)" }}
                      onClick={() => {
                        onStoryClick(mapStories, idx);
                        onClose();
                      }}
                    >
                      <img
                        src={s.authorAvatar || PLACEHOLDER_AVATAR}
                        style={{
                          width: 44, height: 44, borderRadius: "50%", objectFit: "cover",
                          flexShrink: 0, border: seen ? "none" : "2.5px solid #ec4899"
                        }}
                      />
                      <div className="grow">
                        <div className="bold small" style={{ color: "var(--ink-900)" }}>{s.authorName}</div>
                        {s.caption && (
                          <div className="tiny text-ellipsis" style={{ color: "var(--ink-600)", marginTop: 2 }}>
                            {s.caption}
                          </div>
                        )}
                        <div className="tiny muted" style={{ marginTop: 4 }}>
                          {s.postedAt} · {s.expiresInHrs}h left
                        </div>
                      </div>
                      <ChevronRight size={16} className="muted" />
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === "request" && (
            <div className="col gap-8">
              {nearbyRequests.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--ink-400)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  <div className="semi small">No requests found in this radius</div>
                </div>
              ) : (
                nearbyRequests.map((r) => (
                  <div
                    key={r.id}
                    className="card row gap-12"
                    style={{ padding: 12, cursor: "pointer", border: "1px solid var(--line)" }}
                    onClick={() => { nav(`/request/${r.id}`); onClose(); }}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: `${pinColors.request}12`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 20, flexShrink: 0
                    }}>
                      📋
                    </div>
                    <div className="grow">
                      <div className="bold small" style={{ color: "var(--ink-900)" }}>{r.title}</div>
                      <div className="tiny muted">{r.categoryName} · {r.budgetMin && r.budgetMax ? `${inr(r.budgetMin)}–${inr(r.budgetMax)}` : "Open budget"}</div>
                    </div>
                    <ChevronRight size={16} className="muted" />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
