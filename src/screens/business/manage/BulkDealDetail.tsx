import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { inr } from "@/lib/format";
import { ListSkeleton } from "@/components/states";
import { CheckCircle2, XCircle, Clock, Users, AlertCircle, Calendar, Share2, MessageCircle, MapPin } from "@/components/Icons";
import { bulkService } from "@/services";
import { chatService } from "@/services/engagement/chatService";
import { copyText } from "@/lib/clipboard";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { poolProgress } from "@/lib/groupBuy";
import ShareCard from "@/components/ShareCard";
import type { BulkDealPledge, DepositStatus } from "@/types";
import { errorMessage } from "@/lib/errorMessage";

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
  const nav = useNavigate();
  const { showToast, user } = useApp();
  const { t, tf } = useI18n();
  // Both realtime — watching the campaign's own row (pledged_quantity, status,
  // closed_at) and its pledge roster separately, so this screen updates live
  // instead of needing a manual reload while a customer pledges or pays.
  const { data: deal, loading, refetch } = useQueryWithRealtime(
    () => bulkService.getDeal(dealId), "bulk_deals", [dealId], `id=eq.${dealId}`, `bulk:deal:${dealId}`
  );
  const { data: pledgesData, refetch: refetchPledges } = useQueryWithRealtime(
    () => bulkService.pledgesForDeal(dealId),
    "bulk_deal_pledges",
    [dealId],
    `deal_id=eq.${dealId}`,
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
      showToast(tf("bdd_deposit_confirmed", { name: p.pledgerName || t("bdd_pledger_fallback") }));
      refetchPledges();
      refetch();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't confirm — try again"));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(p: BulkDealPledge) {
    setBusyId(p.id);
    try {
      await bulkService.rejectDeposit(dealId, p.userId);
      showToast(t("bdd_deposit_rejected"));
      refetchPledges();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't reject — try again"));
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
    } catch (e) {
      showToast(errorMessage(e, "Couldn't close — try again"));
    } finally {
      setClosing(false);
    }
  }

  /** Every address this campaign actually has to deliver to, as one block of
   *  text. The roster shows them one pledge at a time, which is fine for
   *  checking a single order and useless for actually doing a delivery round.
   *  Scoped to the pledges that count: PAID only when a deposit was required,
   *  otherwise all of them — the same rule confirmedQty above uses. */
  async function copyDeliveryList() {
    const relevant = pledges.filter((p) => (hasDeposit ? p.depositStatus === "PAID" : true) && p.deliveryAddress);
    if (relevant.length === 0) { showToast(t("bdd_no_addresses")); return; }
    const body = relevant
      .map((p, i) => `${i + 1}. ${p.pledgerName || "Customer"} — ${p.quantity} unit${p.quantity > 1 ? "s" : ""}\n   ${p.deliveryAddress}${p.notes ? `\n   Note: ${p.notes}` : ""}`)
      .join("\n\n");
    const ok = await copyText(`${deal?.title ?? "Campaign"} — ${relevant.length} deliveries\n\n${body}`);
    showToast(ok ? `Copied ${relevant.length} address${relevant.length > 1 ? "es" : ""}` : "Couldn't copy");
  }

  // The roster showed a pledger's name, quantity, notes and address but gave
  // no way to actually reach them — about a deposit reference, a delivery
  // address, or a collection time. Plain 1:1 thread (no subject): the business
  // is contacting a customer, not the other way round.
  async function messagePledger(p: BulkDealPledge) {
    try {
      const conv = await chatService.getOrCreate(p.userId);
      nav(`/chat/${conv.id}`);
    } catch (e) {
      showToast(errorMessage(e, "Couldn't open chat. Try again."));
    }
  }

  async function extend() {
    if (!extendDate) { showToast(t("bdd_pick_date")); return; }
    const picked = new Date(extendDate).getTime();
    if (isNaN(picked) || picked <= Date.now()) {
      showToast(t("bdd_date_future"));
      return;
    }
    const iso = new Date(extendDate).toISOString();
    setBusyId("extend");
    try {
      await bulkService.extendDeal(dealId, iso);
      showToast(t("bdd_deadline_extended"));
      setExtending(false);
      refetch();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't extend — try again"));
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !deal) {
    return (
      <div className="screen">
        <AppBar title={t("bdd_title")} />
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
          <button className="icon-btn" onClick={() => setSharing(true)} aria-label={t("bdd_share_campaign")}>
            <Share2 size={20} />
          </button>
        }
      />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 24 }}>

        {/* Status banner */}
        {isClosed && outcome === "FULFILLED" && (
          <div className="card row gap-10 center-v" style={{ padding: 14, background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
            <CheckCircle2 size={20} color="var(--green-600)" style={{ flexShrink: 0 }} />
            <div className="tiny" style={{ color: "var(--green-700)", lineHeight: 1.5 }}>{t("bdd_closed_fulfilled")}</div>
          </div>
        )}
        {isClosed && outcome === "REFUNDED" && (
          <div className="card row gap-10 center-v" style={{ padding: 14, background: "var(--ink-50)", border: "1px solid var(--ink-200)" }}>
            <XCircle size={20} color="var(--ink-500)" style={{ flexShrink: 0 }} />
            <div className="tiny" style={{ color: "var(--ink-600)", lineHeight: 1.5 }}>{t("bdd_closed_refunded")}</div>
          </div>
        )}
        {pendingDecision && (
          <div className="card col gap-10" style={{ padding: 14, background: "var(--amber-50)", border: "1px solid var(--amber-500)" }}>
            <div className="row gap-8 center-v">
              <AlertCircle size={18} color="var(--amber-700)" />
              <div className="semi small" style={{ color: "var(--amber-800)" }}>{t("bdd_closed_under_target")}</div>
            </div>
            <div className="tiny" style={{ color: "var(--amber-800)", lineHeight: 1.5 }}>
              {pledged} of {target} confirmed. Fulfil anyway, refund everyone, or reopen with a new deadline.
            </div>
          </div>
        )}

        {/* Redemption stats once fulfilled */}
        {stats && (
          <div className="row gap-8">
            <StatChip label={t("bdd_passes")} value={stats.total} />
            <StatChip label={t("bdd_redeemed")} value={stats.redeemed} color="var(--green-600)" />
            <StatChip label={t("pending")} value={stats.pending} color="var(--amber-700)" />
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
              <div className="tiny muted">{t("bdd_no_deposit_note")}</div>
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
              <button className="btn btn-outline btn-block" onClick={() => setConfirmingClose(true)}>{t("bdd_close_early")}</button>
            ) : (
              <div className="card col gap-8" style={{ padding: 12 }}>
                <div className="tiny muted">Under target ({pledged} of {target}). What should happen to it?</div>
                <button className="btn btn-primary btn-sm" disabled={closing} onClick={() => close("FULFILLED")}>{t("bdd_fulfil_anyway")}</button>
                <button className="btn btn-sm" style={{ background: "var(--ink-100)" }} disabled={closing} onClick={() => close("REFUNDED")}>{t("bdd_refund_everyone")}</button>
                <button className="btn btn-sm" style={{ background: "none" }} onClick={() => setConfirmingClose(false)}>{t("cancel")}</button>
              </div>
            )}
            {!extending ? (
              <button className="btn btn-outline btn-sm" onClick={() => setExtending(true)}>{deal.closesAtISO ? "Extend deadline" : "Set a deadline"}</button>
            ) : (
              <div className="row gap-8 center-v">
                <input
                  type="datetime-local"
                  className="input grow"
                  min={new Date().toISOString().slice(0, 16)}
                  value={extendDate}
                  onChange={(e) => setExtendDate(e.target.value)}
                />
                <button className="btn btn-primary btn-sm" disabled={busyId === "extend"} onClick={extend}>{t("save_button")}</button>
                <button className="btn btn-sm" style={{ background: "none" }} onClick={() => setExtending(false)}>{t("cancel")}</button>
              </div>
            )}
          </div>
        )}

        {pendingDecision && (
          <div className="col gap-8">
            <button className="btn btn-primary btn-sm" disabled={closing} onClick={() => close("FULFILLED")}>{t("bdd_fulfil_anyway")}</button>
            <button className="btn btn-sm" style={{ background: "var(--ink-100)" }} disabled={closing} onClick={() => close("REFUNDED")}>{t("bdd_refund_everyone")}</button>
            {!extending ? (
              <button className="btn btn-outline btn-sm" onClick={() => setExtending(true)}>{deal.closesAtISO ? "Extend deadline instead" : "Set a deadline instead"}</button>
            ) : (
              <div className="row gap-8 center-v">
                <input
                  type="datetime-local"
                  className="input grow"
                  min={new Date().toISOString().slice(0, 16)}
                  value={extendDate}
                  onChange={(e) => setExtendDate(e.target.value)}
                />
                <button className="btn btn-primary btn-sm" disabled={busyId === "extend"} onClick={extend}>{t("save_button")}</button>
                <button className="btn btn-sm" style={{ background: "none" }} onClick={() => setExtending(false)}>{t("cancel")}</button>
              </div>
            )}
          </div>
        )}

        {/* Doorstep only — for every other fulfilment method the customers come
            to you, so there's no round to plan and no list to hand anyone. */}
        {deal.fulfillmentType === "DOORSTEP" && pledges.some((p) => p.deliveryAddress) && (
          <button className="btn btn-outline btn-block btn-sm row gap-8 center" onClick={copyDeliveryList}>
            <MapPin size={15} /> Copy delivery list
          </button>
        )}

        {/* Pledger roster */}
        <div>
          <div className="row gap-6 center-v small semi muted" style={{ marginBottom: 8 }}>
            <Users size={14} /> Pledgers ({pledges.length})
          </div>
          {pledges.length === 0 && (
            <EmptyState emoji="🙋" title={t("bdd_no_pledges")} text={t("bdd_no_pledges_text")} />
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
                    <div className="row gap-6 center-v" style={{ flexShrink: 0 }}>
                      <span className="badge" style={{ background: meta.bg, color: meta.color, fontSize: 10 }}>{meta.label}</span>
                      {/* A team member with catalog scope CAN pledge into a
                          campaign they help manage (only the owner is blocked
                          server-side), so they can meet their own row here —
                          getOrCreate rejects self-chat, so hide it instead. */}
                      {p.userId !== user.id && (
                        <button
                          className="icon-btn"
                          style={{ width: 30, height: 30, color: "var(--brand-700)" }}
                          aria-label={`Message ${p.pledgerName || "pledger"}`}
                          onClick={() => messagePledger(p)}
                        >
                          <MessageCircle size={15} />
                        </button>
                      )}
                    </div>
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
                    <div className="tiny muted row gap-4 center-v"><Clock size={11} /> {t("bdd_already_closed")}</div>
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
