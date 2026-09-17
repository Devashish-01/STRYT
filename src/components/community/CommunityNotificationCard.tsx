import React from "react";
import {
  Heart,
  MessageSquare,
  Star,
  CheckCircle2,
  ChartBar,
  At,
  Store,
  Briefcase,
  Trash2,
  Eye,
} from "@/components/Icons";
import { SafeImg } from "@/components/common";
import { toneColor, toneBg } from "@/lib/notificationTone";
import type { NotificationMetadata, NotificationType } from "@/types";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";

interface CommunityNotificationCardProps {
  type: NotificationType;
  metadata: NotificationMetadata;
  title: string;
  preview: string;
  time: string;
  unread: boolean;
  onAction?: (action: string, metadata: NotificationMetadata) => void;
  onDelete?: () => void;
}

function getBadgeIcon(type: NotificationType) {
  switch (type) {
    case "COMMUNITY_LIKE":
      return <Heart size={10} color="#fff" weight="fill" />;
    case "COMMUNITY_COMMENT":
    case "COMMUNITY_REPLY":
      return <MessageSquare size={10} color="#fff" weight="fill" />;
    case "COMMUNITY_RECOMMENDATION":
      return <Star size={10} color="#fff" weight="fill" />;
    case "COMMUNITY_RESOLVED":
      return <CheckCircle2 size={10} color="#fff" weight="fill" />;
    case "COMMUNITY_POLL_ENDED":
      return <ChartBar size={10} color="#fff" weight="fill" />;
    case "COMMUNITY_MENTION":
      return <At size={10} color="#fff" weight="fill" />;
    default:
      return null;
  }
}

function getBadgeBg(type: NotificationType) {
  switch (type) {
    case "COMMUNITY_LIKE":
      return "var(--red-500)";
    case "COMMUNITY_COMMENT":
    case "COMMUNITY_REPLY":
    case "COMMUNITY_MENTION":
      return "var(--brand-600)";
    case "COMMUNITY_RECOMMENDATION":
      return "var(--amber-500)";
    case "COMMUNITY_RESOLVED":
      return "var(--green-600)";
    case "COMMUNITY_POLL_ENDED":
      return "var(--blue-500)";
    default:
      return "var(--brand-600)";
  }
}

export default function CommunityNotificationCard({
  type,
  metadata,
  title,
  preview,
  time,
  unread,
  onAction,
  onDelete,
}: CommunityNotificationCardProps) {
  const { t } = useI18n();
  const actions = metadata.actions || [];
  const isStory = type === "STORY_REACTION";
  const badgeIcon = getBadgeIcon(type);
  const badgeBg = getBadgeBg(type);

  return (
    <div className="notif-comm-card">
      <div className="notif-comm-header">
        {/* Leading Visual with Corner Badge */}
        <div className="notif-comm-leading">
          {isStory && metadata.imageUrl ? (
            <div className="notif-comm-story-thumb-wrap">
              <SafeImg src={metadata.imageUrl} variant="photo" className="notif-comm-story-img" />
              {metadata.emoji && (
                <span className="notif-comm-emoji-overlay">{metadata.emoji}</span>
              )}
            </div>
          ) : metadata.avatarUrl ? (
            <div className="notif-row-icon notif-row-avatar-wrap">
              <SafeImg src={metadata.avatarUrl} variant="avatar" className="notif-avatar-img" />
              {badgeIcon && (
                <span className="notif-comm-corner-badge" style={{ background: badgeBg }}>
                  {badgeIcon}
                </span>
              )}
            </div>
          ) : (
            <div className="notif-comm-icon-wrap" style={{ background: toneBg(metadata.tone) }}>
              {badgeIcon ? (
                <span style={{ display: "flex" }}>{badgeIcon}</span>
              ) : (
                <MessageSquare size={18} color="var(--brand-700)" />
              )}
            </div>
          )}
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
        </div>

        {/* Text & Meta */}
        <div className="notif-comm-meta">
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

          {/* Comment / Reply Preview Quote */}
          <div className="notif-comm-quote-bubble">
            <p className="notif-comm-preview clamp-2">{preview}</p>
          </div>

          {/* Recommended Entity Chip if recommendation */}
          {metadata.recommendedName && (
            <div className="notif-comm-rec-pill">
              {metadata.recommendedType === "BUSINESS" ? (
                <Store size={12} color="var(--amber-700)" />
              ) : (
                <Briefcase size={12} color="var(--amber-700)" />
              )}
              <span className="notif-comm-rec-name">{metadata.recommendedName}</span>
            </div>
          )}

          {/* Status pill (e.g. "Resolved") */}
          {metadata.statusPill && (
            <div style={{ marginTop: 4 }}>
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

      {/* Action Buttons */}
      {actions.length > 0 && onAction && (
        <div className="notif-comm-actions" onClick={(e) => e.stopPropagation()}>
          {actions.includes("REPLY_COMMENT") && (
            <button
              type="button"
              className="notif-comm-btn notif-comm-btn-reply"
              onClick={() => {
                haptics.light();
                onAction("REPLY_COMMENT", metadata);
              }}
            >
              <MessageSquare size={13} />
              <span>{t("notif_comm_reply")}</span>
            </button>
          )}

          {actions.includes("VIEW_RECOMMENDED") && (
            <button
              type="button"
              className="notif-comm-btn notif-comm-btn-rec"
              onClick={() => {
                haptics.light();
                onAction("VIEW_RECOMMENDED", metadata);
              }}
            >
              <Store size={13} />
              <span>{t("notif_comm_view_place")}</span>
            </button>
          )}

          {actions.includes("VIEW_POST") && (
            <button
              type="button"
              className="notif-comm-btn notif-comm-btn-view"
              onClick={() => {
                haptics.light();
                onAction("VIEW_POST", metadata);
              }}
            >
              <Eye size={13} />
              <span>{t("notif_comm_view_post")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
