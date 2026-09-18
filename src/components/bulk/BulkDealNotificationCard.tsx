import React from "react";
import {
  Package,
  Ticket,
  Clock,
  CheckCircle2,
  XCircle,
  CreditCard,
  PartyPopper,
  Users,
  Trash2,
  Share2,
  Store,
  Eye,
} from "@/components/Icons";
import { inr } from "@/lib/format";
import { StatusPill } from "@/components/NotificationContent";
import { distinctPill } from "@/lib/notificationCard";
import type { NotificationMetadata, NotificationType } from "@/types";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";

interface BulkDealNotificationCardProps {
  type?: NotificationType;
  metadata: NotificationMetadata;
  title: string;
  preview: string;
  time: string;
  unread: boolean;
  onAction?: (action: string, metadata: NotificationMetadata) => void;
  onDelete?: () => void;
}

function getLeadingIcon(type?: NotificationType) {
  switch (type) {
    case "BULK_DEAL_UNLOCKED":
      return {
        icon: <Ticket size={18} color="var(--green-600)" />,
        bg: "var(--green-100)",
      };
    case "BULK_DEAL_DEPOSIT_CLAIMED":
      return {
        icon: <CreditCard size={18} color="var(--amber-700)" />,
        bg: "var(--amber-50)",
      };
    case "BULK_DEAL_DEPOSIT_CONFIRMED":
      return {
        icon: <CheckCircle2 size={18} color="var(--green-600)" />,
        bg: "var(--green-100)",
      };
    case "BULK_DEAL_DEPOSIT_REJECTED":
      return {
        icon: <XCircle size={18} color="var(--red-600)" />,
        bg: "var(--red-50)",
      };
    case "BULK_DEAL_EXTENDED":
      return {
        icon: <Clock size={18} color="var(--amber-700)" />,
        bg: "var(--amber-50)",
      };
    case "BULK_DEAL_REFUNDED":
      return {
        icon: <Package size={18} color="var(--ink-600)" />,
        bg: "var(--ink-100)",
      };
    case "GROUP_BUY_UNLOCKED":
      return {
        icon: <PartyPopper size={18} color="var(--orange-500)" />,
        bg: "var(--orange-50)",
      };
    case "ME_TOO":
      return {
        icon: <Users size={18} color="var(--brand-700)" />,
        bg: "var(--brand-50)",
      };
    default:
      return {
        icon: <Package size={18} color="var(--orange-500)" />,
        bg: "var(--orange-50)",
      };
  }
}

