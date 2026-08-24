import { useEffect, useState } from "react";
import { X, Minus, Plus, AlertCircle } from "@/components/Icons";
import { inr } from "@/components/common";
import { bulkService } from "@/services";
import { useApp } from "@/store";
import { PaymentMethodPanel } from "@/components/PaymentMethodPanel";
import { FULFILLMENT_LABELS, calcBulkTotal, type BulkDeal, type BulkQuote, type FulfillmentType, type PaymentMethod } from "@/types";

/** Fulfillment choices a business bulk deal actually supports. A group-buy-only
 *  mode like ON_SITE_CAMP has no meaning for a single buyer's order. */
const ORDER_FULFILLMENT: FulfillmentType[] = ["STORE_PICKUP", "DOORSTEP"];

export default function BulkOrderSheet({
  deal, onOrdered, onClose,
}: { deal: BulkDeal; onOrdered?: () => void; onClose: () => void }) {
  const { showToast } = useApp();
  const [qty, setQty] = useState(deal.moq);
  const [fulfillment, setFulfillment] = useState<FulfillmentType>("STORE_PICKUP");
  const [address, setAddress] = useState("");
  const [placing, setPlacing] = useState(false);
  // Seeded with the local calculation so the sheet never opens blank, then
  // replaced by the server's own number — the two use identical tier logic,
  // this just guarantees the displayed figure is the one that'll be charged.
  const [quote, setQuote] = useState<BulkQuote>(() => {
    const local = calcBulkTotal(deal, deal.moq);
    return { ...local, meetsMoq: true, quotaOk: true };
  });

  useEffect(() => {
    let active = true;
    bulkService
      .quote(deal.id, qty)
      .then((q) => { if (active) setQuote(q); })
      .catch(() => { /* keep the local estimate; checkout still validates */ });
    return () => { active = false; };
  }, [deal.id, qty]);

  const maxQty = deal.availableQuota ?? 9999;
  const blocked = !quote.meetsMoq || !quote.quotaOk;

  async function place(method: PaymentMethod, reference: string | null) {
    if (fulfillment === "DOORSTEP" && !address.trim()) {
      showToast("Add a delivery address");
      return;
    }
    setPlacing(true);
    try {
      await bulkService.order(deal.id, qty, method, {
        reference,
        fulfillment,
        address: fulfillment === "DOORSTEP" ? address.trim() : null,
      });
      showToast("Bulk order placed — the business will confirm");
      onOrdered?.();
      onClose();
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/INSUFFICIENT_QUOTA/.test(msg)) showToast("Not enough stock left for that quantity");
      else if (/BELOW_MOQ/.test(msg)) showToast(`Minimum order is ${deal.moq}`);
      else if (/OWNER_CANNOT_SELF_BUY/.test(msg)) showToast("You can't order your own deal");
      else if (/DEAL_INACTIVE/.test(msg)) showToast("This deal is no longer available");
      else showToast(msg || "Couldn't place the order — try again");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", animation: "fadeIn .2s" }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 20px calc(20px + var(--safe-area-bottom))", maxHeight: "92vh", overflowY: "auto", animation: "slideUp .25s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between center-v" style={{ marginBottom: "var(--space-md)" }}>
          <div style={{ minWidth: 0 }}>
            <div className="bold" style={{ fontSize: 18 }}>Order in bulk</div>
            <div className="tiny muted ellipsis" style={{ marginTop: 2 }}>{deal.title}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Quantity */}
        <div className="col gap-6" style={{ marginBottom: "var(--space-md)" }}>
          <label className="tiny semi muted">Quantity <span style={{ fontWeight: 400 }}>(min {deal.moq}{deal.availableQuota != null ? `, ${deal.availableQuota} left` : ""})</span></label>
          <div className="row gap-12 center-v">
            <button
              className="icon-btn"
              style={{ width: 44, height: 44, background: "var(--ink-50)" }}
              disabled={qty <= deal.moq}
              onClick={() => setQty((q) => Math.max(deal.moq, q - 1))}
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

        {/* Tier table — shows what the next break would save, so the jump is
            discoverable rather than something you'd only find by fiddling. */}
        {deal.tiers.length > 0 && (
          <div className="col gap-4" style={{ padding: "10px 12px", background: "var(--ink-50)", borderRadius: 10, marginBottom: "var(--space-md)" }}>
            {deal.tiers.map((tier) => {
              const active = qty >= tier.minQty;
              return (
                <div key={tier.minQty} className="row between tiny">
                  <span className={active ? "semi" : "muted"} style={active ? { color: "var(--green-600)" } : undefined}>
                    {active ? "✓ " : ""}{tier.minQty}+ units
                  </span>
                  <span className={active ? "semi" : "muted"}>{inr(tier.unitPrice)} each</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Live total */}
        <div className="card col gap-6" style={{ padding: 14, marginBottom: "var(--space-md)", background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
          <div className="row between center-v">
            <span className="tiny muted">{qty} × {inr(quote.unitPrice)}</span>
            <span className="bold" style={{ fontSize: 20, color: "var(--green-600)" }}>{inr(quote.total)}</span>
          </div>
          {quote.saved > 0 && (
            <div className="row between tiny">
              <span className="muted" style={{ textDecoration: "line-through" }}>{inr(quote.regularTotal)}</span>
              <span className="semi" style={{ color: "var(--green-600)" }}>You save {inr(quote.saved)}</span>
            </div>
          )}
        </div>

        {blocked && (
          <div className="card row gap-10" style={{ padding: 12, marginBottom: "var(--space-md)", background: "var(--red-50)", border: "1px solid var(--red-100)" }}>
            <AlertCircle size={16} color="var(--red-600)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div className="tiny" style={{ color: "var(--red-700)", lineHeight: 1.5 }}>
              {!quote.meetsMoq ? `Minimum order for this deal is ${deal.moq} units.` : "Not enough stock left for that quantity."}
            </div>
          </div>
        )}

        {/* Fulfillment */}
        <div style={{ marginBottom: "var(--space-md)" }}>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>How do you want it?</label>
          <div className="row gap-8">
            {ORDER_FULFILLMENT.map((ft) => (
              <button
                key={ft}
                className="chip"
                style={fulfillment === ft ? { background: "var(--brand-100)", color: "var(--brand-700)", border: "1.5px solid var(--brand-300)" } : undefined}
                onClick={() => setFulfillment(ft)}
              >
                {FULFILLMENT_LABELS[ft]}
              </button>
            ))}
          </div>
          {fulfillment === "DOORSTEP" && (
            <input
              className="input"
              style={{ marginTop: 8 }}
              placeholder="Delivery address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={400}
            />
          )}
        </div>

        {!blocked && (
          <PaymentMethodPanel
            businessUpiId={deal.businessUpiId}
            businessName={deal.businessName || "the business"}
            amount={quote.total}
            txnNote={`Bulk order · ${deal.title}`}
            cashTitle="Pay on collection"
            cashBody="Confirm the order now and settle when you collect. The business verifies before it counts as paid."
            claiming={placing}
            onSubmit={place}
          />
        )}

        <div style={{ height: "var(--space-xs)" }} />
      </div>
    </div>
  );
}
