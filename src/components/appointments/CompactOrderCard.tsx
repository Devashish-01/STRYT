import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SafeImg } from "@/components/common";
import { inr } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
import { ChevronDown, RotateCcw, Star, CreditCard, ImageIcon, CheckCircle2 } from "@/components/Icons";
import { OrderLines } from "@/components/OrderLines";
import { PaymentStatusCard } from "@/components/PaymentStatusCard";
import { CancelAttributionNote } from "@/components/appointments/CancelAttributionNote";
import { amountDue, isAutoOrderNote } from "@/lib/orderLines";
import { APPOINTMENT_STATUS_BADGE } from "@/lib/statusBadges";
import type { AppointmentRecord } from "@/types";

export function CompactOrderCard({
  apt,
  onRebook,
  onReview,
  onPay,
  onDismiss,
  onPreviewPhoto,
  defaultExpanded = false,
}: {
  apt: AppointmentRecord;
  onRebook?: (apt: AppointmentRecord) => void;
  onReview?: (apt: AppointmentRecord) => void;
  onPay?: (apt: AppointmentRecord) => void;
  onDismiss?: (apt: AppointmentRecord) => void;
  onPreviewPhoto?: (url: string) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const nav = useNavigate();
  const { t, tf } = useI18n();

  const isDelivery = apt.fulfillmentType === "DELIVERY";
  const isCompleted = apt.status === "COMPLETED";
  const isCancelled = apt.status === "CANCELLED" || apt.status === "REJECTED";
  const isUnpaid = !apt.paymentStatus || apt.paymentStatus === "UNPAID" || apt.paymentStatus === "REJECTED";
  const due = amountDue(apt);

  // Items summary for the short card
  const itemsSummary =
    apt.items && apt.items.length > 0
      ? apt.items.length === 1
        ? apt.items[0].name
        : `${apt.items.length} items (${apt.items.map((i) => i.name).slice(0, 2).join(", ")}${apt.items.length > 2 ? "…" : ""})`
      : apt.packageName ?? apt.dateLabel;

  function toggleExpand() {
    haptics.selection();
    setExpanded((prev) => !prev);
  }

  return (
    <div
      className="card col queue-row-enter"
      style={{
        padding: 0,
        overflow: "hidden",
        border: expanded ? "1px solid var(--brand-200)" : "1px solid var(--line)",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      {/* Short / Collapsed Header (Always Visible & Clickable) */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpand();
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          cursor: "pointer",
          background: expanded ? "var(--brand-50)" : "var(--surface)",
          transition: "background 0.2s ease",
          gap: 12,
        }}
      >
        {/* Left: Avatar with icon badge */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <SafeImg
            src={apt.targetAvatar}
            variant="avatar"
            style={{ width: 42, height: 42, borderRadius: 12 }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              fontSize: 10,
              background: "var(--surface)",
              borderRadius: "50%",
              width: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
          >
            {isDelivery ? "🛍️" : "📅"}
          </div>
        </div>

        {/* Center: Title + Summary */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bold small ellipsis" style={{ color: "var(--ink-900)" }}>
            {apt.targetName}
          </div>
          <div className="tiny muted ellipsis" style={{ marginTop: 2, fontSize: 11.5 }}>
            {apt.dateLabel} · {itemsSummary}
          </div>
          {isUnpaid && isCompleted && (
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--amber-700)", marginTop: 2 }}>
              ⚠️ {t("unpaid_status") || "Payment Due"} ({inr(due)})
            </div>
          )}
        </div>

        {/* Right: Price + Status Pill + Chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div className="bold small tabular-nums" style={{ color: "var(--ink-900)", fontSize: 13.5 }}>
              {inr(due)}
            </div>
            <span
              className={`badge ${APPOINTMENT_STATUS_BADGE[apt.status].cls}`}
              style={{ fontSize: 9.5, padding: "1px 6px", marginTop: 2 }}
            >
              {isCompleted && isDelivery ? "Delivered ✓" : APPOINTMENT_STATUS_BADGE[apt.status].label}
            </span>
          </div>

          <div
            style={{
              color: "var(--ink-400)",
              display: "flex",
              alignItems: "center",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.22s ease",
            }}
          >
            <ChevronDown size={18} />
          </div>
        </div>
      </div>

      {/* Expanded Details Drawer */}
      {expanded && (
        <div
          className="col gap-10"
          style={{
            padding: "14px 14px",
            borderTop: "1px solid var(--line)",
            background: "var(--surface)",
          }}
        >
          {/* Order items or package lines */}
          {(apt.items && apt.items.length > 0) ? (
            <OrderLines lines={apt.items} fee={isDelivery ? apt.deliveryFee : undefined} />
          ) : (
            apt.packageName && (
              <div
                className="tiny semi"
                style={{
                  color: "var(--brand-700)",
                  background: "var(--ink-50)",
                  padding: "8px 10px",
                  borderRadius: 8,
                }}
              >
                📦 {apt.packageName}
                {apt.packagePrice ? ` • ₹${apt.packagePrice}` : ""}
                {(apt.partySize ?? 1) > 1 ? ` • 👥 ${apt.partySize} spots` : ""}
              </div>
            )
          )}

          {/* Delivery destination address */}
          {isDelivery && apt.deliveryAddressLine && (
            <div className="tiny" style={{ color: "var(--ink-700)" }}>
              📍 <strong>{t("ord_deliver_to")}</strong> {apt.deliveryAddressLine}
            </div>
          )}

          {/* Notes */}
          {apt.notes && !isAutoOrderNote(apt.notes, !!apt.items?.length) && (
            <div className="tiny" style={{ color: "var(--ink-700)" }}>
              📝 <strong>{t("your_note_label")}</strong> {apt.notes}
            </div>
          )}

          {/* Reference Photo */}
          {apt.photoUrl && onPreviewPhoto && (
            <button
              type="button"
              onClick={() => onPreviewPhoto(apt.photoUrl!)}
              className="row gap-6 center-v"
              style={{
                background: "none",
                border: "none",
                color: "var(--brand-700)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                padding: 0,
              }}
            >
              <ImageIcon size={14} /> {t("view_reference_photo")}
            </button>
          )}

          {/* Cancellation Note */}
          {isCancelled && <CancelAttributionNote apt={apt} viewpoint="CUSTOMER" />}

          {/* Payment breakdown */}
          <PaymentStatusCard
            paymentStatus={apt.paymentStatus}
            paymentMethod={apt.paymentMethod}
            paymentAmount={apt.paymentAmount}
            paymentReference={apt.paymentReference}
            claimantName="You"
            viewerIsPayer
          />

          {/* Pay action for unpaid completed */}
          {isUnpaid && onPay && (
            <button
              type="button"
              className="btn btn-primary btn-sm row gap-6 center"
              style={{ fontSize: 12, padding: "6px 14px", alignSelf: "flex-start" }}
              onClick={(e) => {
                e.stopPropagation();
                onPay(apt);
              }}
            >
              <CreditCard size={13} /> {t("pay_now")} {inr(due)}
            </button>
          )}

          {/* Actions: Reorder / Book Again, Rate & Review, View Shop */}
          <div
            className="row gap-8"
            style={{
              borderTop: "1px solid var(--line)",
              paddingTop: 10,
              marginTop: 4,
            }}
          >
            {onRebook && (
              <button
                type="button"
                className="btn btn-primary grow btn-sm row gap-4 center"
                onClick={(e) => {
                  e.stopPropagation();
                  onRebook(apt);
                }}
              >
                <RotateCcw size={14} /> {isDelivery ? t("order_again") || "Order again" : t("book_again")}
              </button>
            )}

            {isCompleted && onReview && (
              <button
                type="button"
                className="btn btn-outline btn-sm row gap-4 center"
                style={{ color: "var(--amber-600)", borderColor: "var(--amber-300)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onReview(apt);
                }}
              >
                <Star size={14} color="var(--amber-500)" weight="fill" /> Rate & Review
              </button>
            )}

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12 }}
              onClick={(e) => {
                e.stopPropagation();
                nav(`/${apt.targetType.toLowerCase()}/${apt.targetId}`);
              }}
            >
              {apt.targetType === "BUSINESS" ? t("view_shop") : t("view_profile")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
