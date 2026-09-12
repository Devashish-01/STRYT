import { type ReactNode } from "react";
import { FileText, HandshakeIcon, Megaphone, MessageSquareText, Check, X, Repeat, Wallet, ArrowRight } from "@/components/Icons";
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

export default function ProposalNotificationCard({
  type,
  metadata,
  title,
  preview,
  time,
  unread,
  onAction,
}: ProposalNotificationCardProps) {
  const { t } = useI18n();

  const isProposal = type === "PROPOSAL";
  const isCounter = type === "PROPOSAL_COUNTER";
  const isBroadcast = type === "QUOTE_BROADCAST";
  const isAgreement = type === "AGREEMENT";
  const isNearbyRequest = type === "NEARBY_REQUEST";

  const typeLabel = isCounter
    ? t("notif_prop_counter_label", "Counter-Offer")
    : isBroadcast
    ? t("notif_prop_broadcast_label", "Group Quote")
    : isAgreement
    ? t("notif_prop_agreement_label", "Agreement")
    : isNearbyRequest
    ? t("notif_prop_request_label", "Nearby Need")
    : t("notif_prop_quote_label", "Quote Received");

  const typeIcon: ReactNode = isCounter ? (
    <Repeat size={12} weight="bold" />
  ) : isBroadcast ? (
    <Megaphone size={12} weight="fill" />
  ) : isAgreement ? (
    <Handshake size={12} weight="fill" />
  ) : isNearbyRequest ? (
    <MessageSquareText size={12} weight="fill" />
  ) : (
    <FileText size={12} weight="fill" />
  );

  const actorName =
    metadata.actorName ||
    metadata.proposerName ||
    (isAgreement ? t("notif_prop_deal_partner", "Deal Partner") : t("provider", "Provider"));

  const targetTitle = metadata.requestTitle || title;
  const avatarUrl = metadata.avatarUrl || metadata.proposerAvatar;
  const amount = metadata.amount ?? metadata.quotedPrice ?? metadata.counterPrice ?? metadata.agreedPrice;
  const amountLabel =
    metadata.amountLabel ||
    (isCounter
      ? t("notif_prop_counter_price", "Counter-offer")
      : isAgreement
      ? t("notif_prop_agreed_price", "Agreed Price")
      : t("notif_prop_quoted_price", "Quoted Price"));

  const statusPill =
    metadata.statusPill ||
    (isCounter
      ? t("notif_prop_pill_counter", "Awaiting Decision")
      : isAgreement
      ? t("notif_prop_pill_active", "Active")
      : t("notif_prop_pill_quote", "New Quote"));

  const toneClass = metadata.tone ? `notif-prop-pill-${metadata.tone}` : "notif-prop-pill-brand";

  return (
    <div className={`notif-prop-card${unread ? " notif-prop-unread" : ""}`}>
      {/* Top Meta Bar */}
      <div className="notif-prop-top-bar">
        <div className="notif-prop-badge-row">
          <span className={`notif-prop-type-pill notif-prop-type-${type.toLowerCase()}`}>
            {typeIcon}
            <span>{typeLabel}</span>
          </span>
          <span className={`notif-prop-status-pill ${toneClass}`}>{statusPill}</span>
        </div>
        <div className="notif-prop-time-row">
          <span className="notif-prop-time">{time}</span>
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
        </div>
      </div>

      {/* Main Party & Request Info */}
      <div className="notif-prop-main">
        {avatarUrl ? (
          <img src={avatarUrl} alt={actorName} className="notif-prop-avatar" />
        ) : (
          <div className={`notif-prop-avatar-fallback notif-prop-fallback-${type.toLowerCase()}`}>
            {typeIcon}
          </div>
        )}

        <div className="notif-prop-info">
          <div className="notif-prop-actor-row">
            <span className="notif-prop-actor">{actorName}</span>
          </div>
          <span className="notif-prop-request-title">
            {t("notif_prop_on_prefix", "On")}: "{targetTitle}"
          </span>
        </div>
      </div>

      {/* Bargain / Quotation Voucher Box */}
      {amount != null && (
        <div className={`notif-prop-voucher${isCounter ? " notif-prop-voucher-counter" : ""}`}>
          <div className="notif-prop-voucher-left">
            <span className="notif-prop-amount-label">{amountLabel}</span>
            <div className="notif-prop-amount-val">
              <span className="notif-prop-currency">₹</span>
              <span className="notif-prop-num">{amount.toLocaleString("en-IN")}</span>
            </div>
          </div>

          {metadata.paymentMethod && (
            <div className="notif-prop-payment-method">
              <Wallet size={12} />
              <span>{metadata.paymentMethod}</span>
              {metadata.paymentRef && (
                <span className="notif-prop-payment-ref">#{metadata.paymentRef}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Message Note Bubble */}
      {metadata.message && (
        <div className="notif-prop-message-box">
          <p className="notif-prop-message-text">"{metadata.message}"</p>
        </div>
      )}

      {/* Fallback Preview if no price or message */}
      {amount == null && !metadata.message && (
        <p className="notif-prop-preview">{preview}</p>
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
