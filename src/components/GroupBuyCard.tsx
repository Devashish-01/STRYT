import { useNavigate } from "react-router-dom";
import { SafeImg, inr } from "@/components/common";
import { Users, MapPin, CheckCircle2 } from "@/components/Icons";
import { FULFILLMENT_LABELS, type RequestPost } from "@/types";
import { distanceLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { poolProgress } from "@/lib/groupBuy";

/** Customer-initiated demand pool. Brand/violet tone + live progress bar,
 *  deliberately unlike BulkDealCard's amber "buy it now" treatment — the two
 *  sit side by side in the same feed and must be tellable apart at a glance. */
export default function GroupBuyCard({ req, onJoin }: { req: RequestPost; onJoin?: (r: RequestPost) => void }) {
  const nav = useNavigate();
  const { t, tf } = useI18n();

  // Progress is measured in UNITS, not people — a target of "100 checkups" is
  // met by 40 neighbours pledging 2-3 each, and counting heads would show the
  // pool as far emptier than it is. See lib/groupBuy.ts for the one shared formula.
  const { pledged, target, pct, remaining, joined, hasTarget } = poolProgress({
    target: req.groupBuyTarget,
    pledgedQuantity: req.pledgedQuantity,
    meTooCount: req.meTooCount,
    myPledgeQuantity: req.myPledgeQuantity,
  });

  return (
    <div className="card col gap-10" style={{ padding: 14, borderLeft: "3px solid var(--brand-600)" }}>
      <div className="row gap-10">
        <SafeImg src={req.requesterAvatar} variant="avatar" style={{ width: 40, height: 40, flexShrink: 0 }} />
        <div className="grow" style={{ minWidth: 0 }}>
          <span className="badge" style={{ background: "var(--brand-100)", color: "var(--brand-700)", fontSize: 9 }}>
            <Users size={10} /> {t("group_buy_badge_caps")}
          </span>
          <button
            className="bold small ellipsis"
            style={{ background: "none", border: "none", padding: 0, marginTop: 5, textAlign: "left", display: "block", width: "100%" }}
            onClick={() => nav(`/request/${req.id}`)}
          >
            {req.title}
          </button>
          <div className="tiny muted row gap-6 center-v" style={{ marginTop: 2 }}>
            <span className="ellipsis">{tf("by_prefix", { name: req.requesterName })}</span>
            {req.distanceKm > 0 && <><span>·</span><span className="row gap-3"><MapPin size={10} />{distanceLabel(req.distanceKm, t)}</span></>}
          </div>
        </div>
      </div>

      {hasTarget && (
        <div>
          <div className="row between tiny" style={{ marginBottom: 5 }}>
            <span className="semi" style={{ color: "var(--brand-700)" }}>{tf("pledged_of_target", { pledged, target })}</span>
            <span className="muted">{remaining > 0 ? tf("more_to_unlock", { n: remaining }) : t("target_reached")}</span>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: "var(--ink-100)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--green-500)" : "var(--brand-600)", transition: "width .3s" }} />
          </div>
        </div>
      )}

      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
        {req.bulkPricePerUnit != null && (
          <span className="badge" style={{ background: "var(--green-100)", color: "var(--green-600)", fontSize: 10 }}>
            {tf("target_price_per_unit", { price: inr(req.bulkPricePerUnit) })}
          </span>
        )}
        {req.fulfillmentType && (
          <span className="badge badge-gray" style={{ fontSize: 10 }}>{FULFILLMENT_LABELS[req.fulfillmentType]}</span>
        )}
        {(req.proposalCount ?? 0) > 0 && (
          <span className="badge badge-gray" style={{ fontSize: 10 }}>
            {req.proposalCount} {req.proposalCount === 1 ? t("quote_word") : t("quotes_word")}
          </span>
        )}
      </div>

      <div className="row gap-8">
        {joined ? (
          <button className="btn btn-sm grow" style={{ background: "var(--green-100)", color: "var(--green-600)" }} onClick={() => onJoin?.(req)}>
            <CheckCircle2 size={14} /> {t("joined_units_prefix")} {req.myPledgeQuantity} {(req.myPledgeQuantity ?? 0) > 1 ? t("units_word") : t("unit_word")}
          </button>
        ) : (
          <button className="btn btn-primary btn-sm grow" onClick={() => onJoin?.(req)}>
            <Users size={14} /> {t("join_group_buy")}
          </button>
        )}
        <button className="btn btn-outline btn-sm" onClick={() => nav(`/request/${req.id}`)}>{t("details")}</button>
      </div>
    </div>
  );
}
