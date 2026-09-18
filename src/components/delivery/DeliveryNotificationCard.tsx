import React, { useState } from "react";
import {
  Package,
  MapPin,
  Store,
  Phone,
  ArrowRight,
  Copy,
  Check,
  X,
  Navigation,
  Trash2,
  KeyRound,
  RotateCcw,
} from "@/components/Icons";
import { SafeImg } from "@/components/common";
import { StatusPill } from "@/components/NotificationContent";
import { distinctPill } from "@/lib/notificationCard";
import type { NotificationMetadata } from "@/types";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";

interface DeliveryNotificationCardProps {
  metadata: NotificationMetadata;
  title: string;
  preview: string;
  time: string;
  unread: boolean;
  onAction?: (action: string, metadata: NotificationMetadata) => void;
  onDelete?: () => void;
}

/**
 * Formats a 4- or 6-digit OTP code into spaced chunks for instant readability
 * (e.g. "549201" -> "549 201").
 */
function formatOtp(code?: string): string {
  if (!code) return "";
  const clean = code.trim();
  if (clean.length === 6) {
    return `${clean.slice(0, 3)} ${clean.slice(3)}`;
  }
  if (clean.length === 4) {
    return `${clean.slice(0, 2)} ${clean.slice(2)}`;
  }
  return clean;
}

