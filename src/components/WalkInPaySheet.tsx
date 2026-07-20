import { useState } from "react";
import { X, Plus, Minus } from "@/components/Icons";
import { SafeImg, inr } from "@/components/common";
import { appointmentService } from "@/services";
import { useApp } from "@/store";
import { PaymentMethodPanel } from "@/components/PaymentMethodPanel";
import type { CatalogItem, PaymentMethod } from "@/types";

interface WalkInPaySheetProps {
  targetId: string;
  businessName: string;
  businessUpiId?: string | null;
  catalog: CatalogItem[];
  /** Seeded from BusinessDetail's own cart state when the customer already
   *  had items picked (e.g. from the catalog tab) before tapping "Pay now". */
  initialCart: Record<string, number>;
  onPaid: () => void;
  onClose: () => void;
}

/** Always-visible walk-in payment: pick catalog item(s) + quantity, amount is
 *  computed from price × quantity, then pay via the same UPI/Cash flow as
 *  every other claim in the app (PaymentMethodPanel). No prior booking/queue
 *  relationship required — this is exactly the gap that used to leave a pure
 *  walk-in customer with no payment entry point at all on the business page. */
export function WalkInPaySheet({ targetId, businessName, businessUpiId, catalog, initialCart, onPaid, onClose }: WalkInPaySheetProps) {
  const { showToast } = useApp();
  const [cart, setCart] = useState<Record<string, number>>(initialCart);
  const [claiming, setClaiming] = useState(false);

  function add(itemId: string, delta: number) {
    setCart((c) => {
      const next = Math.max(0, (c[itemId] ?? 0) + delta);
      const copy = { ...c };
      if (next === 0) delete copy[itemId];
      else copy[itemId] = next;
      return copy;
    });
  }

  const lines = Object.entries(cart)
    .map(([itemId, qty]) => {
      const item = catalog.find((c) => c.id === itemId);
      return item ? { item, qty } : null;
    })
    .filter((l): l is { item: CatalogItem; qty: number } => !!l);
  const total = lines.reduce((sum, l) => sum + (l.item.salePrice ?? l.item.price) * l.qty, 0);
  const packageName = lines.length === 1 ? `${lines[0].item.name} x${lines[0].qty}` : `${lines.length} items`;

  async function claim(method: PaymentMethod, reference: string | null) {
    if (total <= 0) return;
    setClaiming(true);
    try {
      await appointmentService.createWalkInPayment({
        targetId, packageName, packagePrice: total, method, reference,
        items: lines.map((l) => ({
          catalogItemId: l.item.id,
          name: l.item.name,
          price: l.item.salePrice ?? l.item.price,
          quantity: l.qty,
        })),
      });
      showToast("Payment claim sent — waiting for the shop to confirm");
      onPaid();
      onClose();
    } catch (e: any) {
      showToast(e?.message || "Couldn't record payment. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  const availableItems = catalog.filter((c) => c.stockStatus !== "OUT_OF_STOCK");

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", animation: "fadeIn .2s" }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 20px calc(20px + var(--safe-area-bottom))", maxHeight: "92vh", overflowY: "auto", animation: "slideUp .25s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="row between center-v" style={{ marginBottom: 16 }}>
          <div>
            <div className="bold" style={{ fontSize: 18 }}>Pay now</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{businessName}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Item picker */}
        <div className="col gap-8" style={{ marginBottom: 16 }}>
          <label className="tiny semi muted">What are you paying for?</label>
          {availableItems.map((item) => {
            const qty = cart[item.id] ?? 0;
            return (
              <div key={item.id} className="card row gap-10 center-v" style={{ padding: 10 }}>
                <SafeImg src={item.image} variant="photo" style={{ width: 36, height: 36, borderRadius: 8 }} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="semi small ellipsis">{item.name}</div>
                  <div className="tiny muted">{inr(item.salePrice ?? item.price)}</div>
                </div>
                <div className="row center-v" style={{ background: "var(--ink-50)", borderRadius: 10 }}>
                  <button style={{ padding: "6px 10px", color: qty === 0 ? "var(--ink-300)" : "var(--brand-700)" }} disabled={qty === 0} onClick={() => add(item.id, -1)} aria-label="Fewer"><Minus size={13} /></button>
                  <span className="bold small" style={{ minWidth: 18, textAlign: "center" }}>{qty}</span>
                  <button style={{ padding: "6px 10px", color: "var(--brand-700)" }} onClick={() => add(item.id, 1)} aria-label="More"><Plus size={13} /></button>
                </div>
              </div>
            );
          })}
          {availableItems.length === 0 && (
            <div className="tiny muted">No items available to select right now.</div>
          )}
        </div>

        {lines.length > 0 && (
          <>
            <div className="row between center-v" style={{ marginBottom: 16, padding: "10px 14px", background: "var(--brand-50)", borderRadius: 12 }}>
              <span className="semi small">Total</span>
              <span className="bold" style={{ fontSize: 20, color: "var(--brand-700)" }}>{inr(total)}</span>
            </div>

            <PaymentMethodPanel
              businessUpiId={businessUpiId}
              businessName={businessName}
              amount={total}
              txnNote="Purchase"
              cashTitle="Pay in cash at the counter"
              cashBody="Hand over the cash, then tap below. The shop confirms they received it before it counts as paid."
              claiming={claiming}
              onSubmit={claim}
            />
          </>
        )}

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
