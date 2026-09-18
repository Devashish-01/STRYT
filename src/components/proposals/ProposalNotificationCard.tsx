import { type ReactNode } from "react";
import { FileText, HandshakeIcon, Megaphone, MessageSquareText, Check, X, Repeat, Wallet, ArrowRight, Trash2 } from "@/components/Icons";
import { AmountLine, NotificationAvatar, StatusPill } from "@/components/NotificationContent";
import { distinctPill } from "@/lib/notificationCard";
import type { NotificationMetadata, NotificationType } from "@/types";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";

const Handshake = HandshakeIcon as any;

interface ProposalNotificationCardProps {
  type: NotificationType;
  metadata: NotificationMetadata;
  title: string;
  preview: string;
  time: string;
  unread: boolean;
  onAction?: (action: string, metadata: NotificationMetadata) => void;
  onDelete?: () => void;
}

/** The type's color: the tile behind its icon when there is no one to picture, and the corner badge otherwise. */
const TYPE_COLOR: Partial<Record<NotificationType, string>> = {
  PROPOSAL: "var(--blue-500)",
  PROPOSAL_COUNTER: "var(--amber-500)",
  QUOTE_BROADCAST: "var(--brand-600)",
  AGREEMENT: "var(--green-600)",
  NEARBY_REQUEST: "var(--brand-600)",
};

/**
 * Quotes, counter-offers, agreements and nearby requests, on the same layout as every other card: picture, title and
 * time, then who and which request, then one row of small chips (amount, status). It used to stack a type badge, a
 * status badge and a separate ₹ box on top of all that.
 */
