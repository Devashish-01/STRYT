import { Clock, CheckCircle2, XCircle } from "@/components/Icons";
import { inr } from "@/components/common";

export interface PaymentStatusCardProps {
  paymentStatus?: "UNPAID" | "PENDING_CONFIRM" | "PAID" | "REJECTED" | string | null;
  paymentMethod?: string | null;
  paymentAmount?: number | null;
  paymentReference?: string | null;
  /** Name of the party who claimed the payment (shown in the receiver's confirm/reject view). */
  claimantName: string;
  /** True when the viewer is the one who paid (sees a "waiting for confirmation" state, not confirm/reject buttons). */
  viewerIsPayer: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
  busy?: boolean;
}

/** Read-only (plus confirm/reject) payment status, shared across agreement, appointment,
 *  and queue completion screens so a customer/business/provider can track a payment claim
 *  in one consistent place, regardless of which flow it came from. */
export function PaymentStatusCard({
  paymentStatus,
  paymentMethod,
  paymentAmount,
  paymentReference,
  claimantName,
  viewerIsPayer,
  onConfirm,
  onReject,
  busy,
}: PaymentStatusCardProps) {
  if (!paymentStatus || paymentStatus === "UNPAID") return null;

  if (paymentStatus === "PENDING_CONFIRM") {
    return viewerIsPayer ? (
      <div className="card row gap-10" style={{ padding: 12, background: "var(--amber-50)", border: "1px solid var(--amber-100)" }}>
        <Clock size={18} color="var(--amber-700)" style={{ flexShrink: 0 }} />
        <div className="grow">
          <div className="tiny semi" style={{ color: "var(--amber-700)" }}>Waiting for confirmation</div>
          <div className="tiny muted">
            Claimed via {paymentMethod}{paymentAmount ? ` · ${inr(paymentAmount)}` : ""}
          </div>
        </div>
      </div>
    ) : (
      <div className="card col gap-10" style={{ padding: 12, background: "var(--amber-50)", border: "1px solid var(--amber-100)" }}>
        <div className="row gap-8" style={{ alignItems: "center" }}>
          <span style={{ fontSize: 18 }}>⏳</span>
          <div className="grow">
            <div className="tiny semi" style={{ color: "var(--amber-700)" }}>{claimantName} claims payment via {paymentMethod}</div>
            <div className="tiny" style={{ color: "var(--amber-700)", marginTop: 1 }}>
              {paymentAmount ? `Amount: ${inr(paymentAmount)}` : "Amount not specified"}
              {paymentReference ? ` • Ref: ${paymentReference}` : ""}
            </div>
          </div>
        </div>
        <div className="row gap-8">
          <button className="btn btn-green grow btn-sm" disabled={busy} onClick={onConfirm}>
            <CheckCircle2 size={14} /> Confirm received
          </button>
          <button
            className="btn btn-outline grow btn-sm"
            style={{ color: "var(--red-600)", borderColor: "var(--red-100)" }}
            disabled={busy}
            onClick={onReject}
          >
            Reject
          </button>
        </div>
      </div>
    );
  }

  if (paymentStatus === "PAID") {
    return (
      <div className="card row gap-8" style={{ padding: 12, alignItems: "center" }}>
        <CheckCircle2 size={16} color="var(--green-500)" />
        <span className="tiny semi" style={{ color: "var(--green-600)" }}>
          Payment confirmed{paymentAmount ? ` · ${inr(paymentAmount)}` : ""}
        </span>
      </div>
    );
  }

  if (paymentStatus === "REJECTED") {
    return (
      <div className="card row gap-8" style={{ padding: 12, alignItems: "center" }}>
        <XCircle size={16} color="var(--red-600)" />
        <span className="tiny semi" style={{ color: "var(--red-600)" }}>
          Payment claim rejected — {viewerIsPayer ? "please re-submit" : "waiting for a new claim"}
        </span>
      </div>
    );
  }

  return null;
}
