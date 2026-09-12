import React from "react";
import {
  Star,
  MessageSquareText,
  Shield,
  Store,
  Trash2,
  CheckCircle2,
} from "@/components/Icons";
import { SafeImg } from "@/components/common";
import { toneColor, toneBg } from "@/components/NotificationContent";
import type { NotificationMetadata, NotificationType } from "@/types";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";

interface TrustNotificationCardProps {
  type?: NotificationType;
  metadata: NotificationMetadata;
  title: string;
  preview: string;
  time: string;
  unread: boolean;
  onAction?: (action: string, metadata: NotificationMetadata) => void;
  onDelete?: () => void;
}

export default function TrustNotificationCard({
  type,
  metadata,
  title,
  preview,
  time,
  unread,
  onAction,
  onDelete,
}: TrustNotificationCardProps) {
  const { t } = useI18n();
  const actions = metadata.actions || [];
  const isRating = type === "RATING";
  const isRatingReply = type === "RATING_REPLY";
  const isReport = type === "REPORT_RESOLVED";
  const isAdminQueue = type === "ADMIN_REVIEW_QUEUE";

  const ratingScore = metadata.rating ?? 5;

  return (
    <div className={`notif-trust-card${isAdminQueue ? " notif-trust-card-admin" : ""}`}>
      <div className="notif-trust-header">
        {/* Leading Visual */}
        <div className="notif-trust-leading">
          {metadata.avatarUrl ? (
            <div className="notif-row-icon notif-row-avatar-wrap">
              <SafeImg src={metadata.avatarUrl} variant="avatar" className="notif-avatar-img" />
              {isRating && (
                <span className="notif-trust-corner-badge" style={{ background: "var(--amber-500)" }}>
                  <Star size={10} color="#fff" />
                </span>
              )}
              {isRatingReply && (
                <span className="notif-trust-corner-badge" style={{ background: "var(--brand-600)" }}>
                  <MessageSquareText size={10} color="#fff" />
                </span>
              )}
            </div>
          ) : (
            <div
              className="notif-trust-icon-wrap"
              style={{ background: toneBg(metadata.tone) }}
            >
              {isRating ? (
                <Star size={20} color={toneColor(metadata.tone) || "var(--amber-500)"} />
              ) : isRatingReply ? (
                <MessageSquareText size={20} color={toneColor(metadata.tone) || "var(--brand-600)"} />
              ) : (
                <Shield size={20} color={toneColor(metadata.tone) || "var(--brand-700)"} />
              )}
            </div>
          )}
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
        </div>

        {/* Text & Meta */}
        <div className="notif-trust-meta">
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

          <p className="notif-trust-preview clamp-2">{preview}</p>

          {/* Status Pill */}
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

      {/* Star Rating Breakdown for RATING */}
      {isRating && metadata.rating != null && (
        <div className="notif-trust-rating-box">
          <div className="notif-trust-stars-row">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                size={14}
                color={star <= ratingScore ? "var(--amber-500)" : "var(--ink-200)"}
                style={{ fill: star <= ratingScore ? "var(--amber-500)" : "transparent" }}
              />
            ))}
            <span className="notif-trust-stars-label">{ratingScore}.0</span>
          </div>
          {metadata.comment && (
            <p className="notif-trust-comment-text">"{metadata.comment}"</p>
          )}
        </div>
      )}

      {/* Owner Reply Block for RATING_REPLY */}
      {isRatingReply && metadata.replyText && (
        <div className="notif-trust-reply-box">
          <div className="notif-trust-reply-header">
            <MessageSquareText size={12} color="var(--brand-600)" />
            <span className="notif-trust-reply-label">{t("notif_trust_owner_reply_label")}</span>
          </div>
          <p className="notif-trust-reply-text">"{metadata.replyText}"</p>
        </div>
      )}

      {/* Admin Review / Business Card for ADMIN_REVIEW_QUEUE */}
      {isAdminQueue && metadata.businessName && (
        <div className="notif-trust-admin-box">
          <div className="notif-trust-admin-title">{metadata.businessName}</div>
          {metadata.category && (
            <div className="notif-trust-admin-category">{metadata.category}</div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {actions.length > 0 && onAction && (
        <div className="notif-trust-actions" onClick={(e) => e.stopPropagation()}>
          {actions.includes("REPLY_RATING") && (
            <button
              type="button"
              className="notif-trust-btn notif-trust-btn-reply"
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                onAction("REPLY_RATING", metadata);
              }}
            >
              <MessageSquareText size={14} />
              <span>{t("notif_trust_reply_btn")}</span>
            </button>
          )}

          {actions.includes("VIEW_REVIEW") && (
            <button
              type="button"
              className="notif-trust-btn notif-trust-btn-view"
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                onAction("VIEW_REVIEW", metadata);
              }}
            >
              <Star size={14} />
              <span>{t("notif_trust_view_review_btn")}</span>
            </button>
          )}

          {actions.includes("VIEW_STORE") && (
            <button
              type="button"
              className="notif-trust-btn notif-trust-btn-store"
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                onAction("VIEW_STORE", metadata);
              }}
            >
              <Store size={14} />
              <span>{t("notif_trust_view_store_btn")}</span>
            </button>
          )}

          {actions.includes("REVIEW_BUSINESS") && (
            <button
              type="button"
              className="notif-trust-btn notif-trust-btn-admin"
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                onAction("REVIEW_BUSINESS", metadata);
              }}
            >
              <Shield size={14} />
              <span>{t("notif_trust_review_admin_btn")}</span>
            </button>
          )}

          {actions.includes("VIEW_REPORT_TARGET") && (
            <button
              type="button"
              className="notif-trust-btn notif-trust-btn-view"
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                onAction("VIEW_REPORT_TARGET", metadata);
              }}
            >
              <CheckCircle2 size={14} />
              <span>{t("notif_trust_view_target_btn")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