export default function ProposalNotificationCard({
  type,
  metadata,
  title,
  preview,
  time,
  unread,
  onAction,
  onDelete,
}: ProposalNotificationCardProps) {
  const { t } = useI18n();

  const isCounter = type === "PROPOSAL_COUNTER";
  const isBroadcast = type === "QUOTE_BROADCAST";
  const isAgreement = type === "AGREEMENT";
  const isNearbyRequest = type === "NEARBY_REQUEST";

  const typeIcon = (size: number): ReactNode =>
    isCounter ? (
      <Repeat size={size} color="#fff" weight="bold" />
    ) : isBroadcast ? (
      <Megaphone size={size} color="#fff" weight="fill" />
    ) : isAgreement ? (
      <Handshake size={size} color="#fff" weight="fill" />
    ) : isNearbyRequest ? (
      <MessageSquareText size={size} color="#fff" weight="fill" />
    ) : (
      <FileText size={size} color="#fff" weight="fill" />
    );
  const typeColor = TYPE_COLOR[type] ?? "var(--brand-600)";

  const actorName = metadata.actorName || metadata.proposerName;
  const avatarUrl = metadata.avatarUrl || metadata.proposerAvatar;
  const amount = metadata.amount ?? metadata.quotedPrice ?? metadata.counterPrice ?? metadata.agreedPrice;
  const amountLabel =
    metadata.amountLabel ||
    (isCounter
      ? t("notif_prop_counter_price", "Counter-offer")
      : isAgreement
      ? t("notif_prop_agreed_price", "Agreed Price")
      : t("notif_prop_quoted_price", "Quoted Price"));

  const pill = distinctPill(
    title,
    metadata.statusPill ||
      (isCounter
        ? t("notif_prop_pill_counter", "Awaiting Decision")
        : isAgreement
        ? t("notif_prop_pill_active", "Active")
        : t("notif_prop_pill_quote", "New Quote"))
  );

  return (
    <div className="notif-prop-card">
      <div className="notif-prop-header">
        <div className="notif-prop-leading">
          <NotificationAvatar
            src={avatarUrl}
            name={actorName}
            icon={typeIcon(20)}
            iconBg={typeColor}
            badge={typeIcon(11)}
            badgeBg={typeColor}
          />
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
        </div>

        <div className="notif-prop-meta">
          <div className="notif-row-top">
            <span className={`notif-row-title${unread ? " unread" : ""}`}>{title}</span>
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

          {/* Who, and about which request. */}
          {(actorName || metadata.requestTitle) && (
            <p className="notif-prop-line ellipsis">
              {actorName && <span className="notif-prop-actor">{actorName}</span>}
              {actorName && metadata.requestTitle && " · "}
              {metadata.requestTitle && <span>“{metadata.requestTitle}”</span>}
            </p>
          )}

          {(amount != null || metadata.paymentMethod || pill) && (
            <div className="notif-supporting-row">
              <AmountLine amount={amount} label={amountLabel} />
              {metadata.paymentMethod && (
                <span className="notif-category-chip">
                  <Wallet size={11} />
                  {metadata.paymentMethod}
                  {metadata.paymentRef && ` #${metadata.paymentRef}`}
                </span>
              )}
              {pill && <StatusPill label={pill} tone={metadata.tone ?? "brand"} />}
            </div>
          )}

          {/* The body text repeats the amount, so it shows only when there is no amount or message to show. */}
          {amount == null && !metadata.message && <p className="notif-prop-preview clamp-2">{preview}</p>}
        </div>
      </div>

      {metadata.message && (
        <div className="notif-prop-message-box">
          <p className="notif-prop-message-text">"{metadata.message}"</p>
        </div>
      )}

      {/* Action Toolbar */}
      {metadata.actions && metadata.actions.length > 0 && (
        <div className="notif-prop-actions">
          {metadata.actions.map((act) => {
            if (act === "ACCEPT_QUOTE") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-prop-btn notif-prop-btn-success"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Check size={14} />
                  <span>{t("notif_prop_accept_btn", "Accept Quote")}</span>
                </button>
              );
            }
            if (act === "ACCEPT_COUNTER") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-prop-btn notif-prop-btn-success"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Check size={14} />
                  <span>{t("notif_prop_accept_counter_btn", "Accept Counter")}</span>
                </button>
              );
            }
            if (act === "DECLINE_COUNTER") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-prop-btn notif-prop-btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.light();
                    onAction?.(act, metadata);
                  }}
                >
                  <X size={14} />
                  <span>{t("notif_prop_decline_btn", "Decline")}</span>
                </button>
              );
            }
            if (act === "COUNTER_QUOTE") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-prop-btn notif-prop-btn-warning"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.light();
                    onAction?.(act, metadata);
                  }}
                >
                  <Repeat size={14} />
                  <span>{t("notif_prop_counter_btn", "Counter")}</span>
                </button>
              );
            }
            if (act === "JOIN_DEAL") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-prop-btn notif-prop-btn-brand"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <ArrowRight size={14} />
                  <span>{t("notif_prop_join_btn", "Join Deal")}</span>
                </button>
              );
            }
            if (act === "CONFIRM_PAYMENT") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-prop-btn notif-prop-btn-success"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Check size={14} />
                  <span>{t("notif_prop_confirm_payment_btn", "Confirm Payment")}</span>
                </button>
              );
            }
            if (act === "REJECT_PAYMENT") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-prop-btn notif-prop-btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.light();
                    onAction?.(act, metadata);
                  }}
                >
                  <X size={14} />
                  <span>{t("notif_prop_reject_payment_btn", "Reject")}</span>
                </button>
              );
            }
            if (act === "PAY") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-prop-btn notif-prop-btn-brand"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Wallet size={14} />
                  <span>{t("pay", "Pay Now")}</span>
                </button>
              );
            }
            if (act === "VIEW_QUOTE") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-prop-btn notif-prop-btn-outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.light();
                    onAction?.(act, metadata);
                  }}
                >
                  <FileText size={14} />
                  <span>{t("notif_prop_view_quote_btn", "View Quote")}</span>
                </button>
              );
            }
            if (act === "VIEW_AGREEMENT") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-prop-btn notif-prop-btn-outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.light();
                    onAction?.(act, metadata);
                  }}
                >
                  <Handshake size={14} />
                  <span>{t("notif_prop_view_agreement_btn", "View Agreement")}</span>
                </button>
              );
            }
            if (act === "VIEW_REQUEST") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-prop-btn notif-prop-btn-outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.light();
                    onAction?.(act, metadata);
                  }}
                >
                  <MessageSquareText size={14} />
                  <span>{t("notif_prop_view_request_btn", "View Request")}</span>
                </button>
              );
            }
            if (act === "SEND_QUOTE") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-prop-btn notif-prop-btn-brand"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.light();
                    onAction?.(act, metadata);
                  }}
                >
                  <FileText size={14} />
                  <span>{t("notif_prop_send_quote_btn", "Send Quote")}</span>
                </button>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}
