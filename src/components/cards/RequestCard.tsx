import { type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Zap, Eye, Users, Flame, Repeat } from "@/components/Icons";
import type { RequestPost } from "@/types";
import { SafeImg } from "../common";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { inr } from "@/lib/format";
import { GROUP_BUY_PROGRESS_ENABLED } from "@/utils/constants";
import { REQUEST_STATUS_BADGE } from "@/lib/statusBadges";

/* ---------------- Request card ---------------- */

/** "Expires in 2h 10m" — poster + responders both need urgency visibility. */
function expiryLabel(expiresAt?: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null; // sweep will flip status shortly
  const m = Math.floor(ms / 60000);
  if (m < 60) return `Expires in ${m}m`;
  return `Expires in ${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
}

export function RequestCard({ r, style }: { r: RequestPost; style?: CSSProperties }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { meToos } = useApp();
  const expiry = r.status === "OPEN" ? expiryLabel(r.expiresAt) : null;
  const budget =
    r.budgetMin && r.budgetMax ? `${inr(r.budgetMin)}–${inr(r.budgetMax)}` : "Open budget";
  const meTooed = meToos.includes(r.id) || r.meTooed;
  const meTooCount = (r.meTooCount ?? 0) + (meTooed && !r.meTooed ? 1 : 0);
  const isOpen = r.status === "OPEN";
  const statusBadge = REQUEST_STATUS_BADGE[r.status] ?? null;
  const archived = r.status === "EXPIRED" || r.status === "CANCELLED";
  return (
    <div
      className="card card-interactive fade-up"
      style={{ padding: 14, border: r.isUrgent && isOpen ? "1.5px solid var(--red-100)" : undefined, opacity: archived ? 0.62 : 1, ...style }}
      onClick={() => nav(`/request/${r.id}`)}
    >
      <div className="row gap-10" style={{ alignItems: "flex-start" }}>
        <SafeImg src={r.requesterAvatar} alt={r.requesterName} variant="avatar" className="avatar" style={{ width: 40, height: 40 }} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between">
            <span className="semi small">{r.isAnonymous ? "Someone nearby" : r.requesterName}</span>
            <span className="tiny muted">{r.postedAt}</span>
          </div>
          <div className="row gap-6 tiny muted">
            <MapPin size={12} /> {r.area}{r.distanceKm > 0 ? ` • ${r.distanceKm} km away` : ""}
          </div>
        </div>
      </div>

      <div className="row gap-8" style={{ marginTop: 10, alignItems: "flex-start" }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row wrap gap-6" style={{ marginBottom: 4 }}>
            {statusBadge && <span className={`badge ${statusBadge.cls}`}>{statusBadge.label}</span>}
            {isOpen && r.isUrgent && <span className="badge badge-red"><Flame size={11} /> {t("urgent_badge")}</span>}
            {isOpen && r.isBoosted && <span className="badge badge-amber"><Zap size={11} /> {t("boosted_badge")}</span>}

            {r.isRecurring && <span className="badge badge-blue"><Repeat size={11} /> {t("recurring_badge")}</span>}
            <span className="badge badge-purple">{r.categoryName}</span>
            {r.subCategory && <span className="badge badge-gray">{r.subCategory}</span>}
            {expiry && <span className="badge badge-amber">⏳ {expiry}</span>}
          </div>
          <div className="bold" style={{ fontSize: 15.5 }}>{r.title}</div>
          <p className="small muted clamp-2" style={{ marginTop: 4, lineHeight: 1.45 }}>{r.description}</p>
        </div>
        {r.photos[0] && (
          <img src={r.photos[0]} alt="" className="thumb" style={{ width: 64, height: 64, borderRadius: 12 }} loading="lazy" />
        )}
      </div>


      <div className="divider" style={{ margin: "12px 0" }} />

      <div className="row between">
        <div className="col" style={{ gap: 2 }}>
          <span className="tiny muted">{t("card_budget_label")}</span>
          <span className="bold tabular-nums" style={{ color: "var(--green-500)" }}>{budget}</span>
        </div>
        {GROUP_BUY_PROGRESS_ENABLED && !isOpen && meTooCount > 0 && (
          <span className="row gap-4 tiny muted" style={{ alignItems: "center" }}>
            <Users size={13} /> {meTooCount} interested
          </span>
        )}
        <div className="col" style={{ gap: 2, alignItems: "flex-end" }}>
          <span className="tiny muted row gap-4"><Eye size={11} /> {r.viewCount}</span>
          <span className="semi small" style={{ color: "var(--brand-700)" }}>
            {r.proposals.length} {r.proposals.length === 1 ? "offer" : "offers"}
          </span>
        </div>
      </div>
    </div>
  );
}
