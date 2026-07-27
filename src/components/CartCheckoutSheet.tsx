import { useState } from "react";
import { PaymentMethodPanel } from "@/components/PaymentMethodPanel";
import { inr } from "@/components/common";
import { CalendarClock, IndianRupee, ChevronRight } from "@/components/Icons";
import { appointmentService } from "@/services";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";
import type { AppointmentRecord, PaymentMethod } from "@/types";

interface CartCheckoutSheetProps {
  businessId: string;
  businessName: string;
  businessUpiId?: string | null;
  itemCount: number;
  total: number;
  /** Human-readable order summary, e.g. "Chai x2, Samosa x1". */
  summary: string;
  items: AppointmentRecord["items"];
  /** Switch to the scheduled-booking flow (the existing AppointmentSheet). */
  onSchedule: () => void;
  /** Fired after a successful direct purchase. */
  onPaid: () => void;
  onClose: () => void;
}

/**
 * The fork after tapping the cart: buy it now, or book it for later.
 *
 * "Buy in place" creates the appointment AND claims payment in one atomic RPC
 * (appointment_create_walk_in_payment), so it lands in the owner's existing
 * payment-confirmation queue exactly like any other claim — no separate
 * payment system. "Book for another time" hands off to the normal
 * AppointmentSheet scheduling flow, unchanged.
 */
export default function CartCheckoutSheet({
  businessId, businessName, businessUpiId,
  itemCount, total, summary, items,
  onSchedule, onPaid, onClose,
}: CartCheckoutSheetProps) {
  const { showToast } = useApp();
  const [mode, setMode] = useState<"choose" | "pay">("choose");
  const [claiming, setClaiming] = useState(false);

  async function submitPayment(method: PaymentMethod, reference: string | null) {
    setClaiming(true);
    try {
      await appointmentService.createWalkInPayment({
        targetId: businessId,
        packageName: itemCount === 1 ? summary : `${itemCount} items`,
        packagePrice: total,
        method,
        reference,
        items,
      });
      haptics.success();
      showToast(
        method === "CASH"
          ? "Recorded — the shop will confirm once they have the cash"
          : "Payment submitted — the shop will confirm it shortly",
      );
      onPaid();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't record the payment. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="overlay" onClick={() => { if (!claiming) onClose(); }}>
      <div className="sheet col gap-14" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />

        <div>
          <h3 className="bold h2">{mode === "choose" ? "How would you like this?" : "Pay now"}</h3>
          <p className="small muted" style={{ marginTop: 3 }}>
            {itemCount} item{itemCount > 1 ? "s" : ""} · {inr(total)}
          </p>
        </div>

        {mode === "choose" ? (
          <div className="col gap-10">
            <button
              className="card row gap-12 center-v"
              style={{ padding: 14, textAlign: "left", border: "1.5px solid var(--green-500)" }}
              onClick={() => { haptics.selection(); setMode("pay"); }}
            >
              <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--green-100)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <IndianRupee size={19} color="var(--green-600)" />
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="semi small">Buy in place</div>
                <div className="tiny muted">Pay now by UPI or cash — the shop confirms and it's done</div>
              </div>
              <ChevronRight size={17} color="var(--ink-300)" />
            </button>

            <button
              className="card row gap-12 center-v"
              style={{ padding: 14, textAlign: "left" }}
              onClick={() => { haptics.selection(); onSchedule(); }}
            >
              <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--brand-50)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <CalendarClock size={19} color="var(--brand-600)" />
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="semi small">Book for another time</div>
                <div className="tiny muted">Pick a slot — or have it delivered, if the shop offers it</div>
              </div>
              <ChevronRight size={17} color="var(--ink-300)" />
            </button>

            <button className="btn btn-ghost btn-block" onClick={onClose}>Cancel</button>
          </div>
        ) : (
          <>
            <PaymentMethodPanel
              businessUpiId={businessUpiId}
              businessName={businessName}
              amount={total}
              txnNote="STRYT order"
              claiming={claiming}
              onSubmit={submitPayment}
            />
            <button className="btn btn-ghost btn-block" disabled={claiming} onClick={() => setMode("choose")}>
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
