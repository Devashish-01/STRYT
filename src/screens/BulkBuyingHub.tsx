import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { Package, Users, Plus, Ticket } from "@/components/Icons";
import { bulkService, requestService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import BulkDealCard from "@/components/BulkDealCard";
import GroupBuyCard from "@/components/GroupBuyCard";
import JoinGroupBuySheet from "@/components/JoinGroupBuySheet";
import GroupBuyClaimPassModal from "@/components/GroupBuyClaimPassModal";
import BulkOrderSheet from "@/components/BulkOrderSheet";
import { RADIUS_OPTIONS } from "@/utils/constants";
import type { BulkDeal, GroupBuyToken, RequestPost } from "@/types";

type Tab = "all" | "deals" | "groups" | "mine";

const TABS: [Tab, string][] = [
  ["all", "All bulk"],
  ["deals", "Business deals"],
  ["groups", "Group buys"],
  ["mine", "My activity"],
];

export default function BulkBuyingHub() {
  const nav = useNavigate();
  const { user, isGuest } = useApp();
  const requireAuth = useRequireAuth();
  const [tab, setTab] = useState<Tab>("all");
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [joining, setJoining] = useState<RequestPost | null>(null);
  const [ordering, setOrdering] = useState<BulkDeal | null>(null);
  const [viewingPass, setViewingPass] = useState<GroupBuyToken | null>(null);

  const geoKey = `${user.lat?.toFixed(2) ?? "0"}:${user.lng?.toFixed(2) ?? "0"}:${radiusKm}`;

  const { data: deals, loading: dealsLoading, refetch: refetchDeals } = useQuery(
    () => bulkService.deals({ lat: user.lat || undefined, lng: user.lng || undefined, radius: radiusKm }),
    [user.lat, user.lng, radiusKm],
    `bulk:deals:${geoKey}`
  );

  // Group buys are RequestPosts with isGroupBuy — reusing the request feed
  // rather than a parallel table is what lets them inherit proposals,
  // counter-offers and agreements for free.
  const { data: groupBuyList, loading: reqLoading, refetch: refetchReqs } = useQuery(
    async () => {
      const page = await requestService.feed({ lat: user.lat || undefined, lng: user.lng || undefined });
      const open = (page.data ?? []).filter((r) => r.isGroupBuy && r.status === "OPEN");
      // One extra round trip for the whole list, not one per card.
      return requestService.enrichGroupBuyPledges(open);
    },
    [user.lat, user.lng],
    `bulk:groups:${geoKey}`
  );

  const { data: myTokens, refetch: refetchTokens } = useQuery(
    () => (isGuest ? Promise.resolve([]) : bulkService.myTokens()),
    [user.id, isGuest],
    isGuest ? undefined : `bulk:tokens:${user.id}`
  );

  const groupBuys = useMemo(() => groupBuyList ?? [], [groupBuyList]);

  const myDeals = useMemo(
    () => (deals ?? []).filter((d) => d.ownerUserId === user.id),
    [deals, user.id]
  );
  const myGroupBuys = useMemo(
    () => groupBuys.filter((r) => r.requesterUserId === user.id || (r.myPledgeQuantity ?? 0) > 0),
    [groupBuys, user.id]
  );

  const loading = dealsLoading || reqLoading;

  function onJoin(r: RequestPost) {
    requireAuth(() => setJoining(r), "Sign in to join a group buy")();
  }

  const dealCards = (list: BulkDeal[]) =>
    list.map((d) => (
      <BulkDealCard
        key={d.id}
        deal={d}
        onBook={(deal) => requireAuth(() => setOrdering(deal), "Sign in to order in bulk")()}
      />
    ));
  const groupCards = (list: RequestPost[]) =>
    list.map((r) => <GroupBuyCard key={r.id} req={r} onJoin={onJoin} />);

  return (
    <div className="screen with-nav">
      <AppBar
        title="Bulk & group buys"
        subtitle="Buy together, save more"
      />
      <div className="screen-scroll">
        <div className="page-pad col gap-12" style={{ paddingBottom: 24 }}>
          <div className="row gap-8">
            <button
              className="btn btn-primary btn-sm grow row gap-6 center"
              onClick={requireAuth(() => nav("/ask?groupBuy=1"), "Sign in to start a group buy")}
            >
              <Users size={14} /> Start group buy
            </button>
            <button
              className="btn btn-outline btn-sm grow row gap-6 center"
              onClick={requireAuth(() => nav("/manage"), "Sign in to post a deal")}
            >
              <Plus size={14} /> Post a deal
            </button>
          </div>

          <div className="hscroll">
            {TABS.map(([id, label]) => (
              <button key={id} className={`chip ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {tab !== "mine" && (
            <div className="row gap-8 center-v">
              <span className="tiny muted">Within</span>
              <div className="hscroll grow">
                {RADIUS_OPTIONS.filter((o) => o.km >= 1).map((o) => (
                  <button
                    key={o.km}
                    className={`chip ${radiusKm === o.km ? "active" : ""}`}
                    onClick={() => setRadiusKm(o.km)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && tab !== "mine" && <ListSkeleton count={3} />}

          {/* All — blended, deals first so there's always something bookable
              at the top even when no pool is currently running. */}
          {tab === "all" && !loading && (
            (deals ?? []).length + groupBuys.length === 0 ? (
              <EmptyState emoji="📦" title="Nothing bulk nearby yet" text="Widen the radius, or start a group buy so neighbours can join in." />
            ) : (
              <div className="col gap-12">
                {dealCards(deals ?? [])}
                {groupCards(groupBuys)}
              </div>
            )
          )}

          {tab === "deals" && !loading && (
            (deals ?? []).length === 0 ? (
              <EmptyState emoji="🏷️" title="No bulk deals nearby" text="Businesses near you haven't posted wholesale offers yet." />
            ) : (
              <div className="col gap-12">{dealCards(deals ?? [])}</div>
            )
          )}

          {tab === "groups" && !loading && (
            groupBuys.length === 0 ? (
              <EmptyState emoji="👥" title="No open group buys" text="Start one and your neighbours can pool in with you." />
            ) : (
              <div className="col gap-12">{groupCards(groupBuys)}</div>
            )
          )}

          {tab === "mine" && (
            isGuest ? (
              <EmptyState emoji="🔒" title="Sign in to see your activity" text="Your pledges, passes and posted deals live here." />
            ) : (
              <div className="col gap-16">
                {(myTokens ?? []).length > 0 && (
                  <div>
                    <div className="small semi muted" style={{ marginBottom: 8 }}>Your claim passes</div>
                    <div className="col gap-8">
                      {(myTokens ?? []).map((tk) => (
                        <button key={tk.id} className="card row between center-v" style={{ padding: 12 }} onClick={() => setViewingPass(tk)}>
                          <div className="row gap-10 center-v" style={{ minWidth: 0 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Ticket size={18} color="var(--brand-700)" />
                            </div>
                            <div style={{ minWidth: 0, textAlign: "left" }}>
                              <div className="semi small ellipsis">{tk.itemLabel || "Group buy pass"}</div>
                              <div className="tiny muted">{tk.quantity} unit{tk.quantity > 1 ? "s" : ""} · {tk.tokenCode}</div>
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
                            {tk.status === "ISSUED" ? "READY" : tk.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {myGroupBuys.length > 0 && (
                  <div>
                    <div className="small semi muted" style={{ marginBottom: 8 }}>Your group buys</div>
                    <div className="col gap-12">{groupCards(myGroupBuys)}</div>
                  </div>
                )}

                {myDeals.length > 0 && (
                  <div>
                    <div className="small semi muted" style={{ marginBottom: 8 }}>Your posted deals</div>
                    <div className="col gap-12">{dealCards(myDeals)}</div>
                  </div>
                )}

                {(myTokens ?? []).length === 0 && myGroupBuys.length === 0 && myDeals.length === 0 && (
                  <EmptyState emoji="📦" title="Nothing here yet" text="Join a group buy or post a bulk deal and it'll show up here." />
                )}
              </div>
            )
          )}
        </div>
      </div>

      {joining && (
        <JoinGroupBuySheet
          req={joining}
          onJoined={() => { refetchReqs(); refetchTokens(); }}
          onClose={() => setJoining(null)}
        />
      )}
      {ordering && (
        <BulkOrderSheet
          deal={ordering}
          onOrdered={() => refetchDeals()}
          onClose={() => setOrdering(null)}
        />
      )}
      {viewingPass && <GroupBuyClaimPassModal token={viewingPass} onClose={() => setViewingPass(null)} />}
    </div>
  );
}
