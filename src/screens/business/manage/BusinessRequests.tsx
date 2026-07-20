import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, EmptyState, inr } from "@/components/common";
import { requestService, businessService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { RequestCard } from "@/components/cards";
import { PROPOSAL_STATUS_BADGE } from "@/lib/statusBadges";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";
import type { RequestPost } from "@/types";

// Business-as-responder: open requests matching the business category, plus
// a "Sent" tab tracking this business's own submitted proposals independently
// of the generic open-request feed.
export default function BusinessRequests() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast } = useApp();
  const [tab, setTab] = useState<"find" | "sent">("find");
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const { data: b } = useQuery(() => businessService.get(id), [id], `business:${id}`);
  const { data, loading, error, refetch } = useQueryWithRealtime(
    () => requestService.feed({
      lat: b?.lat ?? undefined,
      lng: b?.lng ?? undefined,
      radiusKm: b?.broadcastRadius ?? undefined,
    }),
    "requests",
    [b?.lat, b?.lng, b?.broadcastRadius]
  );
  const { data: sentProposals, loading: sentLoading, refetch: refetchSent } = useQuery(
    () => requestService.myProposals(id),
    [id]
  );

  async function withdraw(proposalId: string) {
    setWithdrawing(proposalId);
    haptics.medium();
    try {
      await requestService.withdrawProposal(proposalId);
      haptics.success();
      showToast("Proposal withdrawn");
      refetchSent();
    } catch (e: any) {
      showToast(e?.message || "Couldn't withdraw — try again");
    } finally {
      setWithdrawing(null);
    }
  }

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Requests" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  // Show open requests that (a) match this shop's category and (b) fall within
  // its access range. Category match is the whole point — a bakery shouldn't be
  // shown plumbing requests. Requests with no category fall through to everyone.
  const range = b?.broadcastRadius ?? 5;
  const items = ((data?.data ?? []) as RequestPost[])
    .filter((r) => r.status === "OPEN")
    .filter((r) => !r.categoryId || !b?.categoryId || r.categoryId === b.categoryId)
    .filter((r) => !r.lat || !r.lng || r.distanceKm <= range);

  return (
    <div className="screen">
      <AppBar title="Requests" subtitle={`Within ${range} km of ${b?.name ?? "your shop"}`} />
      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "#fff" }}>
        {([["find", "Find requests"], ["sent", `Sent (${sentProposals?.length ?? 0})`]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className="semi"
            style={{ flex: 1, padding: "12px 0", fontSize: 14, color: tab === t ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>
      <div className="screen-scroll">
        {tab === "find" ? (
          <>
            <div className="page-pad" style={{ paddingBottom: 0 }}>
              <div className="card row gap-10" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
                <span style={{ fontSize: 20 }}>🙋</span>
                <span className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.4 }}>Requests within your <b>{range} km</b> range. Send a proposal as <b>{b?.name}</b> to win the job.</span>
              </div>
            </div>
            {loading && <ListSkeleton count={3} />}
            {error && <ErrorView error={error} onRetry={refetch} />}
            {data && (
              <div className="page-pad col gap-12">
                {items.length === 0 ? (
                  <EmptyState emoji="🌙" title="No open requests" text="Check back soon — new requests appear here." />
                ) : (
                  items.map((r) => <RequestCard key={r.id} r={r} />)
                )}
              </div>
            )}
          </>
        ) : (
          <div className="page-pad col gap-10">
            {sentLoading ? (
              <ListSkeleton count={3} />
            ) : (sentProposals ?? []).length === 0 ? (
              <EmptyState emoji="📨" title="No proposals sent yet" text="Proposals you send as this business appear here." />
            ) : (
              (sentProposals ?? []).map((p) => (
                <button key={p.id} className="card" style={{ textAlign: "left" }} onClick={() => nav(`/request/${p.requestId}`)}>
                  <div className="row between">
                    <span className={`badge ${PROPOSAL_STATUS_BADGE[p.status].cls}`}>{PROPOSAL_STATUS_BADGE[p.status].label}</span>
                    <span className="tiny muted">{p.postedAt}</span>
                  </div>
                  <div className="semi small ellipsis" style={{ marginTop: 6 }}>{p.requestTitle}</div>
                  <div className="row between" style={{ marginTop: 2 }}>
                    <div className="tiny muted">Your quote: {inr(p.price)}</div>
                    {p.status === "SUBMITTED" && (
                      <button
                        className="tiny semi"
                        style={{ color: "var(--red-600)" }}
                        disabled={withdrawing === p.id}
                        onClick={(e) => { e.stopPropagation(); withdraw(p.id); }}
                      >
                        {withdrawing === p.id ? "Withdrawing…" : "Withdraw"}
                      </button>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
