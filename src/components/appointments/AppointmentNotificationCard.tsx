import React, { useMemo } from "react";
import { Calendar, Clock, Check, X, Users, MapPin, ArrowRight, Trash2 } from "@/components/Icons";
import { SafeImg } from "@/components/common";
import { inr } from "@/lib/format";
import { toneColor, toneBg } from "@/lib/notificationTone";
import type { NotificationMetadata } from "@/types";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";

interface AppointmentNotificationCardProps {
  metadata: NotificationMetadata;
  title: string;
  preview: string;
  time: string;
  unread: boolean;
  onAction?: (action: string, metadata: NotificationMetadata) => void;
  onDelete?: () => void;
}

/**
 * Parses date info to generate a calendar date tile (Month + Day).
 */
function parseDateTile(scheduledFor?: string, dateLabel?: string): { month: string; day: string } | null {
  if (scheduledFor) {
    const d = new Date(scheduledFor);
    if (!isNaN(d.getTime())) {
      const month = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
      const day = String(d.getDate());
      return { month, day };
    }
  }
  if (dateLabel) {
    // Try matching formats like "12 Sep", "Sep 12", "12/09"
    const match = dateLabel.match(/(\d{1,2})\s+([A-Za-z]{3,})/i) || dateLabel.match(/([A-Za-z]{3,})\s+(\d{1,2})/i);
    if (match) {
      const isNumFirst = !isNaN(Number(match[1]));
      const day = isNumFirst ? match[1] : match[2];
      const month = (isNumFirst ? match[2] : match[1]).slice(0, 3).toUpperCase();
      return { month, day };
    }
  }
  return null;
}

export default function AppointmentNotificationCard({
  metadata,
  title,
  preview,
  time,
  unread,
  onAction,
  onDelete,
}: AppointmentNotificationCardProps) {
  const { t } = useI18n();

  const dateTile = useMemo(
    () => parseDateTile(metadata.scheduledFor, metadata.dateLabel),
    [metadata.scheduledFor, metadata.dateLabel]
  );

  const isRescheduled = Boolean(metadata.originalTimeLabel && metadata.timeLabel);
  const actions = metadata.actions || [];

  return (
    <div className="notif-apt-card">
      {/* Top Header: Tile + Title + Time */}
      <div className="notif-apt-header">
        <div className="notif-apt-leading">
          {dateTile ? (
            <div className="notif-apt-date-tile" aria-hidden="true">
              <div className="notif-apt-date-month">{dateTile.month}</div>
              <div className="notif-apt-date-day">{dateTile.day}</div>
            </div>
          ) : metadata.avatarUrl ? (
            <div className="notif-row-icon notif-row-avatar-wrap">
              <SafeImg src={metadata.avatarUrl} variant="avatar" className="notif-avatar-img" />
            </div>
          ) : (
            <div className="notif-apt-icon-wrap">
              <Calendar size={18} color="var(--brand-700)" />
            </div>
          )}
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
        </div>

        <div className="notif-apt-meta">
          <div className="notif-row-top">
            <span className={`notif-row-title${unread ? " unread" : ""}`}>
              {metadata.actorName ? `${metadata.actorName} • ${title}` : title}
            </span>
            <span className="notif-row-time-slot">
              <span className="notif-row-time">{time}</span>
              {onDelete && (
                <button
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

          {/* Service & Price */}
          <div className="notif-apt-service-line">
            <span className="notif-apt-service-name">
              {metadata.serviceName || preview}
            </span>
            {metadata.amount != null && (
              <span className="notif-apt-amount tabular-nums">
                {inr(metadata.amount)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Booking Slot & Schedule Details */}
      <div className="notif-apt-slot-box">
        <div className="notif-apt-slot-row">
          <Clock size={13} color="var(--ink-500)" style={{ flexShrink: 0 }} />
          {isRescheduled ? (
            <div className="notif-apt-reschedule-diff">
              <span className="notif-apt-old-time">{metadata.originalTimeLabel}</span>
              <ArrowRight size={11} color="var(--amber-700)" />
              <span className="notif-apt-new-time">{metadata.timeLabel}</span>
            </div>
          ) : (
            <span className="notif-apt-slot-time">
              {metadata.timeLabel || metadata.dateLabel || "Scheduled time"}
            </span>
          )}

          {metadata.fulfillmentType === "DELIVERY" ? (
            <span className="notif-apt-badge notif-apt-badge-delivery">
              <MapPin size={11} />
              {t("notif_apt_delivery")}
            </span>
          ) : (
            <span className="notif-apt-badge notif-apt-badge-store">
              {t("notif_apt_in_store")}
            </span>
          )}

          {metadata.partySize != null && metadata.partySize > 1 && (
            <span className="notif-apt-badge">
              <Users size={11} />
              {metadata.partySize} {t("notif_apt_guests")}
            </span>
          )}

          {metadata.statusPill && (
            <span
              className="notif-pill"
              style={{
                color: toneColor(metadata.tone),
                background: toneBg(metadata.tone),
                marginLeft: "auto",
              }}
            >
              {metadata.statusPill}
            </span>
          )}
        </div>

        {/* Reason / Decline note. Without a reason, a declined or cancelled booking shows the server's own sentence
            ("… couldn't take your 5:00 PM. Try another slot.") — otherwise the customer got a bare "Declined"
            with no idea what to do next (E2E-010). */}
        {metadata.reason ? (
          <p className="notif-reason" style={{ marginTop: 6, marginBottom: 0 }}>
            {metadata.reason}
          </p>
        ) : metadata.tone === "danger" && metadata.serviceName && preview ? (
          <p className="notif-reason" style={{ marginTop: 6, marginBottom: 0 }}>
            {preview}
          </p>
        ) : null}
      </div>

      {/* Action Buttons Bar */}
      {actions.length > 0 && onAction && (
        <div className="notif-apt-actions" onClick={(e) => e.stopPropagation()}>
          {actions.includes("ACCEPT") && (
            <button
              type="button"
              className="notif-apt-btn notif-apt-btn-accept"
              onClick={() => {
                haptics.light();
                onAction("ACCEPT", metadata);
              }}
            >
              <Check size={14} />
              <span>{t("notif_apt_accept")}</span>
            </button>
          )}

          {actions.includes("DECLINE") && (
            <button
              type="button"
              className="notif-apt-btn notif-apt-btn-decline"
              onClick={() => {
                haptics.light();
                onAction("DECLINE", metadata);
              }}
            >
              <X size={14} />
              <span>{t("notif_apt_decline")}</span>
            </button>
          )}

          {actions.includes("CALENDAR") && (
            <button
              type="button"
              className="notif-apt-btn notif-apt-btn-calendar"
              onClick={() => {
                haptics.light();
                onAction("CALENDAR", metadata);
              }}
            >
              <Calendar size={13} />
              <span>{t("notif_apt_add_calendar")}</span>
            </button>
          )}

          {actions.includes("RESCHEDULE") && (
            <button
              type="button"
              className="notif-apt-btn notif-apt-btn-reschedule"
              onClick={() => {
                haptics.light();
                onAction("RESCHEDULE", metadata);
              }}
            >
              <Clock size={13} />
              <span>{t("notif_apt_reschedule")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
