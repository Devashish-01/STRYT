import { useState } from "react";
import { X } from "@/components/Icons";
import { businessService } from "@/services";
import { useApp } from "@/store";
import { PaymentMethodPanel } from "@/components/PaymentMethodPanel";
import type { PaymentMethod } from "@/types";

interface QueuePaymentSheetProps {
  tokenId: string;
  businessName: string;
  businessUpiId?: string | null;
  onPaid: () => void;
  onClose: () => void;
}

// Payment claim sheet for a live-queue token. Unlike appointments/agreements,
// a queue token has no catalog or proposal price at join time, so the amount
// is always entered freeform by the customer.
export function QueuePaymentSheet({ tokenId, businessName, businessUpiId, onPaid, onClose }: QueuePaymentSheetProps) {
  const { showToast } = useApp();
  const [amount, setAmount] = useState<string>("");
  const [claiming, setClaiming] = useState(false);

  const numAmount = parseFloat(amount) || null;

  async function claim(method: PaymentMethod, reference: string | null) {
    setClaiming(true);
    try {
      await businessService.claimQueuePayment(tokenId, method, numAmount, reference);
      showToast("Payment claim sent — waiting for business to confirm");
      onPaid();
      onClose();
    } catch (e: any) {
      showToast(e?.message ? `Couldn't record payment: ${e.message}` : "Couldn't record payment. Try again.");
    } finally {
      setClaiming(false);
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
        {/* Header */}
        <div className="row between center-v" style={{ marginBottom: 16 }}>
          <div>
            <div className="bold" style={{ fontSize: 18 }}>Pay for your visit</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{businessName}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Amount — always freeform, no catalog price on a queue token */}
        <div style={{ marginBottom: 16 }}>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Amount (₹)</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>

        <PaymentMethodPanel
          businessUpiId={businessUpiId}
          businessName={businessName}
          amount={numAmount}
          txnNote="Queue service"
          cashTitle="Pay in cash"
          claiming={claiming}
          onSubmit={claim}
        />

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
