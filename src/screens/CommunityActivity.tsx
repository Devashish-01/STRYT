import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { Ticket, Users } from "@/components/Icons";
import { bulkService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import BulkDealCard from "@/components/BulkDealCard";
import BulkOrderSheet from "@/components/BulkOrderSheet";
import GroupBuyClaimPassModal from "@/components/GroupBuyClaimPassModal";
import type { BulkDeal, GroupBuyToken } from "@/types";
import { useI18n } from "@/lib/i18n";

/** Where claim passes and joined pools live now /bulk is gone.
 *
 * Deliberately consumer-only — things you HOLD or JOINED, never things you
 * POSTED. BulkBuyingHub's old "My activity" tab also listed a business
 * owner's own bulk deals; that's merchant content, and it now lives in the
 * business console next to the rest of that owner's shop tooling instead of
 * a consumer screen. See the redesign plan's "Posted deals" decision. */
export default function CommunityActivity() {
  const nav = useNavigate();
  const { user, isGuest } = useApp();
  const { t } = useI18n();
  const [viewingPass, setViewingPass] = useState<GroupBuyToken | null>(null);
  const [ordering, setOrdering] = useState<BulkDeal | null>(null);

  const { data: myTokens, refetch: refetchTokens } = useQuery(
    () => (isGuest ? Promise.resolve([]) : bulkService.myTokens()),
    [user.id, isGuest],
    isGuest ? undefined : `bulk:tokens:${user.id}`
  );

  const tokens = myTokens ?? [];
  // Bulk-deal passes carry dealId (group-buy ones don't) — that's the join
  // between "Your campaigns" and "Your claim passes" below.
  const tokenByDeal = new Map(tokens.filter((tk) => tk.dealId).map((tk) => [tk.dealId as string, tk]));

  // Campaigns you've pledged into, any state (open/fulfilled/refunded) — so a
  // pledge's outcome stays reviewable after it drops out of the browse feed.
  // Bulk deals had no equivalent of myGroupBuys until now.
  const { data: myCampaignData, refetch: refetchCampaigns } = useQuery(
    () => (isGuest ? Promise.resolve([]) : bulkService.myPledgedDeals(user.lat || 0, user.lng || 0)),
    [user.id, isGuest, user.lat, user.lng],
    isGuest ? undefined : `bulk:mine:deals:${user.id}`
  );
  const myCampaigns = myCampaignData ?? [];

  return (
    <div className="screen with-nav">
      <AppBar title={t("tab_my_activity")} subtitle={t("bulk_group_buys_subtitle")} />
      <div className="screen-scroll">
        <div className="page-pad col gap-16" style={{ paddingBottom: 24 }}>
          {isGuest ? (
            <EmptyState emoji="🔒" title={t("sign_in_see_activity")} text={t("sign_in_activity_desc")} />
          ) : (
            <>
              {tokens.length > 0 && (
                <div>
                  <div className="small semi muted" style={{ marginBottom: 8 }}>{t("your_claim_passes")}</div>
                  <div className="col gap-8">
                    {tokens.map((tk) => (
                      <button key={tk.id} className="card row between center-v" style={{ padding: 12 }} onClick={() => setViewingPass(tk)}>
                        <div className="row gap-10 center-v" style={{ minWidth: 0 }}>
                          <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Ticket size={18} color="var(--brand-700)" />
                          </div>
                          <div style={{ minWidth: 0, textAlign: "left" }}>
                            <div className="semi small ellipsis">{tk.itemLabel || t("group_buy_pass_fallback")}</div>
                            <div className="tiny muted">{tk.quantity} {tk.quantity > 1 ? t("units_word") : t("unit_word")} · {tk.tokenCode}</div>
                          </div>
                        </div>
                        <span
                          className="badge"
                          style={{
                            fontSize: 9,
                            background: tk.status === "ISSUED" ? "var(--green-100)" : "var(--ink-100)",
                            color: tk.status === "ISSUED" ? "var(--green-600)" : "var(--ink-600)",
                          }}
                        >
                          {tk.status === "ISSUED" ? t("ready_status") : tk.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {myCampaigns.length > 0 && (
                <div>
                  <div className="small semi muted" style={{ marginBottom: 8 }}>{t("your_campaigns")}</div>
                  <div className="col gap-12">
                    {/* Linking a fulfilled campaign to the pass it minted —
                        both lists live on this screen but nothing connected
                        them, so the customer had to match them up by title. */}
                    {myCampaigns.map((d) => (
                      <BulkDealCard
                        key={d.id}
                        deal={d}
                        onBook={setOrdering}
                        claimToken={tokenByDeal.get(d.id) ?? null}
                        onViewPass={setViewingPass}
                      />
                    ))}
                  </div>
                </div>
              )}

              {tokens.length === 0 && myCampaigns.length === 0 && (
                <EmptyState emoji="📦" title={t("nothing_here_yet")} text={t("join_or_post_desc")} action={
                  <button className="btn btn-primary btn-sm" onClick={() => nav("/community-hub")}>
                    <Users size={14} /> {t("join_group_buy")}
                  </button>
                } />
              )}
            </>
          )}
        </div>
      </div>

      {viewingPass && <GroupBuyClaimPassModal token={viewingPass} onClose={() => setViewingPass(null)} />}
      {ordering && (
        <BulkOrderSheet
          deal={ordering}
          onOrdered={() => { refetchCampaigns(); refetchTokens(); }}
          onClose={() => setOrdering(null)}
        />
      )}
    </div>
  );
}
