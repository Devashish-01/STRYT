import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Minus, Plus, CheckCircle2, Clock, MessageCircle } from "@/components/Icons";
import { inr } from "@/components/common";
import { bulkService } from "@/services";
import { chatService } from "@/services/engagement/chatService";
import { useApp } from "@/store";
import { PaymentMethodPanel } from "@/components/PaymentMethodPanel";
import { FULFILLMENT_LABELS, calcBulkTotal, type BulkDeal, type PaymentMethod } from "@/types";
import { useI18n } from "@/lib/i18n";

const MAX_PLEDGE = 999;

/** Pledge a quantity into a business-run bulk-buying campaign, then (if the
 *  business set one) pay the flat deposit that locks the spot in. Nothing
 *  else is charged here — the campaign's own tiered price only gets applied
 *  when the business fulfils the whole pool at close, this is an estimate. */
export default function BulkOrderSheet({
  deal, onOrdered, onClose,
}: { deal: BulkDeal; onOrdered?: () => void; onClose: () => void }) {
  const { showToast, user, isGuest } = useApp();
  const { t, tf } = useI18n();
  const nav = useNavigate();

  const alreadyPledged = (deal.myPledgeQuantity ?? 0) > 0;
  const status = deal.myDepositStatus ?? null;
  const locked = status === "PAID" || status === "PENDING_CONFIRM";
  const needsDeposit = !!deal.depositAmount && !locked;
  // A closed campaign used to open this sheet in its full live pledge form —
  // stepper, tier table, "Pledge N units" — which the server could only ever
  // reject with DEAL_CLOSED, and a "Leave this pledge" button the server now
  // also refuses (20260919). Closed gets its own read-only branch instead.
  const isClosed = !!deal.closedAtISO;
  const outcome = deal.closeOutcome ?? null;
  // A no-deposit campaign's myDepositStatus never becomes PAID/PENDING_CONFIRM
  // (nothing to pay), so `locked` alone always misses the single most common
  // campaign type. Anyone already pledged with no deposit ever owed also gets
  // the status screen instead of the raw pledge form.
  const showStatus = locked || (alreadyPledged && !needsDeposit);
  const statusKind: "NO_DEPOSIT" | "PENDING_CONFIRM" | "PAID" =
    !deal.depositAmount ? "NO_DEPOSIT" : status === "PAID" ? "PAID" : "PENDING_CONFIRM";

  const [view, setView] = useState<"STATUS" | "PLEDGE" | "DEPOSIT">(showStatus ? "STATUS" : "PLEDGE");
  const [qty, setQty] = useState(deal.myPledgeQuantity ?? 1);
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  // Persistent, not a toast: a ~2s auto-dismiss is a bad way to communicate a
  // diagnostic error while troubleshooting a real failure - this stays on
  // screen (with the raw server message, not just the friendly one) until the
  // next attempt, so whatever this fails with is readable and screenshot-able
  // without needing DevTools at all.
  const [errorDetail, setErrorDetail] = useState<{ friendly: string; raw: string } | null>(null);
  // Shown right after a no-deposit pledge succeeds, instead of a toast that
  // auto-dismisses in ~2s and closes the sheet — that was the ONLY path in
  // this sheet with no persistent confirmation at all.
  const [justPledged, setJustPledged] = useState(false);
  // Shown right after claimDeposit succeeds, instead of closing straight away —
  // the deposit is now PENDING_CONFIRM, not PAID, and that gap was previously
  // invisible: the sheet just closed on a toast, with no screen saying how much
  // is pending or how many units it covers.
  const [justPaid, setJustPaid] = useState(false);

  const needsAddress = deal.fulfillmentType === "DOORSTEP";
  // availableQuota is a POOL cap (the card renders it as "N left"), not a
  // per-pledger maximum — and nothing decrements it, pledged_quantity is the
  // running total. So this pledger's ceiling is what's left once everyone
  // ELSE's pledges are accounted for; their own current pledge stays available
  // to them, which is what lets them lower it. Mirrors the server's own check
  // exactly (20260920), so the stepper can't offer a number that gets rejected.
  const othersPledged = Math.max((deal.pledgedQuantity ?? 0) - (deal.myPledgeQuantity ?? 0), 0);
  const remainingQuota = deal.availableQuota != null ? deal.availableQuota - othersPledged : null;
  const soldOut = remainingQuota != null && remainingQuota < 1;
  const maxQty = remainingQuota != null ? Math.max(remainingQuota, 1) : MAX_PLEDGE;
  const preview = calcBulkTotal(deal, qty);

  async function submitPledge() {
    if (needsAddress && !address.trim()) {
      showToast(t("delivery_address_label"));
      return;
    }
    setErrorDetail(null);
    setBusy(true);
    try {
      await bulkService.pledgeJoin(deal.id, qty, notes.trim() || null, needsAddress ? address.trim() : null);
      // The pledge is real the moment this RPC returns, whether or not a
      // deposit step follows — refresh the caller's list now so the feed's
      // "Joined" state is never stale, including when the user backs out of
      // the DEPOSIT step below without paying (previously that path never
      // refetched at all).
      onOrdered?.();
      if (needsDeposit) {
        setView("DEPOSIT");
      } else {
        setJustPledged(true);
      }
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const friendly =
        /DEAL_CLOSED|DEAL_NOT_ACTIVE/.test(msg) ? "This campaign is no longer accepting pledges" :
        /OWNER_CANNOT_PLEDGE/.test(msg) ? "You can't pledge to your own campaign" :
        /DELIVERY_ADDRESS_REQUIRED/.test(msg) ? "Add a delivery address" :
        /INVALID_QUANTITY/.test(msg) ? "Enter a valid quantity" :
        // Someone else took the last units between this sheet opening and the
        // tap landing — the server is authoritative on quota (20260920).
        /INSUFFICIENT_QUOTA/.test(msg) ? t("quota_sold_out") :
        /UNAUTHENTICATED/.test(msg) ? "Sign in to pledge" :
        // A stale PostgREST schema cache reports the RPC as missing rather than
        // failing inside it — distinct enough to be worth its own message, since
        // the fix is on the server (NOTIFY pgrst, 'reload schema'), not the input.
        /schema cache|Could not find the function/i.test(msg) ? "Bulk buying isn't available yet — the server needs a refresh" :
        (msg || "Couldn't submit your pledge — try again");
      showToast(friendly);
      setErrorDetail({ friendly, raw: msg || "(no message on the error object)" });
    } finally {
      setBusy(false);
    }
  }

  async function payDeposit(method: PaymentMethod, reference: string | null) {
    setErrorDetail(null);
    setBusy(true);
    try {
      await bulkService.claimDeposit(deal.id, method, reference);
      showToast(t("deposit_submitted_toast"));
      onOrdered?.(); // refresh the list now, so the NEXT open already shows PENDING_CONFIRM
      setJustPaid(true);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const friendly = msg || "Couldn't submit your deposit — try again";
      showToast(friendly);
      setErrorDetail({ friendly, raw: msg || "(no message on the error object)" });
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await bulkService.pledgeLeave(deal.id);
      showToast(t("left_pledge_toast"));
      onOrdered?.();
      onClose();
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      // The server refuses this once a campaign has closed (20260919) — say so
      // in plain words rather than surfacing the raw DEAL_CLOSED code.
      const friendly = /DEAL_CLOSED/.test(msg)
        ? "This campaign has closed — your pledge is now part of its record and can't be withdrawn."
        : (msg || "Couldn't leave — try again");
      showToast(friendly);
      setErrorDetail({ friendly, raw: msg || "(no message on the error object)" });
    } finally {
      setBusy(false);
    }
  }

  // Previously there was no way to reach the business from anywhere in this
  // flow — which bites hardest exactly where something has gone wrong: a
  // rejected deposit, or a REFUNDED campaign whose own copy says to settle
  // "directly with the business" while offering no route to them.
  const canContactBusiness = !isGuest && !!deal.ownerUserId && deal.ownerUserId !== user.id;
  const showContact = canContactBusiness && (isClosed || alreadyPledged || status === "REJECTED");

  async function contactBusiness() {
    if (!deal.ownerUserId) { showToast("Owner info unavailable"); return; }
    try {
      const conv = await chatService.getOrCreate(deal.ownerUserId, {
        type: "business",
        id: deal.businessId,
        name: deal.businessName || "the business",
        avatar: deal.businessCover || deal.image || "",
        ownerUserId: deal.ownerUserId,
      });
      onClose();
      nav(`/chat/${conv.id}`);
    } catch (e: any) {
      showToast(e?.message || "Couldn't open chat. Try again.");
    }
  }

  const pledgeLabel = qty === 1 ? tf("pledge_units_one", { n: qty }) : tf("pledge_units_other", { n: qty });

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", animation: "fadeIn .2s" }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "var(--surface)", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 20px calc(20px + var(--safe-area-bottom))", maxHeight: "92vh", overflowY: "auto", animation: "slideUp .25s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between center-v" style={{ marginBottom: "var(--space-md)" }}>
          <div style={{ minWidth: 0 }}>
            <div className="bold" style={{ fontSize: 18 }}>
              {isClosed
                ? (outcome === "FULFILLED" ? t("campaign_fulfilled") : outcome === "REFUNDED" ? t("campaign_refunded") : t("campaign_awaiting_decision"))
                : view === "DEPOSIT" ? t("pay_deposit_title") : alreadyPledged ? t("update_your_pledge") : t("campaign_pledge_title")}
            </div>
            <div className="tiny muted ellipsis" style={{ marginTop: 2 }}>{deal.title}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {errorDetail && (
          <div
            className="col gap-4"
            style={{ padding: 12, marginBottom: "var(--space-md)", background: "var(--red-50)", border: "1px solid var(--red-500)", borderRadius: 10 }}
          >
            <div className="row between center-v">
              <span className="tiny semi" style={{ color: "var(--red-700)" }}>{errorDetail.friendly}</span>
              <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setErrorDetail(null)} aria-label="Dismiss error">
                <X size={14} />
              </button>
            </div>
            {/* Raw server message, kept verbatim — this is what makes a failed
                attempt screenshot-able and diagnosable without opening DevTools. */}
            <div className="tiny" style={{ color: "var(--red-700)", opacity: 0.8, fontFamily: "monospace", wordBreak: "break-word" }}>
              {errorDetail.raw}
            </div>
          </div>
        )}

        {isClosed ? (
          <div className="col gap-14">
            <div
              className="card row gap-10 center-v"
              style={{
                padding: 14,
                background: outcome === "FULFILLED" ? "var(--green-100)" : outcome === "REFUNDED" ? "var(--ink-50)" : "var(--amber-50)",
                border: `1px solid ${outcome === "FULFILLED" ? "var(--green-500)" : outcome === "REFUNDED" ? "var(--ink-200)" : "var(--amber-500)"}`,
              }}
            >
              {outcome === "FULFILLED"
                ? <CheckCircle2 size={20} color="var(--green-600)" style={{ flexShrink: 0 }} />
                : <Clock size={20} color={outcome === "REFUNDED" ? "var(--ink-500)" : "var(--amber-700)"} style={{ flexShrink: 0 }} />}
              <div
                className="tiny"
                style={{ lineHeight: 1.5, color: outcome === "FULFILLED" ? "var(--green-700)" : outcome === "REFUNDED" ? "var(--ink-600)" : "var(--amber-800)" }}
              >
                {!alreadyPledged
                  ? t("campaign_closed_generic_note")
                  : outcome === "FULFILLED"
                  ? (status === "PAID" ? t("campaign_fulfilled_note") : t("campaign_fulfilled_no_pass_note"))
                  : outcome === "REFUNDED"
                  ? t("campaign_refunded_note")
                  : t("campaign_awaiting_decision_note")}
              </div>
            </div>

            {alreadyPledged && (
              <div className="card col gap-8" style={{ padding: 14 }}>
                <div className="row between center-v">
                  <span className="tiny muted">{tf("you_pledged_n_units", { n: deal.myPledgeQuantity ?? 0 })}</span>
                  <span className="bold">{deal.myPledgeQuantity ?? 0}</span>
                </div>
                {deal.depositAmount != null && (
                  <div className="row between center-v">
                    <span className="tiny muted">{t("deposit")}</span>
                    <span className="tiny semi">
                      {inr(deal.depositAmount)}
                      {status === "PAID" ? ` · ${t("locked_in_short")}` : status === "PENDING_CONFIRM" ? ` · ${t("deposit_pending_short")}` : ""}
                    </span>
                  </div>
                )}
              </div>
            )}

            <button className="btn btn-primary btn-block" style={{ height: 48, fontSize: 15, fontWeight: 700 }} onClick={onClose}>
              {t("close_word")}
            </button>
          </div>
        ) : justPaid ? (
          <div className="col gap-14">
            <div className="card row gap-10 center-v" style={{ padding: 14, background: "var(--amber-50)", border: "1px solid var(--amber-500)" }}>
              <Clock size={20} color="var(--amber-700)" style={{ flexShrink: 0 }} />
              <div className="tiny" style={{ lineHeight: 1.5, color: "var(--amber-800)" }}>{t("deposit_pending_confirm_note")}</div>
            </div>
            <div className="card col gap-8" style={{ padding: 14 }}>
              <div className="row between center-v">
                <span className="tiny muted">{tf("pledge_units_other", { n: qty })}</span>
                <span className="tiny semi">{qty}</span>
              </div>
              <div className="row between center-v">
                <span className="tiny muted">{t("deposit")}</span>
                <span className="bold">{inr(deal.depositAmount ?? 0)}</span>
              </div>
            </div>
            <button className="btn btn-primary btn-block" style={{ height: 48, fontSize: 15, fontWeight: 700 }} onClick={onClose}>
              {t("close_word")}
            </button>
          </div>
        ) : justPledged ? (
          <div className="col gap-14">
            <div className="card row gap-10 center-v" style={{ padding: 14, background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
              <CheckCircle2 size={20} color="var(--green-600)" style={{ flexShrink: 0 }} />
              <div className="tiny" style={{ lineHeight: 1.5, color: "var(--green-700)" }}>{t("pledge_confirmed_note")}</div>
            </div>
            <div className="card col gap-8" style={{ padding: 14 }}>
              <div className="row between center-v">
                <span className="tiny muted">{tf("pledge_units_other", { n: qty })}</span>
                <span className="bold">{qty}</span>
              </div>
              {deal.closesAtISO && (
                <div className="tiny muted">{tf("closes_on_badge", { date: new Date(deal.closesAtISO).toLocaleDateString() })}</div>
              )}
            </div>
            <button className="btn btn-primary btn-block" style={{ height: 48, fontSize: 15, fontWeight: 700 }} onClick={onClose}>
              {t("close_word")}
            </button>
          </div>
        ) : view === "STATUS" && (
          <div className="col gap-14">
            <div
              className="card row gap-10 center-v"
              style={{
                padding: 14,
                background: statusKind === "PENDING_CONFIRM" ? "var(--amber-50)" : "var(--green-100)",
                border: `1px solid ${statusKind === "PENDING_CONFIRM" ? "var(--amber-500)" : "var(--green-500)"}`,
              }}
            >
              {statusKind === "PENDING_CONFIRM" ? <Clock size={20} color="var(--amber-700)" /> : <CheckCircle2 size={20} color="var(--green-600)" />}
              <div className="tiny" style={{ lineHeight: 1.5, color: statusKind === "PENDING_CONFIRM" ? "var(--amber-800)" : "var(--green-700)" }}>
                {statusKind === "PENDING_CONFIRM" ? t("deposit_pending_confirm_note") : statusKind === "PAID" ? t("deposit_confirmed_note") : t("pledge_confirmed_note")}
              </div>
            </div>

            <div className="card col gap-8" style={{ padding: 12 }}>
              <div className="row between center-v">
                <span className="tiny muted">{tf("pledge_units_other", { n: deal.myPledgeQuantity ?? 0 })}</span>
                <span className="bold">{deal.myPledgeQuantity ?? 0}</span>
              </div>
              {deal.depositAmount ? (
                <div className="row between center-v">
                  <span className="tiny muted">{t("deposit")}</span>
                  <span className="bold">{inr(deal.depositAmount)}</span>
                </div>
              ) : deal.closesAtISO && (
                <div className="tiny muted">{tf("closes_on_badge", { date: new Date(deal.closesAtISO).toLocaleDateString() })}</div>
              )}
            </div>

            <button className="btn btn-outline btn-block" onClick={() => setView("PLEDGE")}>{t("update_pledge_btn")}</button>

            <div className="col gap-6">
              <div className="tiny muted">{statusKind === "NO_DEPOSIT" ? t("leave_pledge_note") : t("leave_forfeits_deposit_note")}</div>
              <button className="btn btn-block btn-sm" style={{ background: "none", color: "var(--red-600)" }} disabled={busy} onClick={leave}>
                {t("leave_this_pledge")}
              </button>
            </div>
          </div>
        )}

        {!isClosed && !justPaid && !justPledged && view === "PLEDGE" && (
          <>
            {(deal.description || deal.closesAtISO) && (
              <div className="col gap-6" style={{ marginBottom: "var(--space-md)" }}>
                {deal.description && (
                  <div className="tiny muted" style={{ lineHeight: 1.5 }}>{deal.description}</div>
                )}
                {deal.closesAtISO && (
                  <div className="row gap-6 center-v tiny semi" style={{ color: "var(--brand-700)" }}>
                    <Clock size={12} /> Closes {new Date(deal.closesAtISO).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            <div className="col gap-6" style={{ marginBottom: "var(--space-md)" }}>
              <label className="tiny semi muted">{t("how_many_units_need")}</label>
              {alreadyPledged && (
                <div className="tiny muted">{tf("you_previously_pledged", { n: deal.myPledgeQuantity ?? 0 })}</div>
              )}
              <div className="row gap-12 center-v">
                <button
                  className="icon-btn"
                  style={{ width: 44, height: 44, background: "var(--ink-50)" }}
                  disabled={qty <= 1}
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Decrease"
                ><Minus size={18} /></button>
                <div className="bold" style={{ fontSize: 30, minWidth: 64, textAlign: "center" }}>{qty}</div>
                <button
                  className="icon-btn"
                  style={{ width: 44, height: 44, background: "var(--ink-50)" }}
                  disabled={qty >= maxQty}
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  aria-label="Increase"
                ><Plus size={18} /></button>
              </div>
            </div>

            {deal.tiers.length > 0 && (
              <div className="col gap-4" style={{ padding: "10px 12px", background: "var(--ink-50)", borderRadius: 10, marginBottom: "var(--space-md)" }}>
                {deal.tiers.map((tier) => {
                  const active = qty >= tier.minQty;
                  return (
                    <div key={tier.minQty} className="row between tiny">
                      <span className={active ? "semi" : "muted"} style={active ? { color: "var(--green-600)" } : undefined}>
                        {active ? "✓ " : ""}{tf("n_plus_units", { n: tier.minQty })}
                      </span>
                      <span className={active ? "semi" : "muted"}>{tf("price_each", { price: inr(tier.unitPrice) })}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="card col gap-6" style={{ padding: 14, marginBottom: "var(--space-md)", background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
              <div className="tiny muted">{t("your_estimated_total")}</div>
              <div className="row between center-v">
                <span className="tiny muted">{tf("qty_times_price", { qty, price: inr(preview.unitPrice) })}</span>
                <span className="bold" style={{ fontSize: 20, color: "var(--green-600)" }}>{inr(preview.total)}</span>
              </div>
              {preview.saved > 0 && (
                <div className="row between tiny">
                  <span className="muted" style={{ textDecoration: "line-through" }}>{inr(preview.regularTotal)}</span>
                  <span className="semi" style={{ color: "var(--green-600)" }}>{tf("you_save_price", { price: inr(preview.saved) })}</span>
                </div>
              )}
            </div>

            {deal.fulfillmentType && (
              <div className="row between center-v" style={{ marginBottom: "var(--space-md)" }}>
                <span className="tiny semi muted">{t("fulfilment_method_label")}</span>
                <span className="badge badge-gray" style={{ fontSize: 10 }}>{FULFILLMENT_LABELS[deal.fulfillmentType]}</span>
              </div>
            )}

            {needsAddress && (
              <div style={{ marginBottom: "var(--space-md)" }}>
                <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("delivery_address_label")}</label>
                <input
                  className="input"
                  placeholder={t("flat_street_landmark_placeholder")}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  maxLength={400}
                />
                <div className="tiny muted" style={{ marginTop: 4 }}>{t("shared_with_provider_on_close")}</div>
              </div>
            )}

            <div style={{ marginBottom: "var(--space-md)" }}>
              <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("notes_for_business_optional")}</label>
              <input
                className="input"
                placeholder={t("notes_business_placeholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={300}
              />
            </div>

            <div className="tiny muted" style={{ marginBottom: "var(--space-md)", lineHeight: 1.5 }}>
              {deal.depositAmount
                ? (status === "REJECTED" ? t("deposit_rejected_note") : tf("deposit_required_note", { amount: inr(deal.depositAmount) }))
                : t("no_deposit_required_note")}
            </div>

            {/* Every unit is spoken for and this viewer holds none of them —
                offering a pledge button here would be another guaranteed
                server rejection, so say so instead. */}
            {soldOut && !alreadyPledged && (
              <div className="tiny semi" style={{ marginBottom: 8, color: "var(--red-600)" }}>{t("quota_sold_out")}</div>
            )}
            <button
              className="btn btn-primary btn-block"
              style={{ height: 48, fontSize: 15, fontWeight: 700 }}
              disabled={busy || (soldOut && !alreadyPledged)}
              onClick={submitPledge}
            >
              {busy ? t("saving_ellipsis") : alreadyPledged ? t("update_pledge_btn") : pledgeLabel}
            </button>

            {alreadyPledged && (
              <button
                className="btn btn-block btn-sm"
                style={{ marginTop: 8, background: "none", color: "var(--red-600)" }}
                disabled={busy}
                onClick={leave}
              >
                {t("leave_this_pledge")}
              </button>
            )}
          </>
        )}

        {!isClosed && !justPaid && !justPledged && view === "DEPOSIT" && (
          <>
            {/* Persistent, not tied to closing without paying — true the whole
                time this view is up, so a customer who backs out via the
                header X still knows what actually happened: the pledge is
                real, only the deposit is still outstanding. */}
            <div className="card row gap-10 center-v" style={{ padding: 12, marginBottom: "var(--space-md)", background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
              <CheckCircle2 size={18} color="var(--green-600)" style={{ flexShrink: 0 }} />
              <div className="tiny" style={{ lineHeight: 1.5, color: "var(--green-700)" }}>{t("pledged_pay_anytime_note")}</div>
            </div>
            <div className="card row between center-v" style={{ padding: 14, marginBottom: "var(--space-md)", background: "var(--ink-50)" }}>
              <span className="tiny semi muted">{t("deposit")}</span>
              <span className="bold" style={{ fontSize: 18 }}>{inr(deal.depositAmount ?? 0)}</span>
            </div>
            <PaymentMethodPanel
              businessUpiId={deal.businessUpiId}
              businessName={deal.businessName || "the business"}
              amount={deal.depositAmount ?? 0}
              txnNote={`Bulk deal deposit · ${deal.title}`}
              cashTitle="Pay on collection"
              cashBody="Confirm your pledge now and settle the deposit when you next visit. The business verifies before it counts as paid."
              claiming={busy}
              onSubmit={payDeposit}
            />
          </>
        )}

        {showContact && (
          <button
            className="btn btn-block btn-sm row gap-8 center"
            style={{ marginTop: 10, background: "none", color: "var(--brand-700)" }}
            onClick={contactBusiness}
          >
            <MessageCircle size={15} /> {t("message_the_business")}
          </button>
        )}

        <div style={{ height: "var(--space-xs)" }} />
      </div>
    </div>
  );
}
