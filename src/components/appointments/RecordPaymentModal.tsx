import { useState } from "react";
import { CheckCircle2, Clock, IndianRupee, X } from "@/components/Icons";
import { inr, SafeImg } from "@/components/common";
import { ownerVisibleCustomerName } from "@/services/engagement/appointmentService";
import type { AppointmentRecord, PaymentMethod } from "@/types";

interface RecordPaymentModalProps {
  apt: AppointmentRecord;
  onClose: () => void;
  onRecordPaid: (apt: AppointmentRecord, method: PaymentMethod, amount: number) => Promise<void>;
  onSaveUnpaidTab: (apt: AppointmentRecord, amount: number) => Promise<void>;
  submitting?: boolean;
}

export function RecordPaymentModal({
  apt,
  onClose,
  onRecordPaid,
  onSaveUnpaidTab,
  submitting,
}: RecordPaymentModalProps) {
  const initialAmount = apt.packagePrice ?? apt.paymentAmount ?? "";
  const [amountStr, setAmountStr] = useState(initialAmount ? String(initialAmount) : "");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [actionBusy, setActionBusy] = useState<"PAID" | "TAB" | null>(null);

  const amount = Number(amountStr);
  const isValidAmount = Number.isFinite(amount) && amount > 0;
  const customerName = ownerVisibleCustomerName(apt);

  function adjustAmount(delta: number) {
    const current = Number(amountStr) || 0;
    setAmountStr(String(Math.max(0, current + delta)));
  }

  async function handlePaid() {
    if (!isValidAmount || submitting) return;
    setActionBusy("PAID");
    try {
      await onRecordPaid(apt, method, amount);
      onClose();
    } finally {
      setActionBusy(null);
    }
  }

  async function handleTab() {
    if (!isValidAmount || submitting) return;
    setActionBusy("TAB");
    try {
      await onSaveUnpaidTab(apt, amount);
      onClose();
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card col gap-14"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 20,
          background: "var(--surface)",
          animation: "scaleUp .15s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between center-v">
          <div className="row gap-8 center-v">
            <span style={{ fontSize: 20 }}>💰</span>
            <div>
              <div className="bold" style={{ fontSize: 16 }}>Counter Payment & Tab</div>
              <div className="tiny muted">{customerName} • {apt.dateLabel}</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={!!actionBusy || submitting}>
            <X size={18} />
          </button>
        </div>

        {/* Customer & service badge */}
        <div className="row gap-10 center-v" style={{ background: "var(--ink-50)", padding: 10, borderRadius: 10 }}>
          <SafeImg src={apt.customerAvatar} variant="avatar" style={{ width: 34, height: 34 }} />
          <div className="grow">
            <div className="semi small">{customerName}</div>
            <div className="tiny muted">
              {apt.packageName || "Service booking"}
              {apt.timeLabel ? ` at ${apt.timeLabel}` : ""}
              {(apt.partySize ?? 1) > 1 ? ` • ${apt.partySize} spots` : ""}
            </div>
          </div>
          {apt.paymentStatus === "UNPAID" && (
            <span className="badge badge-amber" style={{ fontSize: 10 }}>Unpaid</span>
          )}
        </div>

        {/* Amount Input */}
        <div>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>
            Payment amount (₹) *
          </label>
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontWeight: 700,
                fontSize: 18,
                color: "var(--ink-700)",
              }}
            >
              ₹
            </span>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              placeholder="0"
              autoFocus
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              style={{
                paddingLeft: 32,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 0.5,
              }}
            />
          </div>

          {/* Quick increment chips */}
          <div className="row gap-6" style={{ marginTop: 8 }}>
            {[50, 100, 200, 500].map((step) => (
              <button
                key={step}
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => adjustAmount(step)}
                style={{ fontSize: 11, padding: "3px 8px", borderRadius: 14 }}
              >
                +{step}
              </button>
            ))}
            {initialAmount ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setAmountStr(String(initialAmount))}
                style={{ fontSize: 11, padding: "3px 8px", marginLeft: "auto" }}
              >
                Reset ({inr(Number(initialAmount))})
              </button>
            ) : null}
          </div>
        </div>

        {/* Method selector */}
        <div>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Payment method</label>
          <div className="row gap-8">
            <button
              type="button"
              className="grow row gap-6 center"
              onClick={() => setMethod("CASH")}
              style={{
                padding: "10px 0",
                borderRadius: 10,
                border: method === "CASH" ? "2px solid var(--green-500)" : "1px solid var(--ink-200)",
                background: method === "CASH" ? "var(--green-100)" : "var(--surface)",
                color: method === "CASH" ? "var(--green-600)" : "var(--ink-700)",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              <CheckCircle2 size={15} /> Cash
            </button>
            <button
              type="button"
              className="grow row gap-6 center"
              onClick={() => setMethod("UPI")}
              style={{
                padding: "10px 0",
                borderRadius: 10,
                border: method === "UPI" ? "2px solid var(--brand-600)" : "1px solid var(--ink-200)",
                background: method === "UPI" ? "var(--brand-50)" : "var(--surface)",
                color: method === "UPI" ? "var(--brand-700)" : "var(--ink-700)",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              <IndianRupee size={15} /> UPI / QR
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="col gap-8" style={{ marginTop: 6 }}>
          <button
            type="button"
            className="btn btn-green btn-md row gap-8 center"
            disabled={!isValidAmount || !!actionBusy || submitting}
            onClick={handlePaid}
          >
            <CheckCircle2 size={16} />
            {actionBusy === "PAID" ? "Recording payment…" : `Record ${inr(amount || 0)} received (${method})`}
          </button>

          <button
            type="button"
            className="btn btn-outline btn-md row gap-8 center"
            style={{ color: "var(--amber-700)", borderColor: "var(--amber-200)" }}
            disabled={!isValidAmount || !!actionBusy || submitting}
            onClick={handleTab}
          >
            <Clock size={16} />
            {actionBusy === "TAB" ? "Adding to tab…" : `Add ${inr(amount || 0)} to customer tab (Unpaid)`}
          </button>
        </div>
      </div>
    </div>
  );
}
