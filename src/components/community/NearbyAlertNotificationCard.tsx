import React from "react";
import {
  Megaphone,
  AlertTriangle,
  Info,
  MapPin,
  Share2,
  Eye,
  Trash2,
} from "@/components/Icons";
import type { NotificationMetadata } from "@/types";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";

interface NearbyAlertNotificationCardProps {
  metadata: NotificationMetadata;
  title: string;
  preview: string;
  time: string;
  unread: boolean;
  onAction?: (action: string, metadata: NotificationMetadata) => void;
  onDelete?: () => void;
}

export default function NearbyAlertNotificationCard({
  metadata,
  title,
  preview,
  time,
  unread,
  onAction,
  onDelete,
}: NearbyAlertNotificationCardProps) {
  const { t, tf } = useI18n();
  const severity = metadata.severity || "INFO";
  const actions = metadata.actions || ["VIEW_POST", "SHARE_ALERT"];

  const isUrgent = severity === "URGENT";
  const isWarning = severity === "WARNING";
  // Shown translated, not as the raw database value ("URGENT", "INFO").
  const severityLabel = isUrgent ? t("notif_alert_urgent") : isWarning ? t("notif_alert_warning") : t("notif_alert_notice");

  return (
    <div
      className={`notif-alert-card ${
        isUrgent
          ? "notif-alert-card-urgent"
          : isWarning
          ? "notif-alert-card-warning"
          : "notif-alert-card-info"
      }`}
    >
      {/* Top Header: Warning Icon + Title + Time + Quick Delete */}
      <div className="notif-alert-header">
        <div className="notif-alert-leading">
          <div
            className={`notif-alert-icon-wrap ${
              isUrgent
                ? "notif-alert-icon-wrap-urgent"
                : isWarning
                ? "notif-alert-icon-wrap-warning"
                : "notif-alert-icon-wrap-info"
            }`}
          >
            {isUrgent ? (
              <AlertTriangle size={18} color="var(--red-600)" />
            ) : isWarning ? (
              <Megaphone size={18} color="var(--amber-700)" />
            ) : (
              <Info size={18} color="var(--brand-700)" />
            )}
            {isUrgent && <span className="notif-alert-pulse-dot" aria-hidden="true" />}
          </div>
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
        </div>

        <div className="notif-alert-meta">
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

          {/* Severity & Area location tags */}
          <div className="notif-alert-tags">
            <span
              className={`notif-alert-badge ${
                isUrgent
                  ? "notif-alert-badge-urgent"
                  : isWarning
                  ? "notif-alert-badge-warning"
                  : "notif-alert-badge-info"
              }`}
            >
              {severityLabel}
            </span>

            {metadata.area && (
              <span className="notif-alert-area-tag">
                <MapPin size={11} color="var(--ink-500)" style={{ flexShrink: 0 }} />
                <span>{metadata.area}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Alert Body / Headline */}
      <div className="notif-alert-body-box">
        <p className="notif-alert-preview">{preview}</p>
        {metadata.actorName && (
          <span className="notif-alert-author">
            {tf("notif_alert_posted_by", { name: metadata.actorName })}
          </span>
        )}
      </div>

      {/* Action Buttons Bar */}
      {actions.length > 0 && onAction && (
        <div className="notif-alert-actions" onClick={(e) => e.stopPropagation()}>
          {actions.includes("VIEW_POST") && (
            <button
              type="button"
              className={`notif-alert-btn ${
                isUrgent ? "notif-alert-btn-urgent" : "notif-alert-btn-view"
              }`}
              onClick={() => {
                haptics.light();
                onAction("VIEW_POST", metadata);
              }}
            >
              <Eye size={13} />
              <span>{t("notif_comm_view_post")}</span>
            </button>
          )}

          {actions.includes("SHARE_ALERT") && (
            <button
              type="button"
              className="notif-alert-btn notif-alert-btn-share"
              onClick={() => {
                haptics.light();
                onAction("SHARE_ALERT", metadata);
              }}
            >
              <Share2 size={13} />
              <span>{t("notif_comm_share_alert")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
