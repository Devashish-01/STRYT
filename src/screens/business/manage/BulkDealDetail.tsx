import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, inr, EmptyState } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { CheckCircle2, XCircle, Clock, Users, AlertCircle, Calendar, Share2 } from "@/components/Icons";
import { bulkService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { poolProgress } from "@/lib/groupBuy";
import ShareCard from "@/components/ShareCard";
import type { BulkDealPledge, DepositStatus } from "@/types";

const DEPOSIT_META: Record<DepositStatus, { label: string; color: string; bg: string }> = {
  UNPAID: { label: "Not paid", color: "var(--ink-500)", bg: "var(--ink-100)" },
  PENDING_CONFIRM: { label: "Awaiting confirm", color: "var(--amber-700)", bg: "var(--amber-50)" },
  PAID: { label: "Paid", color: "var(--green-600)", bg: "var(--green-100)" },
  REJECTED: { label: "Rejected", color: "var(--red-600)", bg: "var(--red-50)" },
};

/** The tap-through detail screen BulkDealsManager's list was missing —
 *  progress toward MOQ, every pledger's deposit status with confirm/reject,
 *  and the close-campaign decision (fulfil / refund / extend). */
export default function BulkDealDetail() {
  const { dealId = "" } = useParams();
  const { showToast } = useApp();
  const { data: deal, loading, refetch } = useQuery(() => bulkService.getDeal(dealId), [dealId], `bulk:deal:${dealId}`);
  const { data: pledgesData, refetch: refetchPledges } = useQuery(
    () => bulkService.pledgesForDeal(dealId),
    [dealId],
    `bulk:pledges:${dealId}`
  );
  const { data: stats } = useQuery(
    () => (deal?.closeOutcome === "FULFILLED" ? bulkService.dealRedemptionStats(dealId) : Promise.resolve(null)),
    [dealId, deal?.closeOutcome],
    deal?.closeOutcome === "FULFILLED" ? `bulk:deal-stats:${dealId}` : undefined
  );
  // Per-pledger claim-pass status — the aggregate stat chips above answer "how
  // many redeemed", not "did Priya specifically pick hers up yet", which is
  // the question a business actually has while checking the roster.
  const { data: tokensData } = useQuery(
    () => (deal?.closeOutcome === "FULFILLED" ? bulkService.tokensForDeal(dealId) : Promise.resolve(null)),
    [dealId, deal?.closeOutcome],
    deal?.closeOutcome === "FULFILLED" ? `bulk:deal-tokens:${dealId}` : undefined
  );
  const tokenByHolder = new Map((tokensData ?? []).map((tk) => [tk.holderUserId, tk]));

  const [busyId, setBusyId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extendDate, setExtendDate] = useState("");
  const [closing, setClosing] = useState(false);

  const pledges = pledgesData ?? [];
  const hasDeposit = !!deal?.depositAmount;
  // Only PAID pledges count toward the server's own auto-close threshold —
  // when there's no deposit to gate on, deposit_status never leaves UNPAID,
  // so treat every pledge as counting instead (surfaced via the note below).
  const confirmedQty = hasDeposit
    ? pledges.filter((p) => p.depositStatus === "PAID").reduce((s, p) => s + p.quantity, 0)
    : pledges.reduce((s, p) => s + p.quantity, 0);
  const totalPledged = deal?.pledgedQuantity ?? pledges.reduce((s, p) => s + p.quantity, 0);
  const { pledged, target, pct, remaining, hasTarget } = poolProgress({ target: deal?.moq, pledgedQuantity: confirmedQty });
  const isClosed = !!deal?.closedAtISO;
  const outcome = deal?.closeOutcome ?? null;
  const pendingDecision = isClosed && !outcome;
  const targetMet = hasTarget && pledged >= target;

  async function confirm(p: BulkDealPledge) {
    setBusyId(p.id);
    try {
      await bulkService.confirmDeposit(dealId, p.userId);
      showToast(`Confirmed ${p.pledgerName || "pledger"}'s deposit`);
      refetchPledges();
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't confirm — try again");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(p: BulkDealPledge) {
    setBusyId(p.id);
    try {
      await bulkService.rejectDeposit(dealId, p.userId);
      showToast("Deposit rejected — they can try paying again");
      refetchPledges();
    } catch (e: any) {
      showToast(e?.message || "Couldn't reject — try again");
    } finally {
      setBusyId(null);
    }
  }

  async function close(withOutcome?: "FULFILLED" | "REFUNDED") {
    setClosing(true);
    try {
      await bulkService.closeDeal(dealId, withOutcome ?? null);
      showToast(withOutcome === "REFUNDED" ? "Closed — refund your pledgers directly" : "Closed — claim passes issued to paid pledgers");
      setConfirmingClose(false);
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't close — try again");
    } finally {
      setClosing(false);
    }
  }

  async function extend() {
    if (!extendDate) { showToast("Pick a new closing date"); return; }
    const iso = new Date(extendDate).toISOString();
    setBusyId("extend");
    try {
      await bulkService.extendDeal(dealId, iso);
      showToast("Deadline extended");
      setExtending(false);
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't extend — try again");
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !deal) {
    return (
      <div className="screen">
        <AppBar title="Bulk deal" />
        <div className="screen-scroll page-pad"><ListSkeleton count={3} /></div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar
        title={deal.title}
        subtitle={`Min ${deal.moq} · ${inr(deal.regularPrice)} regular`}
        right={
          <button className="icon-btn" onClick={() => setSharing(true)} aria-label="Share campaign">
            <Share2 size={20} />
          </button>
        }
      />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 24 }}>

        {/* Status banner */}
        {isClosed && outcome === "FULFILLED" && (
          <div className="card row gap-10 center-v" style={{ padding: 14, background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
            <CheckCircle2 size={20} color="var(--green-600)" style={{ flexShrink: 0 }} />
            <div className="tiny" style={{ color: "var(--green-700)", lineHeight: 1.5 }}>Closed and fulfilled — claim passes issued to every paid pledger.</div>
          </div>
        )}
        {isClosed && outcome === "REFUNDED" && (
          <div className="card row gap-10 center-v" style={{ padding: 14, background: "var(--ink-50)", border: "1px solid var(--ink-200)" }}>
            <XCircle size={20} color="var(--ink-500)" style={{ flexShrink: 0 }} />
            <div className="tiny" style={{ color: "var(--ink-600)", lineHeight: 1.5 }}>Closed as refunded — settle deposits with pledgers directly, nothing was auto-charged.</div>
          </div>
        )}
        {pendingDecision && (
          <div className="card col gap-10" style={{ padding: 14, background: "var(--amber-50)", border: "1px solid var(--amber-500)" }}>
            <div className="row gap-8 center-v">
              <AlertCircle size={18} color="var(--amber-700)" />
              <div className="semi small" style={{ color: "var(--amber-800)" }}>Closed under target — decide what happens</div>
            </div>
            <div className="tiny" style={{ color: "var(--amber-800)", lineHeight: 1.5 }}>
              {pledged} of {target} confirmed. Fulfil anyway, refund everyone, or reopen with a new deadline.
            </div>
          </div>
        )}

        {/* Redemption stats once fulfilled */}
        {stats && (
          <div className="row gap-8">
            <StatChip label="Passes" value={stats.total} />
            <StatChip label="Redeemed" value={stats.redeemed} color="var(--green-600)" />
            <StatChip label="Pending" value={stats.pending} color="var(--amber-700)" />
          </div>
        )}

        {/* Progress */}
        {hasTarget && (
          <div className="card col gap-8" style={{ padding: 14 }}>
            <div className="row between tiny">
              <span className="semi" style={{ color: "var(--amber-700)" }}>{pledged} of {target} confirmed</span>
              <span className="muted">{remaining > 0 ? `${remaining} more to close` : "Target reached"}</span>
            </div>
            <div style={{ height: 8, borderRadius: 6, background: "var(--ink-100)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--green-500)" : "var(--amber-500)", transition: "width .3s" }} />
            </div>
            {hasDeposit && totalPledged !== confirmedQty && (
              <div className="tiny muted">{totalPledged} pledged in total — the rest are unpaid or awaiting confirmation below.</div>
            )}
            {!hasDeposit && (
              <div className="tiny muted">No deposit required on this deal, so pledges don't auto-confirm — close it yourself when you're ready to fulfil.</div>
            )}
            {deal.closesAtISO && !isClosed && (
              <div className="row gap-6 center-v tiny muted">
                <Calendar size={12} /> Closes {new Date(deal.closesAtISO).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Close / manage actions */}
        {!isClosed && (
          <div className="col gap-8">
            {targetMet ? (
              <button className="btn btn-primary btn-block" disabled={closing} onClick={() => close()}>
                {closing ? "Closing…" : `Close & fulfil — ${pledged} pledges`}
              </button>
            ) : !confirmingClose ? (
              <button className="btn btn-outline btn-block" onClick={() => setConfirmingClose(true)}>Close campaign early</button>
            ) : (
              <div className="card col gap-8" style={{ padding: 12 }}>
                <div className="tiny muted">Under target ({pledged} of {target}). What should happen to it?</div>
                <button className="btn btn-primary btn-sm" disabled={closing} onClick={() => close("FULFILLED")}>Fulfil anyway</button>
                <button className="btn btn-sm" style={{ background: "var(--ink-100)" }} disabled={closing} onClick={() => close("REFUNDED")}>Refund everyone</button>
                <button className="btn btn-sm" style={{ background: "none" }} onClick={() => setConfirmingClose(false)}>Cancel</button>
              </div>
            )}
            {!extending ? (
              <button className="btn btn-outline btn-sm" onClick={() => setExtending(true)}>{deal.closesAtISO ? "Extend deadline" : "Set a deadline"}</button>
            ) : (
              <div className="row gap-8 center-v">
                <input type="datetime-local" className="input grow" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
                <button className="btn btn-primary btn-sm" disabled={busyId === "extend"} onClick={extend}>Save</button>
                <button className="btn btn-sm" style={{ background: "none" }} onClick={() => setExtending(false)}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {pendingDecision && (
          <div className="col gap-8">
            <button className="btn btn-primary btn-sm" disabled={closing} onClick={() => close("FULFILLED")}>Fulfil anyway</button>
            <button className="btn btn-sm" style={{ background: "var(--ink-100)" }} disabled={closing} onClick={() => close("REFUNDED")}>Refund everyone</button>
            {!extending ? (
              <button className="btn btn-outline btn-sm" onClick={() => setExtending(true)}>{deal.closesAtISO ? "Extend deadline instead" : "Set a deadline instead"}</button>
            ) : (
              <div className="row gap-8 center-v">
                <input type="datetime-local" className="input grow" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
                <button className="btn btn-primary btn-sm" disabled={busyId === "extend"} onClick={extend}>Save</button>
                <button className="btn btn-sm" style={{ background: "none" }} onClick={() => setExtending(false)}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {/* Pledger roster */}
        <div>
          <div className="row gap-6 center-v small semi muted" style={{ marginBottom: 8 }}>
            <Users size={14} /> Pledgers ({pledges.length})
          </div>
          {pledges.length === 0 && (
            <EmptyState emoji="🙋" title="No pledges yet" text="Once someone pledges into this campaign, they'll show up here." />
          )}
          <div className="col gap-8">
            {pledges.map((p) => {
              const meta = DEPOSIT_META[p.depositStatus];
              return (
                <div key={p.id} className="card col gap-6" style={{ padding: 12 }}>
                  <div className="row between center-v">
                    <div style={{ minWidth: 0 }}>
                      <div className="semi small ellipsis">{p.pledgerName || "Customer"}</div>
                      <div className="tiny muted">{p.quantity} unit{p.quantity > 1 ? "s" : ""}{p.depositAmount != null ? ` · ${inr(p.depositAmount)} deposit` : ""}</div>
                    </div>
                    <span className="badge" style={{ background: meta.bg, color: meta.color, fontSize: 10, flexShrink: 0 }}>{meta.label}</span>
                  </div>
                  {p.notes && <div className="tiny muted">"{p.notes}"</div>}
                  {p.deliveryAddress && <div className="tiny muted">📍 {p.deliveryAddress}</div>}
                  {outcome === "FULFILLED" && tokenByHolder.has(p.userId) && (() => {
                    const redeemed = tokenByHolder.get(p.userId)!.status === "REDEEMED";
                    return (
                      <div className="row gap-6 center-v tiny" style={{ color: redeemed ? "var(--green-600)" : "var(--amber-700)" }}>
                        {redeemed ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                        {redeemed ? "Claim pass redeemed" : "Claim pass issued — not redeemed yet"}
                      </div>
                    );
                  })()}
                  {p.depositStatus === "PENDING_CONFIRM" && !isClosed && (
                    <div className="row gap-8" style={{ marginTop: 4 }}>
                      <button className="btn btn-primary btn-sm grow" disabled={busyId === p.id} onClick={() => confirm(p)}>
                        <CheckCircle2 size={14} /> Confirm
                      </button>
                      <button className="btn btn-sm grow" style={{ background: "var(--red-50)", color: "var(--red-600)" }} disabled={busyId === p.id} onClick={() => reject(p)}>
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  )}
                  {p.depositStatus === "PENDING_CONFIRM" && isClosed && (
                    <div className="tiny muted row gap-4 center-v"><Clock size={11} /> Campaign already closed — confirming now won't issue a claim pass.</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {sharing && (
        <ShareCard
          subjects={{
            kind: "campaign",
            id: deal.id,
            businessId: deal.businessId,
            // This screen is owner-gated, so the in-store poster applies.
            viewerManages: true,
            title: deal.title,
            subtitle: deal.businessName || "Bulk-buying campaign",
            image: deal.image || deal.businessCover || "",
            meta: hasTarget ? `${pledged} of ${target} pledged` : undefined,
          }}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="card col center grow" style={{ padding: 10 }}>
      <div className="bold" style={{ fontSize: 18, color: color ?? "var(--ink-900)" }}>{value}</div>
      <div className="tiny muted">{label}</div>
    </div>
  );
}
