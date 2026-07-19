import { useState } from "react";
import { X } from "@/components/Icons";
import { appointmentService } from "@/services/engagement/appointmentService";
import { useApp } from "@/store";
import { PaymentMethodPanel } from "@/components/PaymentMethodPanel";
import type { AppointmentRecord, PaymentMethod } from "@/types";

interface PaymentSheetProps {
  appointment: AppointmentRecord;
  businessUpiId?: string | null;
  businessName: string;
  /** Upfront deposit percentage (1–99). When set with a known package price, only
   *  this fraction is collected now; the rest is due at the appointment. 0 / undefined
   *  / 100 collect the full amount, exactly as before. */
  depositPercent?: number;
  onPaid: () => void;
  onClose: () => void;
}

export function PaymentSheet({ appointment, businessUpiId, businessName, depositPercent, onPaid, onClose }: PaymentSheetProps) {
  const { showToast } = useApp();

  const fullPrice = appointment.packagePrice ?? null;
  // A partial deposit only applies to a genuine 1–99% split on a known package
  // price. 0 / undefined / 100 (or no price at all) fall through to the normal
  // full-amount flow untouched.
  const isDeposit =
    fullPrice != null &&
    typeof depositPercent === "number" &&
    depositPercent >= 1 &&
    depositPercent <= 99;
  const depositAmount = isDeposit ? Math.round((fullPrice as number) * (depositPercent as number) / 100) : null;
  const balanceAmount = isDeposit ? Math.max(0, (fullPrice as number) - (depositAmount as number)) : null;

  const [amount, setAmount] = useState<string>(
    isDeposit
      ? String(depositAmount)
      : appointment.paymentAmount?.toString() ?? appointment.packagePrice?.toString() ?? ""
  );
  const [claiming, setClaiming] = useState(false);

  // The amount actually collected now — the deposit when a split applies, else
  // whatever's in the amount field. This is what's claimed and encoded in the
  // UPI intent, so payment_amount records the deposit, not the full price.
  const numAmount = isDeposit ? depositAmount : parseFloat(amount) || null;

  async function claim(method: PaymentMethod, reference: string | null) {
    setClaiming(true);
    try {
      await appointmentService.claimPayment(appointment.id, method, numAmount, reference);
      showToast("Payment claim sent — waiting for business to confirm");
      onPaid();
      onClose();
    } catch {
      showToast("Couldn't record payment. Try again.");
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
            <div className="bold" style={{ fontSize: 18 }}>Pay for appointment</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{appointment.targetName}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Amount */}
        <div style={{ marginBottom: 16 }}>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Amount (₹)</label>
          {isDeposit ? (
            <>
              <div className="bold" style={{ fontSize: 26, color: "var(--brand-700)" }}>
                Deposit now ₹{depositAmount} <span style={{ fontSize: 14, fontWeight: 600, color: "var(--brand-600)" }}>({depositPercent}%)</span>
              </div>
              <div className="tiny muted" style={{ marginTop: 3 }}>
                Balance ₹{balanceAmount} at appointment{appointment.packageName ? ` · for: ${appointment.packageName}` : ""}
              </div>
            </>
          ) : appointment.packagePrice ? (
            <>
              <div className="bold" style={{ fontSize: 26, color: "var(--brand-700)" }}>₹{appointment.packagePrice}</div>
              {appointment.packageName && <div className="tiny muted" style={{ marginTop: 2 }}>for: {appointment.packageName}</div>}
            </>
          ) : (
            <input
              className="input"
              inputMode="decimal"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          )}
        </div>

        <PaymentMethodPanel
          businessUpiId={businessUpiId}
          businessName={businessName}
          amount={numAmount}
          txnNote="Appointment"
          cashTitle="Pay in cash at the venue"
          claiming={claiming}
          onSubmit={claim}
        />

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
