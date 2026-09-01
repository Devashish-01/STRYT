import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { Ticket, Users } from "@/components/Icons";
import { bulkService, requestService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import GroupBuyCard from "@/components/GroupBuyCard";
import JoinGroupBuySheet from "@/components/JoinGroupBuySheet";
import GroupBuyClaimPassModal from "@/components/GroupBuyClaimPassModal";
import type { GroupBuyToken, RequestPost } from "@/types";
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
  const [joining, setJoining] = useState<RequestPost | null>(null);

  const { data: myTokens, refetch: refetchTokens } = useQuery(
    () => (isGuest ? Promise.resolve([]) : bulkService.myTokens()),
    [user.id, isGuest],
    isGuest ? undefined : `bulk:tokens:${user.id}`
  );

  // Pools you joined (pledged a quantity) or started — NOT every open group
  // buy nearby, only the ones this account has a stake in. Requires the same
  // enrichment CommunityHub uses so units, not heads, drive what's shown.
  const { data: myGroupBuyData, refetch: refetchGroupBuys } = useQuery(
    async () => {
      if (isGuest) return [];
      const page = await requestService.feed({ special: "group", lat: user.lat || 0, lng: user.lng || 0 });
      const enriched = await requestService.enrichGroupBuyPledges(page.data ?? []);
      return enriched.filter((r) => r.requesterUserId === user.id || (r.myPledgeQuantity ?? 0) > 0);
    },
    [user.id, isGuest, user.lat, user.lng],
    isGuest ? undefined : `bulk:mine:groups:${user.id}`
  );
  const myGroupBuys = myGroupBuyData ?? [];
  const tokens = myTokens ?? [];

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

              {myGroupBuys.length > 0 && (
                <div>
                  <div className="small semi muted" style={{ marginBottom: 8 }}>{t("your_group_buys")}</div>
                  <div className="col gap-12">
                    {myGroupBuys.map((r) => <GroupBuyCard key={r.id} req={r} onJoin={setJoining} />)}
                  </div>
                </div>
              )}

              {tokens.length === 0 && myGroupBuys.length === 0 && (
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
      {joining && (
        <JoinGroupBuySheet
          req={joining}
          onJoined={() => { refetchGroupBuys(); refetchTokens(); }}
          onClose={() => setJoining(null)}
        />
      )}
    </div>
  );
}
