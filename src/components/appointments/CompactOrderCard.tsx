import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SafeImg } from "@/components/common";
import { formatFullOrderDateTime, formatOrderDateTime, inr } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  ImageIcon,
  MapPin,
  RotateCcw,
  Star,
  Store,
} from "@/components/Icons";
import { OrderLines } from "@/components/OrderLines";
import { PaymentStatusCard } from "@/components/PaymentStatusCard";
import { CancelAttributionNote } from "@/components/appointments/CancelAttributionNote";
import { amountDue, isAutoOrderNote } from "@/lib/orderLines";
import { isLiveOrder } from "@/lib/orderLists";
import { APPOINTMENT_STATUS_BADGE } from "@/lib/statusBadges";
import type { AppointmentRecord } from "@/types";

export function CompactOrderCard({
  apt,
  onRebook,
  onReview,
  onPay,
  onViewInDeals,
  onPreviewPhoto,
  defaultExpanded = false,
  titleMode = "target",
  hideViewShop = false,
  alwaysShowActions = false,
  highlighted = false,
}: {
  apt: AppointmentRecord;
  onRebook?: (apt: AppointmentRecord) => void;
  onReview?: (apt: AppointmentRecord) => void;
  onPay?: (apt: AppointmentRecord) => void;
  onViewInDeals?: (apt: AppointmentRecord) => void;
  onDismiss?: (apt: AppointmentRecord) => void;
  onPreviewPhoto?: (url: string) => void;
  defaultExpanded?: boolean;
  /** `"target"` shows the shop/provider name; `"items"` shows the item summary (ideal inside a shop's Mine tab). */
  titleMode?: "target" | "items";
  hideViewShop?: boolean;
  /** Keeps the action buttons visible at the bottom even when collapsed. */
  alwaysShowActions?: boolean;
  highlighted?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const nav = useNavigate();
  const { t, tf, lang } = useI18n();

  const isDelivery = apt.fulfillmentType === "DELIVERY";
  const isOrder = isDelivery || Boolean(apt.items && apt.items.length > 0);
  const isCompleted = apt.status === "COMPLETED";
  const isCancelled = apt.status === "CANCELLED" || apt.status === "REJECTED";
  const isUnpaid = !apt.paymentStatus || apt.paymentStatus === "UNPAID" || apt.paymentStatus === "REJECTED";
  const hasLineItems = Boolean(apt.items && apt.items.length > 0);
  const due = amountDue(apt);
  const isLive = isLiveOrder(apt);

  const orderTimestampISO = apt.createdAtISO || apt.scheduledForISO;
  const formattedWhen = formatOrderDateTime(orderTimestampISO, lang, t, {
    dateLabel: apt.dateLabel,
    timeLabel: apt.timeLabel,
  });
  const fullWhen = formatFullOrderDateTime(orderTimestampISO, lang, {
    dateLabel: apt.dateLabel,
    timeLabel: apt.timeLabel,
  });

  // Items summary for the short card
  const itemsSummary =
    apt.items && apt.items.length > 0
      ? apt.items.length === 1
        ? apt.items[0].name
        : `${apt.items.length} items (${apt.items.map((i) => i.name).slice(0, 2).join(", ")}${apt.items.length > 2 ? "…" : ""})`
      : apt.packageName ?? "";

  const cardTitle = titleMode === "items" ? itemsSummary || apt.targetName : apt.targetName;
  const paidInlineHint =
    titleMode === "items" && apt.paymentStatus === "PAID" && apt.paymentMethod
      ? `✓ Paid via ${apt.paymentMethod}`
      : "";
  const subtitleText =
    titleMode === "items"
      ? [formattedWhen, paidInlineHint].filter(Boolean).join(" · ")
      : [formattedWhen, itemsSummary].filter(Boolean).join(" · ");

  const hasRecordedPayment = Boolean(apt.paymentStatus && apt.paymentStatus !== "UNPAID");
  const showPayAction = isUnpaid && Boolean(onPay) && due > 0;
  const paymentFooter =
    hasRecordedPayment || showPayAction ? (
      <div className="col gap-8">
        {hasRecordedPayment && (
          <PaymentStatusCard
            variant="inline"
            hideAmount={hasLineItems}
            paymentStatus={apt.paymentStatus}
            paymentMethod={apt.paymentMethod}
            paymentAmount={apt.paymentAmount}
            paymentReference={apt.paymentReference}
            claimantName="You"
            viewerIsPayer
          />
        )}
        {showPayAction && (
          <div className="row between center-v gap-8">
            <span className="tiny semi" style={{ color: "var(--amber-700)" }}>
              {t("ord_payment_due")}
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm row gap-6 center"
              style={{ fontSize: 12, padding: "6px 12px", whiteSpace: "nowrap" }}
              onClick={(e) => {
                e.stopPropagation();
                onPay?.(apt);
              }}
            >
              <CreditCard size={13} /> {t("pay_now")} {inr(due)}
            </button>
          </div>
        )}
      </div>
    ) : null;

  const hasBottomActions = Boolean(onRebook || (isCompleted && onReview) || onViewInDeals);
  const bottomActionsRow = hasBottomActions ? (
    <div className="row gap-8">
      {onRebook && (
        <button
          type="button"
          className="btn btn-primary grow btn-sm row gap-6 center"
          style={{ whiteSpace: "nowrap" }}
          onClick={(e) => {
            e.stopPropagation();
            onRebook(apt);
          }}
        >
          <RotateCcw size={14} /> {isDelivery || isOrder ? t("order_again") : t("book_again")}
        </button>
      )}

      {onViewInDeals && (
        <button
          type="button"
          className="btn btn-outline grow btn-sm row gap-4 center"
          style={{
            color: "var(--brand-700)",
            borderColor: "var(--brand-200)",
            background: "var(--brand-50)",
            whiteSpace: "nowrap",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onViewInDeals(apt);
          }}
        >
          <span>{isLive ? t("track_in_my_deals") : t("view_in_my_deals")}</span>
          <ArrowRight size={13} />
        </button>
      )}

      {isCompleted && onReview && (
        <button
          type="button"
          className="btn btn-outline grow btn-sm row gap-6 center"
          style={{ color: "var(--amber-600)", borderColor: "var(--amber-300)", whiteSpace: "nowrap" }}
          onClick={(e) => {
            e.stopPropagation();
            onReview(apt);
          }}
        >
          <Star size={14} color="var(--amber-500)" weight="fill" /> {t("ord_rate_review")}
        </button>
      )}
    </div>
  ) : null;

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
        border: highlighted
          ? "2px solid var(--brand-400)"
          : expanded
          ? "1px solid var(--brand-200)"
          : "1px solid var(--line)",
        boxShadow: highlighted ? "0 0 0 3px var(--brand-100)" : undefined,
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
        {/* Left: Avatar with icon badge (hidden when titleMode="items" inside a single shop's Mine tab) */}
        {titleMode === "target" && (
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
        )}

        {/* Center: Title + Summary (with order time) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bold small ellipsis" style={{ color: "var(--ink-900)" }}>
            {cardTitle}
          </div>
          <div className="tiny muted ellipsis" style={{ marginTop: 2, fontSize: 11.5 }}>
            {subtitleText}
          </div>
          {isUnpaid && isCompleted && due > 0 && (
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--amber-700)", marginTop: 2 }}>
              ⚠️ {t("ord_payment_due")} ({inr(due)})
            </div>
          )}
          {apt.paymentStatus === "PENDING_CONFIRM" && (
            <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--amber-700)", marginTop: 2 }}>
              ⏳ {t("awaiting_confirmation")}
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
            padding: "12px 14px 14px",
            borderTop: "1px solid var(--line)",
            background: "var(--surface)",
          }}
        >
          {/* Metadata row: exact order timestamp + optional quick shop link */}
          <div className="row between center-v gap-8">
            <div className="tiny muted row gap-4 center-v" style={{ minWidth: 0 }}>
              <Clock size={12} color="var(--ink-500)" style={{ flexShrink: 0 }} />
              <span className="ellipsis">
                {tf(isOrder ? "ord_ordered_at" : "ord_booked_at", { time: fullWhen })}
              </span>
            </div>
            {!hideViewShop && (
              <button
                type="button"
                className="tiny semi row gap-4 center-v"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--brand-700)",
                  cursor: "pointer",
                  padding: 0,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  nav(`/${apt.targetType.toLowerCase()}/${apt.targetId}`);
                }}
              >
                <Store size={12} />
                <span>{apt.targetType === "BUSINESS" ? t("view_shop") : t("view_profile")}</span>
                <ChevronRight size={12} />
              </button>
            )}
          </div>

          {/* Unified Receipt: items/package + inline payment status */}
          {hasLineItems ? (
            <OrderLines
              lines={apt.items!}
              fee={isDelivery ? apt.deliveryFee : undefined}
              footer={paymentFooter}
            />
          ) : (
            (apt.packageName || paymentFooter) && (
              <div
                className="col gap-8"
                style={{
                  background: "var(--ink-50)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                {apt.packageName && (
                  <div className="row between gap-8 center-v">
                    <span className="tiny semi" style={{ color: "var(--brand-700)", minWidth: 0 }}>
                      📦 {apt.packageName}
                      {(apt.partySize ?? 1) > 1 ? ` · 👥 ${apt.partySize} spots` : ""}
                    </span>
                    {apt.packagePrice ? (
                      <span className="tiny bold tabular-nums" style={{ flexShrink: 0 }}>
                        {inr(apt.packagePrice)}
                      </span>
                    ) : null}
                  </div>
                )}
                {paymentFooter && (
                  <div
                    style={
                      apt.packageName
                        ? { borderTop: "1px dashed var(--line)", paddingTop: 8 }
                        : undefined
                    }
                  >
                    {paymentFooter}
                  </div>
                )}
              </div>
            )
          )}

          {/* Delivery destination address */}
          {isDelivery && apt.deliveryAddressLine && (
            <div className="tiny row gap-6" style={{ color: "var(--ink-700)", alignItems: "flex-start" }}>
              <MapPin size={13} color="var(--ink-500)" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong>{t("ord_deliver_to")}:</strong> {apt.deliveryAddressLine}
              </span>
            </div>
          )}

          {/* Notes */}
          {apt.notes && !isAutoOrderNote(apt.notes, hasLineItems) && (
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

          {/* Primary Actions inside drawer */}
          {bottomActionsRow && (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 2 }}>
              {bottomActionsRow}
            </div>
          )}
        </div>
      )}

      {/* Always-visible compact action bar when collapsed (e.g. BusinessDetail → Mine) */}
      {!expanded && alwaysShowActions && bottomActionsRow && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
          {bottomActionsRow}
        </div>
      )}
    </div>
  );
}
