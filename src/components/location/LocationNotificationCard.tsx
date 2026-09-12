import React from "react";
import {
  MapPin,
  CheckCircle2,
  XCircle,
  Navigation,
  MessageCircle,
  Shield,
  Trash2,
  Lock,
} from "@/components/Icons";
import { SafeImg } from "@/components/common";
import { toneColor, toneBg } from "@/components/NotificationContent";
import type { NotificationMetadata, NotificationType } from "@/types";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";

interface LocationNotificationCardProps {
  type?: NotificationType;
  metadata: NotificationMetadata;
  title: string;
  preview: string;
  time: string;
  unread: boolean;
  onAction?: (action: string, metadata: NotificationMetadata) => void;
  onDelete?: () => void;
}

export default function LocationNotificationCard({
  type,
  metadata,
  title,
  preview,
  time,
  unread,
  onAction,
  onDelete,
}: LocationNotificationCardProps) {
  const { t } = useI18n();
  const actions = metadata.actions || [];
  const isLive = type === "LIVE_LOCATION";
  const isRequest = type === "LOCATION_REQUEST";
  const isApproved = type === "LOCATION_APPROVED";
  const isDeniedOrRevoked = type === "LOCATION_DENIED" || type === "LOCATION_REVOKED";

  return (
    <div className={`notif-loc-card${isLive ? " notif-loc-card-live" : ""}`}>
      <div className="notif-loc-header">
        {/* Leading Visual */}
        <div className="notif-loc-leading">
          {metadata.avatarUrl ? (
            <div className="notif-row-icon notif-row-avatar-wrap">
              <SafeImg src={metadata.avatarUrl} variant="avatar" className="notif-avatar-img" />
              {isRequest && (
                <span className="notif-loc-corner-badge" style={{ background: "var(--amber-500)" }}>
                  <Lock size={10} color="#fff" />
                </span>
              )}
              {isApproved && (
                <span className="notif-loc-corner-badge" style={{ background: "var(--green-600)" }}>
                  <CheckCircle2 size={10} color="#fff" />
                </span>
              )}
              {isLive && (
                <span className="notif-loc-corner-badge" style={{ background: "var(--green-600)" }}>
                  <Navigation size={10} color="#fff" />
                </span>
              )}
              {isDeniedOrRevoked && (
                <span className="notif-loc-corner-badge" style={{ background: "var(--ink-500)" }}>
                  <XCircle size={10} color="#fff" />
                </span>
              )}
            </div>
          ) : (
            <div
              className={`notif-loc-icon-wrap${isLive ? " notif-loc-icon-wrap-live" : ""}`}
              style={{ background: toneBg(metadata.tone) }}
            >
              {isLive && <span className="notif-loc-pulse-ring" aria-hidden="true" />}
              {isLive ? (
                <Navigation size={20} color="var(--green-600)" />
              ) : isApproved ? (
                <CheckCircle2 size={20} color="var(--green-600)" />
              ) : isDeniedOrRevoked ? (
                <XCircle size={20} color="var(--ink-500)" />
              ) : isRequest ? (
                <Lock size={20} color="var(--amber-600)" />
              ) : (
                <MapPin size={20} color={toneColor(metadata.tone) || "var(--brand-700)"} />
              )}
            </div>
          )}
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
        </div>

        {/* Text & Meta */}
        <div className="notif-loc-meta">
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

          <p className="notif-loc-preview clamp-2">{preview}</p>

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

      {/* Live Location Streaming Callout */}
      {isLive && (
        <div className="notif-loc-live-box">
          <div className="notif-loc-live-header">
            <span className="notif-loc-live-dot" aria-hidden="true" />
            <span className="notif-loc-live-title">{t("notif_loc_live_broadcasting")}</span>
            {metadata.lat != null && metadata.lng != null && (
              <span className="notif-loc-coords-chip">
                {metadata.lat.toFixed(3)}°, {metadata.lng.toFixed(3)}°
              </span>
            )}
          </div>
          <p className="notif-loc-live-subtitle">
            {t("notif_loc_live_hint")}
          </p>
        </div>
      )}

      {/* Privacy Notice for Inbound Request */}
      {isRequest && (
        <div className="notif-loc-privacy-box">
          <Shield size={13} color="var(--amber-700)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{t("notif_loc_privacy_disclaimer")}</span>
        </div>
      )}

      {/* Action Buttons */}
      {actions.length > 0 && onAction && (
        <div className="notif-loc-actions" onClick={(e) => e.stopPropagation()}>
          {actions.includes("APPROVE_LOCATION") && (
            <button
              type="button"
              className="notif-loc-btn notif-loc-btn-approve"
              onClick={() => {
                haptics.light();
                onAction("APPROVE_LOCATION", metadata);
              }}
            >
              <CheckCircle2 size={14} />
              <span>{t("notif_loc_approve_24h")}</span>
            </button>
          )}

          {actions.includes("DECLINE_LOCATION") && (
            <button
              type="button"
              className="notif-loc-btn notif-loc-btn-decline"
              onClick={() => {
                haptics.light();
                onAction("DECLINE_LOCATION", metadata);
              }}
            >
              <XCircle size={14} />
              <span>{t("notif_loc_decline")}</span>
            </button>
          )}

          {actions.includes("VIEW_ON_MAP") && (
            <button
              type="button"
              className="notif-loc-btn notif-loc-btn-map"
              onClick={() => {
                haptics.light();
                onAction("VIEW_ON_MAP", metadata);
              }}
            >
              <Navigation size={14} />
              <span>{t("notif_loc_view_map")}</span>
            </button>
          )}

          {actions.includes("TRACK_LIVE") && (
            <button
              type="button"
              className="notif-loc-btn notif-loc-btn-track"
              onClick={() => {
                haptics.light();
                onAction("TRACK_LIVE", metadata);
              }}
            >
              <Navigation size={14} />
              <span>{t("notif_loc_track_live")}</span>
            </button>
          )}

          {actions.includes("OPEN_CHAT") && (
            <button
              type="button"
              className="notif-loc-btn notif-loc-btn-chat"
              onClick={() => {
                haptics.light();
                onAction("OPEN_CHAT", metadata);
              }}
            >
              <MessageCircle size={14} />
              <span>{t("notif_loc_open_chat")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
