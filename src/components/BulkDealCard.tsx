import { useNavigate } from "react-router-dom";
import { SafeImg, inr } from "@/components/common";
import { Package, Store, MapPin } from "@/components/Icons";
import { calcBulkTotal, type BulkDeal } from "@/types";
import { distanceLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/** Business-initiated wholesale offer. Visually distinct from a group buy
 *  (amber/"deal" tone, MOQ badge, savings table) so the two never blur
 *  together in the blended /bulk feed. */
export default function BulkDealCard({ deal, onBook }: { deal: BulkDeal; onBook?: (d: BulkDeal) => void }) {
  const nav = useNavigate();
  const { t, tf } = useI18n();
  // Headline saving is quoted at the deal's own MOQ — the cheapest quantity a
  // buyer can actually transact at, so the number on the card is one they can
  // really get rather than a best-case tier they may never reach.
  const atMoq = calcBulkTotal(deal, deal.moq);

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

      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
        <span className="badge badge-gray" style={{ fontSize: 10 }}>{tf("min_qty", { n: deal.moq })}</span>
        {atMoq.savedPercent > 0 && (
          <span className="badge" style={{ background: "var(--green-100)", color: "var(--green-600)", fontSize: 10 }}>
            {tf("save_percent", { pct: atMoq.savedPercent })}
          </span>
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
              <span className="muted">{tier.minQty}+ units</span>
              <span className="semi">{inr(tier.unitPrice)} each</span>
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
        <button className="btn btn-primary btn-sm" onClick={() => onBook?.(deal)}>
          {t("book_bulk")}
        </button>
      </div>
    </div>
  );
}
