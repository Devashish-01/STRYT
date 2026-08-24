import { useState } from "react";
import { X } from "@/components/Icons";
import { customPaymentService } from "@/services";
import { useApp } from "@/store";
import { PaymentMethodPanel } from "@/components/PaymentMethodPanel";
import type { PaymentMethod } from "@/types";

interface CustomPaySheetProps {
  targetType: "BUSINESS" | "PROVIDER";
  targetId: string;
  targetName: string;
  targetUpiId?: string | null;
  onPaid: () => void;
  onClose: () => void;
}

// "Pay any amount" — no prior appointment/queue/deal relationship needed.
// Amount is always freeform (there's no catalog/booking price to default
// from), same as QueuePaymentSheet; unlike that one, this also lets the payer
// leave a short note for what the payment is for, since there's no booking
// context to imply it.
export function CustomPaySheet({ targetType, targetId, targetName, targetUpiId, onPaid, onClose }: CustomPaySheetProps) {
  const { showToast } = useApp();
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState("");
  const [claiming, setClaiming] = useState(false);

  const numAmount = parseFloat(amount) || null;

  async function claim(method: PaymentMethod, reference: string | null) {
    if (!numAmount || numAmount <= 0) {
      showToast("Enter an amount first");
      return;
    }
    setClaiming(true);
    try {
      await customPaymentService.create(targetType, targetId, numAmount, method, note.trim() || null, reference);
      showToast("Payment claim sent — waiting for confirmation");
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
        <div className="row between center-v" style={{ marginBottom: "var(--space-md)" }}>
          <div>
            <div className="bold" style={{ fontSize: 18 }}>Pay {targetName}</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>Any amount, no booking needed</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div style={{ marginBottom: "var(--space-sm)" }}>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Amount (₹)</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>

        <div style={{ marginBottom: "var(--space-md)" }}>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>What's this for? (optional)</label>
          <input
            className="input"
            placeholder="e.g. Extra service, tip, deposit"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
          />
        </div>

        <PaymentMethodPanel
          businessUpiId={targetUpiId}
          businessName={targetName}
          amount={numAmount}
          txnNote={note.trim() || "STRYT payment"}
          cashTitle="Pay in cash"
          claiming={claiming}
          onSubmit={claim}
        />

        <div style={{ height: "var(--space-xs)" }} />
      </div>
    </div>
  );
}
