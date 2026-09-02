import { useNavigate } from "react-router-dom";
import { SafeImg, inr } from "@/components/common";
import { Package, Store, MapPin, CheckCircle2 } from "@/components/Icons";
import { calcBulkTotal, type BulkDeal } from "@/types";
import { distanceLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { poolProgress } from "@/lib/groupBuy";

/** Business-run bulk-buying campaign. Visually distinct from a group buy
 *  (amber/"deal" tone) but shares the same pool-progress treatment now that
 *  both are pledge-and-pool models rather than one being instant-buy. */
export default function BulkDealCard({ deal, onBook }: { deal: BulkDeal; onBook?: (d: BulkDeal) => void }) {
  const nav = useNavigate();
  const { t, tf } = useI18n();
  // Headline price is quoted at the campaign's own target quantity — moq
  // doubles as the pledge target, see types/bulk.ts.
  const atMoq = calcBulkTotal(deal, deal.moq);
  const { pledged, target, pct, remaining, joined, hasTarget } = poolProgress({
    target: deal.moq,
    pledgedQuantity: deal.pledgedQuantity,
    myPledgeQuantity: deal.myPledgeQuantity,
  });

  return (
    <div className="card col gap-10" style={{ padding: 14, borderLeft: "3px solid var(--amber-500)" }}>
      <div className="row gap-10">
        {deal.image || deal.businessCover ? (
          <SafeImg
            src={deal.image || deal.businessCover || ""}
            className="thumb"
            style={{ width: 64, height: 64, borderRadius: 12, flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 12, background: "var(--amber-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Package size={24} color="var(--amber-700)" />
          </div>
        )}
        <div className="grow" style={{ minWidth: 0 }}>
          <span className="badge" style={{ background: "var(--amber-50)", color: "var(--amber-800)", fontSize: 9 }}>
            <Package size={10} /> {t("bulk_deal_badge")}
          </span>
          <div className="bold small ellipsis" style={{ marginTop: 5 }}>{deal.title}</div>
          {deal.businessName && (
            <button
              className="row gap-4 center-v tiny muted"
              style={{ background: "none", border: "none", padding: 0, marginTop: 2 }}
              onClick={() => nav(`/business/${deal.businessId}`)}
            >
              <Store size={11} /> <span className="ellipsis">{deal.businessName}</span>
            </button>
          )}
        </div>
      </div>

      {hasTarget && (
        <div>
          <div className="row between tiny" style={{ marginBottom: 5 }}>
            <span className="semi" style={{ color: "var(--amber-700)" }}>{tf("pledged_of_target", { pledged, target })}</span>
            <span className="muted">{remaining > 0 ? tf("more_to_unlock", { n: remaining }) : t("target_reached")}</span>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: "var(--ink-100)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--green-500)" : "var(--amber-500)", transition: "width .3s" }} />
          </div>
        </div>
      )}

      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
        {atMoq.savedPercent > 0 && (
          <span className="badge" style={{ background: "var(--green-100)", color: "var(--green-600)", fontSize: 10 }}>
            {tf("save_percent", { pct: atMoq.savedPercent })}
          </span>
        )}
        {deal.depositAmount != null && (
          <span className="badge badge-gray" style={{ fontSize: 10 }}>{tf("deposit_amount_badge", { amount: inr(deal.depositAmount) })}</span>
        )}
        {deal.distanceKm != null && (
          <span className="badge badge-gray row gap-4" style={{ fontSize: 10 }}>
            <MapPin size={10} /> {distanceLabel(deal.distanceKm, t)}
          </span>
        )}
      </div>

      {deal.tiers.length > 0 && (
        <div className="col gap-4" style={{ padding: "8px 10px", background: "var(--ink-50)", borderRadius: 10 }}>
          {deal.tiers.slice(0, 3).map((tier) => (
            <div key={tier.minQty} className="row between tiny">
              <span className="muted">{tf("n_plus_units", { n: tier.minQty })}</span>
              <span className="semi">{tf("price_each", { price: inr(tier.unitPrice) })}</span>
            </div>
          ))}
        </div>
      )}

      <div className="row between center-v">
        <div className="col" style={{ gap: 1 }}>
          <span className="bold" style={{ color: "var(--green-600)" }}>{inr(atMoq.unitPrice)}<span className="tiny muted"> /unit</span></span>
          {atMoq.saved > 0 && (
            <span className="tiny muted" style={{ textDecoration: "line-through" }}>{inr(deal.regularPrice)}</span>
          )}
        </div>
        {joined ? (
          <button className="btn btn-sm" style={{ background: "var(--green-100)", color: "var(--green-600)" }} onClick={() => onBook?.(deal)}>
            <CheckCircle2 size={14} /> {t("joined_units_prefix")} {deal.myPledgeQuantity} {(deal.myPledgeQuantity ?? 0) > 1 ? t("units_word") : t("unit_word")}
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => onBook?.(deal)}>
            {t("join_bulk_deal")}
          </button>
        )}
      </div>
    </div>
  );
}