export default function DeliveryNotificationCard({
  metadata,
  title,
  preview,
  time,
  unread,
  onAction,
  onDelete,
}: DeliveryNotificationCardProps) {
  const { t } = useI18n();
  const pill = distinctPill(title, metadata.statusPill);
  const [copied, setCopied] = useState(false);

  const actions = metadata.actions || [];
  const isArrived = metadata.statusPill === "Arrived";
  const isEnRoute = metadata.statusPill === "En Route" || metadata.statusPill === "On the way";
  const formattedOtp = formatOtp(metadata.handoffCode);

  function copyOtp(e: React.MouseEvent) {
    e.stopPropagation();
    if (!metadata.handoffCode) return;
    haptics.light();
    navigator.clipboard.writeText(metadata.handoffCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (onAction) {
      onAction("COPY_OTP", metadata);
    }
  }

  return (
    <div className="notif-dlv-card">
      {/* Top Header: Courier / Van Tile + Title + Time */}
      <div className="notif-dlv-header">
        <div className="notif-dlv-leading">
          {metadata.avatarUrl ? (
            <div className="notif-row-icon notif-row-avatar-wrap">
              <SafeImg src={metadata.avatarUrl} variant="avatar" className="notif-avatar-img" />
              {isArrived && <span className="notif-dlv-beacon-dot" aria-hidden="true" />}
            </div>
          ) : isArrived ? (
            <div className="notif-dlv-icon-wrap notif-dlv-icon-wrap-arrived">
              <Navigation size={18} color="var(--delivery-600)" />
              <span className="notif-dlv-beacon-dot" aria-hidden="true" />
            </div>
          ) : isEnRoute ? (
            <div className="notif-dlv-icon-wrap notif-dlv-icon-wrap-enroute">
              <Package size={18} color="var(--delivery-600)" />
            </div>
          ) : (
            <div className="notif-dlv-icon-wrap">
              <Package size={18} color="var(--delivery-600)" />
            </div>
          )}
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
        </div>

        <div className="notif-dlv-meta">
          <div className="notif-row-top">
            <span className={`notif-row-title${unread ? " unread" : ""}`}>
              {metadata.agentName ? `${metadata.agentName} • ${title}` : title}
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

          <p className="notif-dlv-preview clamp-2">{preview}</p>
        </div>
      </div>

      {/* Prominent OTP Security Pill (if active handoff code available) */}
      {formattedOtp && (
        <div
          role="button"
          tabIndex={0}
          className="notif-dlv-otp-box"
          onClick={copyOtp}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") copyOtp(e as any);
          }}
          aria-label="Copy doorstep handoff OTP"
        >
          <div className="notif-dlv-otp-left">
            <KeyRound size={15} color="var(--delivery-600)" />
            <span className="notif-dlv-otp-title">{t("notif_dlv_otp_label")}</span>
          </div>
          <div className="notif-dlv-otp-right">
            <span className="notif-dlv-otp-code">{formattedOtp}</span>
            <button
              type="button"
              className="notif-dlv-otp-copy-btn"
              onClick={copyOtp}
              aria-label="Copy OTP"
            >
              {copied ? (
                <Check size={14} color="var(--green-700)" />
              ) : (
                <Copy size={14} color="var(--delivery-600)" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Route & Delivery Detail Box */}
      {(metadata.pickupAddress || metadata.dropoffAddress || metadata.stopCount || metadata.statusPill) && (
        <div className="notif-dlv-route-box">
          {(metadata.pickupAddress || metadata.dropoffAddress) && (
            <div className="notif-dlv-route-row">
              {metadata.pickupAddress && (
                <div className="notif-dlv-route-point">
                  <Store size={12} color="var(--ink-500)" style={{ flexShrink: 0 }} />
                  <span className="notif-dlv-route-text" title={metadata.pickupAddress}>
                    {metadata.pickupAddress}
                  </span>
                </div>
              )}

              {metadata.pickupAddress && metadata.dropoffAddress && (
                <ArrowRight size={11} color="var(--ink-400)" style={{ flexShrink: 0 }} />
              )}

              {metadata.dropoffAddress && (
                <div className="notif-dlv-route-point">
                  <MapPin size={12} color="var(--delivery-600)" style={{ flexShrink: 0 }} />
                  <span className="notif-dlv-route-text" title={metadata.dropoffAddress}>
                    {metadata.dropoffAddress}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Status & ETA strip */}
          <div className="notif-dlv-status-row">
            {metadata.stopCount != null && metadata.stopCount > 0 && (
              <span className="notif-dlv-badge">
                <Package size={11} />
                {metadata.stopCount} {t("notif_dlv_stops")}
              </span>
            )}

            {metadata.etaText && (
              <span className="notif-dlv-eta-text">
                {metadata.etaText}
              </span>
            )}

            {pill && <StatusPill label={pill} tone={metadata.tone} style={{ marginLeft: "auto" }} />}
          </div>

          {/* Cancellation / Issue note if present */}
          {(metadata.cancelReason || metadata.cancelNote) && (
            <div className="notif-dlv-cancel-note">
              {metadata.cancelReason && (
                <span className="notif-dlv-cancel-reason">
                  {metadata.cancelReason.replace(/_/g, " ")}
                </span>
              )}
              {metadata.cancelNote && (
                <span className="notif-dlv-cancel-text">
                  — {metadata.cancelNote}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons Bar */}
      {actions.length > 0 && onAction && (
        <div className="notif-dlv-actions" onClick={(e) => e.stopPropagation()}>
          {actions.includes("ACCEPT_DELIVERY") && (
            <button
              type="button"
              className="notif-dlv-btn notif-dlv-btn-accept"
              onClick={() => {
                haptics.light();
                onAction("ACCEPT_DELIVERY", metadata);
              }}
            >
              <Check size={14} />
              <span>{t("notif_dlv_accept")}</span>
            </button>
          )}

          {actions.includes("DECLINE_DELIVERY") && (
            <button
              type="button"
              className="notif-dlv-btn notif-dlv-btn-decline"
              onClick={() => {
                haptics.light();
                onAction("DECLINE_DELIVERY", metadata);
              }}
            >
              <X size={14} />
              <span>{t("notif_dlv_decline")}</span>
            </button>
          )}

          {actions.includes("TRACK_DELIVERY") && (
            <button
              type="button"
              className="notif-dlv-btn notif-dlv-btn-track"
              onClick={() => {
                haptics.light();
                onAction("TRACK_DELIVERY", metadata);
              }}
            >
              <Navigation size={13} />
              <span>{t("notif_dlv_track")}</span>
            </button>
          )}

          {actions.includes("CALL_RIDER") && (
            <button
              type="button"
              className="notif-dlv-btn notif-dlv-btn-call"
              onClick={() => {
                haptics.light();
                onAction("CALL_RIDER", metadata);
              }}
            >
              <Phone size={13} />
              <span>{t("notif_dlv_call_rider")}</span>
            </button>
          )}

          {actions.includes("CALL_CUSTOMER") && (
            <button
              type="button"
              className="notif-dlv-btn notif-dlv-btn-call"
              onClick={() => {
                haptics.light();
                onAction("CALL_CUSTOMER", metadata);
              }}
            >
              <Phone size={13} />
              <span>Call Customer</span>
            </button>
          )}

          {actions.includes("REASSIGN_DELIVERY") && (
            <button
              type="button"
              className="notif-dlv-btn notif-dlv-btn-reassign"
              onClick={() => {
                haptics.light();
                onAction("REASSIGN_DELIVERY", metadata);
              }}
            >
              <RotateCcw size={13} />
              <span>{t("notif_dlv_reassign")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
