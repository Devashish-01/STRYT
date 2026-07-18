import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg, PullToRefreshIndicator } from "@/components/common";
import { NoQueueIllustration } from "@/components/illustrations";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { businessService } from "@/services";
import { useApp } from "@/store";
import { ArrowUpDown, Clock, Users, X, CreditCard, CheckCircle2, AlertCircle } from "@/components/Icons";
import { QueuePaymentSheet } from "@/components/QueuePaymentSheet";
import { isQueuePayable as isPayable } from "@/lib/queueMath";
import type { MyQueueEntry } from "@/types";

const ACTIVE: MyQueueEntry["status"][] = ["WAITING", "CALLED"];

// A customer can back out any time until money is in motion — while waiting,
// after being called (their turn), even after being served — as long as they
// haven't started paying. Once a payment is claimed (PENDING_CONFIRM) or
// confirmed (PAID), cancelling is off (enforced server-side too).
function isCancellable(q: MyQueueEntry): boolean {
  const paid = q.paymentStatus ?? "UNPAID";
  const openState = q.status === "WAITING" || q.status === "CALLED" || q.status === "SERVED";
  return openState && (paid === "UNPAID" || paid === "REJECTED");
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Clock time `min` minutes from now, e.g. "4:35 PM".
function etaClock(min: number): string {
  return new Date(Date.now() + min * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MyQueues() {
  const nav = useNavigate();
  const { showToast } = useApp();
  const { data, loading, error, refetch } = useQueryWithRealtime(() => businessService.myQueues(), "queue_tokens", []);
  const [tab, setTab] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
  const [sortByName, setSortByName] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [payingQueue, setPayingQueue] = useState<MyQueueEntry | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<MyQueueEntry | null>(null);
  const [cancellingClaim, setCancellingClaim] = useState<string | null>(null);

  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const all = data ?? [];
  const active = all.filter((q) => ACTIVE.includes(q.status) && !removedIds.has(q.tokenId));
  const history = all.filter((q) => !ACTIVE.includes(q.status));
  let list = tab === "ACTIVE" ? [...active] : [...history];
  if (tab === "ACTIVE" && sortByName) list.sort((a, b) => a.businessName.localeCompare(b.businessName));

  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh<HTMLDivElement>(refetch);

  // Leaving a waiting line is low-stakes (direct); cancelling after your turn
  // has come or after being served is higher-stakes, so it routes through a
  // confirm sheet first.
  function requestCancel(q: MyQueueEntry) {
    if (q.status === "WAITING") leave(q.tokenId);
    else setConfirmCancel(q);
  }

  async function leave(tokenId: string) {
    setLeaving(tokenId);
    // Optimistic: hide it immediately rather than waiting on refetch, so the
    // tap always feels like it did something even before the write round-trips.
    setRemovedIds((prev) => new Set(prev).add(tokenId));
    try {
      await businessService.leaveQueueToken(tokenId);
      showToast("Left the queue");
      refetch();
    } catch (e: any) {
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(tokenId);
        return next;
      });
      showToast(e?.message ? `Couldn't leave queue: ${e.message}` : "Couldn't leave queue. Try again.");
    } finally {
      setLeaving(null);
    }
  }

  // Undo an unconfirmed "I've paid" claim — the only way today to get the
  // cancel/pay-again buttons back if the business hasn't responded yet.
  async function cancelClaim(tokenId: string) {
    setCancellingClaim(tokenId);
    try {
      await businessService.cancelQueuePaymentClaim(tokenId);
      showToast("Payment claim cancelled");
      refetch();
    } catch (e: any) {
      showToast(e?.message ? `Couldn't cancel claim: ${e.message}` : "Couldn't cancel claim. Try again.");
    } finally {
      setCancellingClaim(null);
    }
  }

  return (
    <div className="screen screen-boxed">
      <AppBar title="My Queues" subtitle={active.length > 0 ? `${active.length} active` : undefined} />

      <div className="hscroll" style={{ paddingTop: 12, paddingBottom: 6 }}>
        <button className={`chip ${tab === "ACTIVE" ? "active" : ""}`} onClick={() => setTab("ACTIVE")}>
          ⏳ Active{active.length > 0 ? ` (${active.length})` : ""}
        </button>
        <button className={`chip ${tab === "HISTORY" ? "active" : ""}`} onClick={() => setTab("HISTORY")}>
          🕘 History
        </button>
      </div>

      <div ref={containerRef} className="screen-scroll">
        <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} threshold={threshold} />
        {loading && <ListSkeleton count={3} type="appointment" />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {!loading && !error && (
          <div className="page-pad col gap-12" style={{ paddingTop: 8 }}>
            {tab === "ACTIVE" && active.length > 0 && (
              <button
                className="row gap-6 center-v tiny semi"
                style={{ alignSelf: "flex-end", color: "var(--brand-700)" }}
                onClick={() => setSortByName((v) => !v)}
              >
                <ArrowUpDown size={13} /> Sort: {sortByName ? "Shop name" : "Wait time"}
              </button>
            )}

            {list.length === 0 ? (
              <EmptyState
                illustration={<NoQueueIllustration />}
                emoji="👥"
                title={tab === "ACTIVE" ? "No active queues" : "No queue history yet"}
                text={tab === "ACTIVE" ? "Join a shop's live queue and it'll show up here." : "Served and left queues appear here."}
              />
            ) : (
              list.map((q) => {
                const isCalled = q.status === "CALLED";
                const wait = q.estWaitMin ?? 0;
                return (
                <div
                  key={q.tokenId}
                  className="card gap-12"
                  style={{ padding: 14, border: isCalled ? "2px solid var(--green-500)" : "1px solid var(--line)", background: isCalled ? "var(--green-100)" : undefined }}
                >
                  <div className="row gap-12 center-v">
                    <SafeImg
                      src={q.businessImage}
                      className="thumb"
                      style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", flexShrink: 0, cursor: "pointer" }}
                      onClick={() => nav(`/business/${q.businessId}`)}
                    />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="bold small ellipsis">{q.businessName}</div>
                      <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                        <Users size={11} /> {q.partySize} · <Clock size={11} /> joined {timeAgo(q.joinedAtISO)}
                      </div>
                      <div className="row gap-6" style={{ marginTop: 6, flexWrap: "wrap" }}>
                        {q.status === "WAITING" && (
                          <span className="badge badge-purple">You're #{q.position} · {q.peopleAhead} ahead</span>
                        )}
                        {isCalled && <span className="badge badge-green">🔔 It's your turn — head in now!</span>}
                        {q.status === "SERVED" && <span className="badge badge-gray">✓ Served</span>}
                        {q.status === "LEFT" && <span className="badge badge-gray">You cancelled</span>}
                        {q.status === "EXPIRED" && <span className="badge badge-gray">Queue closed by shop</span>}
                        {isPayable(q.status) && (
                          <span
                            className={`badge ${
                              q.paymentStatus === "PAID" ? "badge-green" :
                              q.paymentStatus === "PENDING_CONFIRM" ? "badge-amber" :
                              q.paymentStatus === "REJECTED" ? "badge-red" : "badge-gray"
                            }`}
                          >
                            {q.paymentStatus === "PAID" ? "PAID" :
                             q.paymentStatus === "PENDING_CONFIRM" ? "Payment pending" :
                             q.paymentStatus === "REJECTED" ? "Payment declined" : "UNPAID"}
                          </span>
                        )}
                      </div>
                    </div>
                    {isCancellable(q) && (
                      <button
                        className="icon-btn"
                        style={{ width: 34, height: 34, color: "var(--red-600)", flexShrink: 0 }}
                        disabled={leaving === q.tokenId}
                        onClick={() => requestCancel(q)}
                        aria-label={q.status === "WAITING" ? "Leave queue" : "Cancel visit"}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {/* Live ETA banner — only while genuinely waiting */}
                  {q.status === "WAITING" && (
                    <div className="row between center-v" style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "var(--brand-50)" }}>
                      <div className="row gap-8 center-v">
                        <Clock size={16} color="var(--brand-700)" />
                        <div>
                          <div className="semi small" style={{ color: "var(--brand-700)" }}>
                            {wait <= 0 ? "You're next!" : `~${wait} min wait`}
                          </div>
                          <div className="tiny muted">{q.peopleAhead === 0 ? "No one ahead of you" : `${q.peopleAhead} ahead`}</div>
                        </div>
                      </div>
                      <div className="col" style={{ alignItems: "flex-end" }}>
                        <span className="tiny muted">Around</span>
                        <span className="bold small" style={{ color: "var(--brand-700)" }}>{etaClock(wait)}</span>
                      </div>
                    </div>
                  )}

                  {/* Payment — claimable once called, stays actionable after served */}
                  {isPayable(q.status) && q.paymentStatus === "PAID" && (
                    <div className="card row gap-8 center-v" style={{ marginTop: 12, padding: 10, background: "var(--green-100)", border: "1px solid var(--green-500)", borderRadius: 10 }}>
                      <CheckCircle2 size={16} color="var(--green-500)" style={{ flexShrink: 0 }} />
                      <span className="tiny semi" style={{ color: "var(--green-600)" }}>
                        Payment confirmed{q.paymentMethod ? ` via ${q.paymentMethod}` : ""}{q.paymentAmount ? ` • ₹${q.paymentAmount}` : ""}
                      </span>
                    </div>
                  )}
                  {isPayable(q.status) && q.paymentStatus === "PENDING_CONFIRM" && (
                    <div className="card row gap-8 center-v" style={{ marginTop: 12, padding: 10, background: "var(--amber-50)", border: "1px solid var(--amber-100)", borderRadius: 10 }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>⏳</span>
                      <div className="grow">
                        <div className="tiny semi" style={{ color: "var(--amber-700)" }}>Awaiting confirmation</div>
                        <div className="tiny" style={{ color: "var(--amber-700)", marginTop: 1 }}>{q.businessName} will verify and confirm receipt.</div>
                      </div>
                      <button
                        type="button"
                        className="tiny semi"
                        style={{ color: "var(--amber-700)", textDecoration: "underline", flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
                        disabled={cancellingClaim === q.tokenId}
                        onClick={() => cancelClaim(q.tokenId)}
                      >
                        {cancellingClaim === q.tokenId ? "Cancelling…" : "Cancel claim"}
                      </button>
                    </div>
                  )}
                  {isPayable(q.status) && q.paymentStatus === "REJECTED" && (
                    <div className="card row gap-8 center-v" style={{ marginTop: 12, padding: 10, background: "var(--red-50)", border: "1px solid var(--red-100)", borderRadius: 10 }}>
                      <AlertCircle size={16} color="var(--red-600)" style={{ flexShrink: 0 }} />
                      <div className="grow">
                        <div className="tiny semi" style={{ color: "var(--red-600)" }}>Business couldn't verify payment</div>
                        <div className="tiny" style={{ color: "var(--red-600)", marginTop: 1 }}>Please retry or contact them directly.</div>
                      </div>
                      <button
                        className="btn btn-sm"
                        style={{ fontSize: 11, padding: "4px 10px", background: "var(--brand-600)", color: "#fff", borderRadius: 8, flexShrink: 0 }}
                        onClick={() => setPayingQueue(q)}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {isPayable(q.status) && (!q.paymentStatus || q.paymentStatus === "UNPAID") && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm row gap-6 center"
                      style={{ marginTop: 12, fontSize: 12, padding: "6px 14px", alignSelf: "flex-start" }}
                      onClick={() => setPayingQueue(q)}
                    >
                      <CreditCard size={13} />Pay now
                    </button>
                  )}
                </div>
                );
              })
            )}
          </div>
        )}
        <div style={{ height: 16 }} />
      </div>

      {payingQueue && (
        <QueuePaymentSheet
          tokenId={payingQueue.tokenId}
          businessName={payingQueue.businessName}
          businessUpiId={payingQueue.businessUpiId}
          onPaid={refetch}
          onClose={() => setPayingQueue(null)}
        />
      )}

      {confirmCancel && (
        <div className="overlay" onClick={() => setConfirmCancel(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <h2 className="h2" style={{ marginBottom: 6 }}>Cancel this visit?</h2>
            <p className="small muted" style={{ marginBottom: 16, lineHeight: 1.5 }}>
              You'll give up your spot at {confirmCancel.businessName}. You can rejoin later, but you'll start at the back of the line.
            </p>
            <div className="col gap-8">
              <button
                className="btn btn-block"
                style={{ background: "var(--red-500)", color: "#fff" }}
                disabled={leaving === confirmCancel.tokenId}
                onClick={() => { const t = confirmCancel; setConfirmCancel(null); leave(t.tokenId); }}
              >
                Yes, cancel
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => setConfirmCancel(null)}>Keep my spot</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
