import { type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MapPin, BadgeCheck } from "@/components/Icons";
import type { Provider } from "@/types";
import { Rating, SafeImg } from "../common";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { evaluateProviderAvailability } from "@/utils/availability";
import { displayName as safeName } from "@/lib/publicName";
import { inr, distanceLabel } from "@/lib/format";
import { openProfile } from "@/lib/profileSheet";
import { haptics } from "@/lib/haptics";

/* ---------------- Provider card ---------------- */

export function ProviderCard({ p, style, entranceClass = "fade-up" }: { p: Provider; style?: CSSProperties; entranceClass?: string }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { isBookmarked, toggleBookmark, isGuest } = useApp();
  const saved = isBookmarked("PROVIDER", p.id);
  const evalRes = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil);
  return (
    <div className={`card card-interactive ${entranceClass}`} style={{ padding: 12, borderRadius: "var(--radius-lg)", ...style }} onClick={() => nav(`/provider/${p.id}`)}>
      <div className="row gap-12" style={{ alignItems: "flex-start" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <SafeImg
            src={p.avatar}
            alt={p.displayName}
            variant="avatar"
            className="avatar"
            style={{ width: 64, height: 64, cursor: "pointer", border: "2px solid var(--brand-100)" }}
            onClick={(e) => {
              e.stopPropagation();
              openProfile(p.id, "PROVIDER", { name: p.displayName, avatar: p.avatar });
            }}
          />
          <span
            style={{
              position: "absolute",
              bottom: 1,
              right: 1,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: evalRes.isOpenNow ? "var(--green-500)" : "var(--ink-400)",
              border: "2.5px solid #fff",
            }}
          />
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between">
            <div className="row gap-6" style={{ minWidth: 0 }}>
              <span className="bold ellipsis" style={{ fontSize: 15.5, letterSpacing: "-0.1px" }}>{safeName(p.displayName, "Local provider")}</span>
              {p.isVerified && <BadgeCheck size={15} color="var(--brand-600)" fill="var(--brand-100)" />}
            </div>
            <div className="row gap-6 center-v" style={{ flexShrink: 0 }}>
              <Rating value={p.ratingAvg} size={11} />
              {!isGuest && (
                <button
                  className="icon-btn"
                  style={{
                    width: 30, height: 30, flexShrink: 0,
                    background: saved ? "var(--red-50)" : "var(--ink-100)",
                    border: saved ? "1px solid var(--red-100)" : "1px solid var(--ink-200)",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    toggleBookmark("PROVIDER", p.id);
                  }}
                  aria-label={t("card_save_aria")}
                >
                  <Heart size={14} weight={saved ? "fill" : "regular"} color={saved ? "var(--red-500)" : "var(--ink-600)"} />
                </button>
              )}
            </div>
          </div>
          <div className="tiny muted ellipsis" style={{ marginTop: 3 }}>{p.categoryName} • {p.subCategory}</div>
          <div className="row gap-8 tiny muted" style={{ marginTop: 7 }}>
            <span className="row gap-4"><MapPin size={12} /> {distanceLabel(p.distanceKm)}</span>
            <span className="tabular-nums" style={{ color: "var(--green-500)", fontWeight: 700 }}>From {inr(p.startingPrice)}</span>
            <span
              className={`badge ${evalRes.isOpenNow ? "badge-green" : "badge-gray"}`}
              style={{ fontSize: 10, padding: "1px 6px", marginLeft: "auto" }}
            >
              {evalRes.isOpenNow ? "Available" : "Offline"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProviderCardSmall({ p, style, entranceClass = "fade-up" }: { p: Provider; style?: CSSProperties; entranceClass?: string }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { isBookmarked, toggleBookmark, isGuest } = useApp();
  const saved = isBookmarked("PROVIDER", p.id);
  const evalRes = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil);
  return (
    <div
      className={`card card-interactive ${entranceClass}`}
      style={{
        width: 154,
        flexShrink: 0,
        padding: 14,
        borderRadius: "var(--radius-lg)",
        position: "relative",
        ...style
      }}
      onClick={() => nav(`/provider/${p.id}`)}
    >
      {!isGuest && (
        <button
          className="icon-btn"
          style={{
            position: "absolute", top: 8, right: 8, width: 28, height: 28,
            background: saved ? "var(--red-50)" : "var(--ink-100)",
            border: saved ? "1px solid var(--red-100)" : "1px solid var(--ink-200)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
          }}
          onClick={(e) => {
            e.stopPropagation();
            haptics.selection();
            toggleBookmark("PROVIDER", p.id);
          }}
          aria-label={t("card_save_aria")}
        >
          <Heart size={13} weight={saved ? "fill" : "regular"} color={saved ? "var(--red-500)" : "var(--ink-600)"} />
        </button>
      )}
      <div className="col center" style={{ textAlign: "center", gap: 6 }}>
        <div style={{ position: "relative" }}>
          <SafeImg src={p.avatar} alt={p.displayName} variant="avatar" className="avatar" style={{ width: 60, height: 60, borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }} />
          <span
            style={{
              position: "absolute",
              bottom: 1,
              right: 1,
              width: 13,
              height: 13,
              borderRadius: "50%",
              background: evalRes.isOpenNow ? "var(--green-500)" : "var(--ink-400)",
              border: "2px solid #fff",
            }}
          />
        </div>
        <div className="bold small ellipsis" style={{ maxWidth: "100%", fontSize: 13.5 }}>{safeName(p.displayName, "Local provider")}</div>
        <div className="tiny muted ellipsis" style={{ maxWidth: "100%", fontSize: 11 }}>{p.categoryName}</div>
        <Rating value={p.ratingAvg} size={11} />
        <div className="row gap-4 center-v" style={{ marginTop: 1 }}>
          <span className="tiny tabular-nums" style={{ color: "var(--green-500)", fontWeight: 700 }}>from {inr(p.startingPrice)}</span>
          <span className={`badge ${evalRes.isOpenNow ? "badge-green" : "badge-gray"}`} style={{ fontSize: 9, padding: "1px 5px" }}>
            {evalRes.isOpenNow ? "Available" : "Offline"}
          </span>
        </div>
      </div>
    </div>
  );
}
