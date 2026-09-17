import React from "react";
import {
  Wallet,
  Receipt,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Store,
  Trash2,
  IndianRupee,
} from "@/components/Icons";
import { SafeImg } from "@/components/common";
import { toneColor, toneBg } from "@/lib/notificationTone";
import type { NotificationMetadata, NotificationType } from "@/types";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";

interface PaymentNotificationCardProps {
  type?: NotificationType;
  metadata: NotificationMetadata;
  title: string;
  preview: string;
  time: string;
  unread: boolean;
  onAction?: (action: string, metadata: NotificationMetadata) => void;
  onDelete?: () => void;
}

export default function PaymentNotificationCard({
  type,
  metadata,
  title,
  preview,
  time,
  unread,
  onAction,
  onDelete,
}: PaymentNotificationCardProps) {
  const { t } = useI18n();
  const actions = metadata.actions || [];
  const isReceived = type === "CUSTOM_PAYMENT_RECEIVED";
  const isConfirmed = type === "CUSTOM_PAYMENT_CONFIRMED";
  const isRejected = type === "CUSTOM_PAYMENT_REJECTED";

  return (
    <div className={`notif-pay-card${isReceived ? " notif-pay-card-pending" : ""}`}>
      <div className="notif-pay-header">
        {/* Leading Visual */}
        <div className="notif-pay-leading">
          {metadata.avatarUrl ? (
            <div className="notif-row-icon notif-row-avatar-wrap">
              <SafeImg src={metadata.avatarUrl} variant="avatar" className="notif-avatar-img" />
              {isReceived && (
                <span className="notif-pay-corner-badge" style={{ background: "var(--amber-500)" }}>
                  <Wallet size={10} color="#fff" />
                </span>
              )}
              {isConfirmed && (
                <span className="notif-pay-corner-badge" style={{ background: "var(--green-600)" }}>
                  <CheckCircle2 size={10} color="#fff" />
                </span>
              )}
              {isRejected && (
                <span className="notif-pay-corner-badge" style={{ background: "var(--red-600)" }}>
                  <XCircle size={10} color="#fff" />
                </span>
              )}
            </div>
          ) : (
            <div
              className="notif-pay-icon-wrap"
              style={{ background: toneBg(metadata.tone) }}
            >
              {isConfirmed ? (
                <Receipt size={20} color={toneColor(metadata.tone) || "var(--green-600)"} />
              ) : isRejected ? (
                <XCircle size={20} color={toneColor(metadata.tone) || "var(--red-600)"} />
              ) : (
                <Wallet size={20} color={toneColor(metadata.tone) || "var(--amber-600)"} />
              )}
            </div>
          )}
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
        </div>

        {/* Text & Meta */}
        <div className="notif-pay-meta">
          <div className="notif-row-top">
            <span className={`notif-row-title${unread ? " unread" : ""}`}>
              {title}
            </span>
            <span className="notif-row-time-slot">
              <span className="notif-row-time">{time}</span>
              {onDelete && (
                <button
                  type="button"
                  className="notif-row-quick-delete"
                  aria-label="Delete notification"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <Trash2 size={15} color="var(--ink-400)" />
                </button>
              )}
            </span>
          </div>

          <p className="notif-pay-preview clamp-2">{preview}</p>

          {/* Status Pill if present */}
          {metadata.statusPill && (
            <div style={{ marginTop: 5 }}>
              <span
                className="notif-pill"
                style={{
                  color: toneColor(metadata.tone),
                  background: toneBg(metadata.tone),
                }}
              >
                {metadata.statusPill}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Payment Slip Callout */}
      {metadata.amount != null && (
        <div className="notif-pay-slip">
          <div className="notif-pay-slip-top">
            <div className="notif-pay-amount-box">
              <span className="notif-pay-currency-symbol">₹</span>
              <span className="notif-pay-amount-val">
                {typeof metadata.amount === "number"
                  ? metadata.amount.toLocaleString("en-IN")
                  : metadata.amount}
              </span>
            </div>
            {metadata.paymentMethod && (
              <span className={`notif-pay-method-badge notif-pay-method-${metadata.paymentMethod.toLowerCase()}`}>
                {metadata.paymentMethod === "UPI"
                  ? t("notif_pay_method_upi")
                  : metadata.paymentMethod === "CASH"
                  ? t("notif_pay_method_cash")
                  : metadata.paymentMethod}
              </span>
            )}
          </div>

          {/* Reference / UTR Number if present */}
          {metadata.paymentRef && (
            <div className="notif-pay-ref-row">
              <span className="notif-pay-ref-label">{t("notif_pay_ref_label")}:</span>
              <code className="notif-pay-ref-code">{metadata.paymentRef}</code>
            </div>
          )}

          {/* Customer Note if present */}
          {metadata.note && (
            <div className="notif-pay-note-row">
              <span className="notif-pay-note-label">{t("notif_pay_note_label")}:</span>
              <span className="notif-pay-note-text">"{metadata.note}"</span>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {actions.length > 0 && onAction && (
        <div className="notif-pay-actions" onClick={(e) => e.stopPropagation()}>
          {actions.includes("CONFIRM_CUSTOM_PAYMENT") && (
            <button
              type="button"
              className="notif-pay-btn notif-pay-btn-confirm"
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                onAction("CONFIRM_CUSTOM_PAYMENT", metadata);
              }}
            >
              <CheckCircle2 size={14} />
              <span>{t("notif_pay_confirm")}</span>
            </button>
          )}

          {actions.includes("REJECT_CUSTOM_PAYMENT") && (
            <button
              type="button"
              className="notif-pay-btn notif-pay-btn-reject"
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                onAction("REJECT_CUSTOM_PAYMENT", metadata);
              }}
            >
              <XCircle size={14} />
              <span>{t("notif_pay_reject")}</span>
            </button>
          )}

          {actions.includes("VIEW_RECEIPT") && (
            <button
              type="button"
              className="notif-pay-btn notif-pay-btn-receipt"
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                onAction("VIEW_RECEIPT", metadata);
              }}
            >
              <Receipt size={14} />
              <span>{t("notif_pay_receipt")}</span>
            </button>
          )}

          {actions.includes("VIEW_STORE") && (
            <button
              type="button"
              className="notif-pay-btn notif-pay-btn-store"
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                onAction("VIEW_STORE", metadata);
              }}
            >
              <Store size={14} />
              <span>{t("notif_pay_store")}</span>
            </button>
          )}

          {actions.includes("RETRY_PAYMENT") && (
            <button
              type="button"
              className="notif-pay-btn notif-pay-btn-retry"
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                onAction("RETRY_PAYMENT", metadata);
              }}
            >
              <RotateCcw size={14} />
              <span>{t("notif_pay_retry")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
