import { useNavigate } from "react-router-dom";
import { SafeImg, inr } from "@/components/common";
import { Package, Store, MapPin, CheckCircle2, Clock, Ticket } from "@/components/Icons";
import { calcBulkTotal, type BulkDeal, type GroupBuyToken } from "@/types";
import { distanceLabel } from "@/lib/format";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { poolProgress } from "@/lib/groupBuy";

/** Business-run bulk-buying campaign, in the feed.
 *
 * Previously its own bespoke shell (amber left-border box, 64px square
 * thumbnail, custom padding) — visually shouting "this is a commerce widget"
 * next to plain community posts, and at a different footprint than every
 * other card in the same feed. Reuses CommunityCard's exact shell instead
 * (`community-card-squircle`, avatar-led header, badge pill, bold title) so a
 * campaign reads as one more kind of post — like ALERT or POLL get their own
 * badge on the same shell — not a different kind of screen. The WHOLE card is
 * tappable now, not just the title text, matching the listing-card convention
 * elsewhere (RequestCard, BusinessCardWide) rather than the post-card one
 * (where only specific regions open the detail). */
export default function BulkDealCard({
  deal, onBook, claimToken, onViewPass,
}: {
  deal: BulkDeal;
  onBook?: (d: BulkDeal) => void;
  /** The viewer's own claim pass for this campaign, when one was minted. Only
   *  CommunityActivity has this (it fetches both lists) — the browse feed
   *  never shows closed campaigns, so it has nothing to pass. */
  claimToken?: GroupBuyToken | null;
  onViewPass?: (tk: GroupBuyToken) => void;
}) {
  const nav = useNavigate();
  const { user } = useApp();
  const { t, tf } = useI18n();
  // The server rejects a campaign's own owner with OWNER_CANNOT_PLEDGE — you
  // run this deal, you don't buy into it. Offering "Join deal" here invited a
  // tap that could only ever fail, so owners get a route into their console
  // instead of a dead CTA.
  const isOwner = !!user.id && deal.ownerUserId === user.id;
  // A closed campaign used to render identically to a live one — same progress
  // bar, same "Join deal" CTA — and tapping it opened a pledge form the server
  // could only reject with DEAL_CLOSED. closed_at is a separate lifecycle axis
  // from status (closing never flips status away from ACTIVE), so this reads
  // closedAtISO, not status.
  const isClosed = !!deal.closedAtISO;
  const outcome = deal.closeOutcome ?? null;
  // Headline price is quoted at the campaign's own target quantity — moq
  // doubles as the pledge target, see types/bulk.ts.
  const atMoq = calcBulkTotal(deal, deal.moq);
  const { pledged, target, pct, remaining, joined, hasTarget } = poolProgress({
    target: deal.moq,
    pledgedQuantity: deal.pledgedQuantity,
    myPledgeQuantity: deal.myPledgeQuantity,
  });

  return (
    <div
      className="card community-card-squircle queue-row-enter"
      style={{ cursor: "pointer" }}
      onClick={() => onBook?.(deal)}
      role="button"
      tabIndex={0}
    >
      <div className="row gap-12" style={{ alignItems: "flex-start" }}>
        {deal.image || deal.businessCover ? (
          <SafeImg
            src={deal.image || deal.businessCover || ""}
            variant="photo"
            className="avatar"
            style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid var(--orange-500)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid var(--orange-500)", background: "var(--amber-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Package size={18} color="var(--amber-700)" />
          </div>
        )}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between gap-6 center-v">
            <span className="row gap-6 center-v" style={{ minWidth: 0 }}>
              {deal.businessName ? (
                <button
                  className="semi ellipsis"
                  style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-900)", background: "none", border: "none", padding: 0 }}
                  onClick={(e) => { e.stopPropagation(); nav(`/business/${deal.businessId}`); }}
                >
                  {deal.businessName}
                </button>
              ) : (
                <span className="semi ellipsis" style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-900)" }}>{t("bulk_deal_badge")}</span>
              )}
            </span>
            {isClosed ? (
              <span
                className="badge"
                style={{
                  fontSize: 10.5, padding: "2.5px 8px", borderRadius: 8, fontWeight: 600, flexShrink: 0,
                  background: outcome === "FULFILLED" ? "var(--green-100)" : outcome === "REFUNDED" ? "var(--ink-100)" : "var(--amber-50)",
                  color: outcome === "FULFILLED" ? "var(--green-600)" : outcome === "REFUNDED" ? "var(--ink-600)" : "var(--amber-800)",
                }}
              >
                {outcome === "FULFILLED" ? t("campaign_fulfilled") : outcome === "REFUNDED" ? t("campaign_refunded") : t("campaign_awaiting_decision")}
              </span>
            ) : (
              <span className="badge badge-orange" style={{ fontSize: 10.5, padding: "2.5px 8px", borderRadius: 8, fontWeight: 600, flexShrink: 0 }}>
                <Package size={10} style={{ display: "inline", marginRight: 3 }} /> {t("bulk_deal_badge")}
              </span>
            )}
          </div>
          <span className="tiny muted row gap-4 center-v" style={{ marginTop: 3, fontSize: 12 }}>
            {deal.distanceKm != null && <><MapPin size={11} /> {distanceLabel(deal.distanceKm, t)}</>}
            {/* A closed campaign's deadline is history — showing "Closes 6 Sep"
                on something that already closed reads as still-live. */}
            {!isClosed && deal.distanceKm != null && deal.closesAtISO && <span>•</span>}
            {!isClosed && deal.closesAtISO && <>{tf("closes_on_badge", { date: new Date(deal.closesAtISO).toLocaleDateString() })}</>}
            {isClosed && deal.distanceKm != null && <span>•</span>}
            {isClosed && <>{t("campaign_closed_word")}</>}
          </span>
        </div>
      </div>

      <div className="bold" style={{ fontSize: 17, marginTop: 12, letterSpacing: "-0.3px", lineHeight: 1.3, color: "var(--ink-900)" }}>
        {deal.title}
      </div>
      {deal.description && (
        <div
          className="small muted"
          style={{ marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {deal.description}
        </div>
      )}

      {hasTarget && (
        <div style={{ marginTop: 12 }}>
          <div className="row between tiny" style={{ marginBottom: 5 }}>
            <span className="semi" style={{ color: "var(--amber-700)" }}>{tf("pledged_of_target", { pledged, target })}</span>
            {/* "N more to unlock" is a call to action — meaningless once the
                campaign is closed and nobody can add to it. */}
            <span className="muted">{remaining > 0 ? (isClosed ? "" : tf("more_to_unlock", { n: remaining })) : t("target_reached")}</span>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: "var(--ink-100)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--green-500)" : "var(--amber-500)", transition: "width .3s" }} />
          </div>
        </div>
      )}

      <div className="row gap-8" style={{ flexWrap: "wrap", marginTop: 10 }}>
        {atMoq.savedPercent > 0 && (
          <span className="badge" style={{ background: "var(--green-100)", color: "var(--green-600)", fontSize: 10 }}>
            {tf("save_percent", { pct: atMoq.savedPercent })}
          </span>
        )}
        {deal.depositAmount != null && (
          <span className="badge badge-gray" style={{ fontSize: 10 }}>{tf("deposit_amount_badge", { amount: inr(deal.depositAmount) })}</span>
        )}
      </div>

      {deal.tiers.length > 0 && (
        <div className="col gap-4" style={{ padding: "8px 10px", background: "var(--ink-50)", borderRadius: 10, marginTop: 10 }}>
          {deal.tiers.slice(0, 2).map((tier) => (
            <div key={tier.minQty} className="row between tiny">
              <span className="muted">{tf("n_plus_units", { n: tier.minQty })}</span>
              <span className="semi">{tf("price_each", { price: inr(tier.unitPrice) })}</span>
            </div>
          ))}
        </div>
      )}

      <div className="row between center-v" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
        <div className="col" style={{ gap: 1 }}>
          <span className="bold" style={{ color: "var(--green-600)" }}>{inr(atMoq.unitPrice)}<span className="tiny muted"> /unit</span></span>
          {atMoq.saved > 0 && (
            <span className="tiny muted" style={{ textDecoration: "line-through" }}>{inr(deal.regularPrice)}</span>
          )}
        </div>
        {isOwner ? (
          <button
            className="btn btn-outline btn-sm"
            onClick={(e) => { e.stopPropagation(); nav(`/business/${deal.businessId}/manage/bulk-deals/${deal.id}`); }}
          >
            <Store size={14} /> {t("manage_your_campaign")}
          </button>
        ) : isClosed ? (
          // The whole point of a fulfilled campaign, and previously unreachable
          // from here: the pass existed in a separate section of the same
          // screen with nothing linking the two.
          claimToken && onViewPass ? (
            <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onViewPass(claimToken); }}>
              <Ticket size={14} /> {t("view_claim_pass")}
            </button>
          ) : (
            <span className="tiny muted">
              {outcome === "FULFILLED" ? t("campaign_fulfilled") : outcome === "REFUNDED" ? t("campaign_refunded") : t("campaign_awaiting_decision")}
            </span>
          )
        ) : joined ? (
          <button className="btn btn-sm" style={{ background: "var(--green-100)", color: "var(--green-600)" }} onClick={(e) => { e.stopPropagation(); onBook?.(deal); }}>
            <CheckCircle2 size={14} /> {t("joined_units_prefix")} {deal.myPledgeQuantity} {(deal.myPledgeQuantity ?? 0) > 1 ? t("units_word") : t("unit_word")}
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onBook?.(deal); }}>
            {t("join_bulk_deal")}
          </button>
        )}
      </div>
    </div>
  );
}