export default function BulkDealNotificationCard({
  type,
  metadata,
  title,
  preview,
  time,
  unread,
  onAction,
  onDelete,
}: BulkDealNotificationCardProps) {
  const { t, tf } = useI18n();
  const pill = distinctPill(title, metadata.statusPill);
  const actions = metadata.actions || [];
  const { icon, bg } = getLeadingIcon(type);

  // Progress Bar calculation
  const hasProgress =
    metadata.progressCurrent != null &&
    metadata.progressTarget != null &&
    metadata.progressTarget > 0;
  const current = metadata.progressCurrent ?? 0;
  const target = metadata.progressTarget ?? 1;
  const pct = Math.min(100, Math.round((current / target) * 100));
  const remaining = Math.max(0, target - current);
  const isTargetMet = current >= target;

  return (
    <div className="notif-bulk-card">
      <div className="notif-bulk-header">
        {/* Leading Icon Tile */}
        <div className="notif-bulk-leading">
          <div className="notif-bulk-icon-wrap" style={{ background: bg }}>
            {icon}
          </div>
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
        </div>

        {/* Header Titles & Delete */}
        <div className="notif-bulk-meta">
          <div className="notif-row-top">
            <div className="notif-bulk-title-group">
              <span className={`notif-row-title${unread ? " unread" : ""}`}>
                {title}
              </span>
              {metadata.dealTitle && (
                <span className="notif-bulk-deal-name ellipsis">
                  {metadata.dealTitle}
                </span>
              )}
            </div>
            <span className="notif-row-time-slot">
              <span className="notif-row-time">{time}</span>
              {onDelete && (
                <button
                  type="button"
                  className="notif-row-quick-delete"
                  aria-label={t("notif_delete")}
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

          <p className="notif-bulk-preview clamp-2">{preview}</p>

          {/* Status Pill if present */}
          {pill && (
            <div className="notif-pill-row">
              <StatusPill label={pill} tone={metadata.tone} />
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar Component */}
      {hasProgress && (
        <div className="notif-bulk-progress-wrap">
          <div className="notif-bulk-progress-labels">
            <span className="notif-bulk-progress-count">
              📦 {current} / {target} {t("units_word")} ({pct}%)
            </span>
            <span
              className="notif-bulk-progress-status"
              style={{
                color: isTargetMet ? "var(--green-600)" : "var(--amber-700)",
              }}
            >
              {isTargetMet
                ? t("target_reached")
                : tf("more_to_unlock", { n: remaining })}
            </span>
          </div>
          <div className="notif-bulk-progress-track">
            <div
              className="notif-bulk-progress-fill"
              style={{
                width: `${pct}%`,
                background: isTargetMet ? "var(--green-500)" : "var(--amber-500)",
              }}
            />
          </div>
        </div>
      )}

      {/* Ticket Voucher Callout (for Claim Passes) */}
      {(type === "BULK_DEAL_UNLOCKED" || metadata.tokenCode) && (
        <div className="notif-bulk-ticket-box">
          <div className="notif-bulk-ticket-header">
            <span className="notif-bulk-ticket-label">
              <Ticket size={14} /> {t("your_claim_passes")}
            </span>
            {metadata.tokenCode && (
              <span className="notif-bulk-token-code">{metadata.tokenCode}</span>
            )}
          </div>
          <div className="notif-bulk-ticket-body">
            {metadata.quantity != null && (
              <span className="notif-bulk-ticket-qty">
                {metadata.quantity} {metadata.quantity > 1 ? t("units_word") : t("unit_word")}
              </span>
            )}
            {metadata.unitPrice != null && (
              <span className="notif-bulk-ticket-price">
                • {inr(metadata.unitPrice)} / {t("unit_word")}
              </span>
            )}
          </div>
          <div className="notif-bulk-ticket-footer">
            {metadata.balanceDue != null && metadata.balanceDue > 0 ? (
              <span className="notif-bulk-balance-badge due">
                {t("notif_bulk_balance_due")}: {inr(metadata.balanceDue)}
              </span>
            ) : (
              <span className="notif-bulk-balance-badge paid">
                {t("notif_bulk_fully_paid")}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Deposit Claim Highlight Box (for merchant deposit review) */}
      {type === "BULK_DEAL_DEPOSIT_CLAIMED" && metadata.depositAmount != null && (
        <div className="notif-bulk-deposit-box">
          <div className="notif-bulk-deposit-row">
            <div className="notif-bulk-deposit-amount-wrap">
              <span className="notif-bulk-deposit-amt-label">Claimed Deposit:</span>
              <span className="notif-bulk-deposit-amt-val">{inr(metadata.depositAmount)}</span>
            </div>
            {metadata.paymentMethod && (
              <span className="notif-bulk-deposit-method">
                {metadata.paymentMethod}
              </span>
            )}
          </div>
          {metadata.paymentRef && (
            <div className="notif-bulk-deposit-ref">
              <span>Ref / UTR:</span> <code>{metadata.paymentRef}</code>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {actions.length > 0 && onAction && (
        <div className="notif-bulk-actions" onClick={(e) => e.stopPropagation()}>
          {actions.includes("CONFIRM_DEPOSIT") && (
            <button
              type="button"
              className="notif-bulk-btn notif-bulk-btn-confirm"
              onClick={() => {
                haptics.light();
                onAction("CONFIRM_DEPOSIT", metadata);
              }}
            >
              <CheckCircle2 size={14} />
              <span>{t("notif_bulk_confirm_deposit")}</span>
            </button>
          )}

          {actions.includes("REJECT_DEPOSIT") && (
            <button
              type="button"
              className="notif-bulk-btn notif-bulk-btn-reject"
              onClick={() => {
                haptics.light();
                onAction("REJECT_DEPOSIT", metadata);
              }}
            >
              <XCircle size={14} />
              <span>{t("notif_bulk_reject_deposit")}</span>
            </button>
          )}

          {actions.includes("VIEW_CLAIM_PASS") && (
            <button
              type="button"
              className="notif-bulk-btn notif-bulk-btn-pass"
              onClick={() => {
                haptics.light();
                onAction("VIEW_CLAIM_PASS", metadata);
              }}
            >
              <Ticket size={14} />
              <span>{t("notif_bulk_view_pass")}</span>
            </button>
          )}

          {actions.includes("VIEW_DEAL") && (
            <button
              type="button"
              className="notif-bulk-btn notif-bulk-btn-view"
              onClick={() => {
                haptics.light();
                onAction("VIEW_DEAL", metadata);
              }}
            >
              {metadata.targetType === "BUSINESS" ? <Store size={14} /> : <Eye size={14} />}
              <span>{t("notif_bulk_view_deal")}</span>
            </button>
          )}

          {actions.includes("SHARE_DEAL") && (
            <button
              type="button"
              className="notif-bulk-btn notif-bulk-btn-share"
              onClick={() => {
                haptics.light();
                onAction("SHARE_DEAL", metadata);
              }}
            >
              <Share2 size={14} />
              <span>{t("share_word")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
