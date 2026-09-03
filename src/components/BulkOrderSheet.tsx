import { useState } from "react";
import { X, Minus, Plus, CheckCircle2, Clock } from "@/components/Icons";
import { inr } from "@/components/common";
import { bulkService } from "@/services";
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
  const { showToast } = useApp();
  const { t, tf } = useI18n();

  const alreadyPledged = (deal.myPledgeQuantity ?? 0) > 0;
  const status = deal.myDepositStatus ?? null;
  const locked = status === "PAID" || status === "PENDING_CONFIRM";
  const needsDeposit = !!deal.depositAmount && !locked;

  const [view, setView] = useState<"STATUS" | "PLEDGE" | "DEPOSIT">(locked ? "STATUS" : "PLEDGE");
  const [qty, setQty] = useState(deal.myPledgeQuantity ?? 1);
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const needsAddress = deal.fulfillmentType === "DOORSTEP";
  const maxQty = deal.availableQuota ?? MAX_PLEDGE;
  const preview = calcBulkTotal(deal, qty);

  async function submitPledge() {
    if (needsAddress && !address.trim()) {
      showToast(t("delivery_address_label"));
      return;
    }
    setBusy(true);
    try {
      await bulkService.pledgeJoin(deal.id, qty, notes.trim() || null, needsAddress ? address.trim() : null);
      if (needsDeposit) {
        setView("DEPOSIT");
      } else {
        showToast(t("pledge_submitted_toast"));
        onOrdered?.();
        onClose();
      }
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/DEAL_CLOSED|DEAL_NOT_ACTIVE/.test(msg)) showToast("This campaign is no longer accepting pledges");
      else if (/OWNER_CANNOT_PLEDGE/.test(msg)) showToast("You can't pledge to your own campaign");
      else if (/DELIVERY_ADDRESS_REQUIRED/.test(msg)) showToast("Add a delivery address");
      else if (/INVALID_QUANTITY/.test(msg)) showToast("Enter a valid quantity");
      else showToast(msg || "Couldn't submit your pledge — try again");
    } finally {
      setBusy(false);
    }
  }

  async function payDeposit(method: PaymentMethod, reference: string | null) {
    setBusy(true);
    try {
      await bulkService.claimDeposit(deal.id, method, reference);
      showToast(t("deposit_submitted_toast"));
      onOrdered?.();
      onClose();
    } catch (e: any) {
      showToast(e?.message || "Couldn't submit your deposit — try again");
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
      showToast(e?.message || "Couldn't leave — try again");
    } finally {
      setBusy(false);
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
              {view === "DEPOSIT" ? t("pay_deposit_title") : alreadyPledged ? t("update_your_pledge") : t("campaign_pledge_title")}
            </div>
            <div className="tiny muted ellipsis" style={{ marginTop: 2 }}>{deal.title}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {view === "STATUS" && (
          <div className="col gap-14">
            <div
              className="card row gap-10 center-v"
              style={{ padding: 14, background: status === "PAID" ? "var(--green-100)" : "var(--amber-50)", border: `1px solid ${status === "PAID" ? "var(--green-500)" : "var(--amber-500)"}` }}
            >
              {status === "PAID" ? <CheckCircle2 size={20} color="var(--green-600)" /> : <Clock size={20} color="var(--amber-700)" />}
              <div className="tiny" style={{ lineHeight: 1.5, color: status === "PAID" ? "var(--green-700)" : "var(--amber-800)" }}>
                {status === "PAID" ? t("deposit_confirmed_note") : t("deposit_pending_confirm_note")}
              </div>
            </div>

            <div className="card row between center-v" style={{ padding: 12 }}>
              <span className="tiny muted">{tf("pledge_units_other", { n: deal.myPledgeQuantity ?? 0 })}</span>
              <span className="bold">{inr(deal.depositAmount ?? 0)}</span>
            </div>

            <button className="btn btn-outline btn-block" onClick={() => setView("PLEDGE")}>{t("update_pledge_btn")}</button>

            <div className="col gap-6">
              <div className="tiny muted">{t("leave_forfeits_deposit_note")}</div>
              <button className="btn btn-block btn-sm" style={{ background: "none", color: "var(--red-600)" }} disabled={busy} onClick={leave}>
                {t("leave_this_pledge")}
              </button>
            </div>
          </div>
        )}

        {view === "PLEDGE" && (
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

            <button className="btn btn-primary btn-block" style={{ height: 48, fontSize: 15, fontWeight: 700 }} disabled={busy} onClick={submitPledge}>
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

        {view === "DEPOSIT" && (
          <>
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

        <div style={{ height: "var(--space-xs)" }} />
      </div>
    </div>
  );
}
