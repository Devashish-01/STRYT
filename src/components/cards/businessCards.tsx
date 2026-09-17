import { type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MapPin, Clock, BadgeCheck } from "@/components/Icons";
import type { Business } from "@/types";
import { Rating, SafeImg } from "../common";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { evaluateProviderAvailability } from "@/utils/availability";
import { inr, distanceLabel } from "@/lib/format";
import { haptics } from "@/lib/haptics";

/* ---------------- Business cards ---------------- */

export function BusinessCardWide({ b, style, entranceClass = "fade-up" }: { b: Business; style?: CSSProperties; entranceClass?: string }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { isBookmarked, toggleBookmark, isGuest } = useApp();
  const saved = isBookmarked("BUSINESS", b.id);
  // Live open/closed from the owner's presence toggle + working hours — same
  // evaluator BusinessDetail uses, so the card can't show a stale "Open".
  const evalRes = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil);
  return (
    <div
      className={`card card-interactive ${entranceClass}`}
      style={{ padding: 12, borderRadius: "var(--radius-lg)", ...style }}
      onClick={() => nav(`/business/${b.id}`)}
    >
      <div className="row gap-12" style={{ alignItems: "flex-start" }}>
        <SafeImg
          src={b.coverImage}
          alt={b.name}
          className="thumb"
          style={{ width: 72, height: 72, flexShrink: 0, borderRadius: "var(--radius)", objectFit: "cover" }}
        />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between">
            <div className="row gap-6" style={{ minWidth: 0 }}>
              <span className="bold ellipsis" style={{ fontSize: 15.5, letterSpacing: "-0.1px" }}>{b.name}</span>
              {b.isVerified && <BadgeCheck size={15} color="var(--brand-600)" fill="var(--brand-100)" />}
              {/* Paid-placement transparency: users must be able to tell boosted results apart. */}
              {b.isNew && <span className="badge badge-new" style={{ fontSize: 9, padding: "1px 6px", flexShrink: 0 }}>NEW</span>}
              {b.isBoosted && <span className="badge badge-amber" style={{ fontSize: 9, padding: "1px 6px", flexShrink: 0 }}>{t("card_promoted_badge")}</span>}
            </div>
            <div className="row gap-6 center-v" style={{ flexShrink: 0 }}>
              <Rating value={b.ratingAvg} />
              {/* Saving needs an account to save to — guests view only. */}
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
                    toggleBookmark("BUSINESS", b.id);
                  }}
                  aria-label={t("card_save_aria")}
                >
                  <Heart size={14} weight={saved ? "fill" : "regular"} color={saved ? "var(--red-500)" : "var(--ink-600)"} />
                </button>
              )}
            </div>
          </div>
          <div className="row gap-6 center-v" style={{ marginTop: 3, minWidth: 0 }}>
            <span className="tiny muted ellipsis tabular-nums" style={{ minWidth: 0 }}>
              {b.subCategory}{!b.offerText && b.priceForTwo ? ` • ${inr(b.priceForTwo)} for two` : ""}
            </span>
            {b.offerText && (
              <span className="badge badge-amber ellipsis" style={{ fontSize: 9, padding: "1px 6px", flexShrink: 0, maxWidth: "50%" }}>🔥 {b.offerText}</span>
            )}
          </div>
          <div className="row gap-8 tiny muted" style={{ marginTop: 7 }}>
            <span className="row gap-4"><MapPin size={12} /> {distanceLabel(b.distanceKm)}</span>
            {b.deliveryTime && <span className="row gap-4"><Clock size={12} /> {b.deliveryTime}</span>}
            <span className={`badge ${evalRes.isOpenNow ? "badge-green" : "badge-gray"}`} style={{ fontSize: 10, padding: "1px 6px", marginLeft: "auto" }}>
              {evalRes.isOpenNow ? "Open" : "Closed"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BusinessCardSmall({ b, style, entranceClass = "fade-up" }: { b: Business; style?: CSSProperties; entranceClass?: string }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { isBookmarked, toggleBookmark, isGuest } = useApp();
  const saved = isBookmarked("BUSINESS", b.id);
  const evalRes = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil);
  return (
    <div
      className={`card-interactive ${entranceClass}`}
      style={{ width: 160, flexShrink: 0, ...style }}
      onClick={() => nav(`/business/${b.id}`)}
    >
      <div style={{ position: "relative" }}>
        <SafeImg src={b.coverImage} alt={b.name} className="thumb" style={{ width: "100%", aspectRatio: "16/11", borderRadius: "var(--radius)", objectFit: "cover" }} />
        {b.offerText && (
          <div
            style={{
              position: "absolute",
              left: 8,
              bottom: 8,
              right: 8,
              color: "#fff",
              fontWeight: 800,
              fontSize: 12,
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
            className="ellipsis"
          >
            {b.offerText}
          </div>
        )}
        {!isGuest && (
          <button
            className="icon-btn"
            style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, background: "rgba(255,255,255,0.92)" }}
            onClick={(e) => {
              e.stopPropagation();
              haptics.selection();
              toggleBookmark("BUSINESS", b.id);
            }}
            aria-label={t("card_save_aria")}
          >
            <Heart size={14} weight={saved ? "fill" : "regular"} color={saved ? "var(--red-500)" : "var(--ink-600)"} />
          </button>
        )}
        {(b.isNew || b.isBoosted) && (
          <div className="card-badge-stack" style={{ top: 8, left: 8, gap: "var(--space-xxs)" }}>
            {b.isNew && <span className="badge badge-new" style={{ fontSize: 10 }}>NEW</span>}
            {b.isBoosted && <span className="badge badge-amber" style={{ fontSize: 10 }}>{t("card_promoted_badge")}</span>}
          </div>
        )}
      </div>
      <div style={{ marginTop: 7 }}>
        <div className="row between gap-6">
          <span className="bold ellipsis small">{b.name}</span>
        </div>
        <div className="row gap-6" style={{ marginTop: 3 }}>
          <Rating value={b.ratingAvg} size={11} />
          <span className="tiny muted ellipsis">{distanceLabel(b.distanceKm)}</span>
        </div>
        <span className={`badge ${evalRes.isOpenNow ? "badge-green" : "badge-gray"}`} style={{ fontSize: 9, padding: "1px 6px" }}>
          {evalRes.isOpenNow ? "Open" : "Closed"}
        </span>
      </div>
    </div>
  );
}
