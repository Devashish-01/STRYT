import { type ReactNode } from "react";
import {
  Users,
  Shield,
  BadgeCheck,
  ShieldAlert,
  MessageCircle,
  HelpCircle,
  Bell,
  RefreshCw,
  Store,
  ArrowRight,
  Trash2,
  Key,
} from "@/components/Icons";
import { SafeImg } from "@/components/common";
import { toneColor, toneBg } from "@/lib/notificationTone";
import { StatusPill } from "@/components/NotificationContent";
import { distinctPill } from "@/lib/notificationCard";
import type { NotificationMetadata, NotificationType } from "@/types";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";

interface SystemNotificationCardProps {
  type?: NotificationType;
  metadata: NotificationMetadata;
  title: string;
  preview: string;
  time: string;
  unread: boolean;
  onAction?: (action: string, metadata: NotificationMetadata) => void;
  onDelete?: () => void;
}

export default function SystemNotificationCard({
  type,
  metadata,
  title,
  preview,
  time,
  unread,
  onAction,
  onDelete,
}: SystemNotificationCardProps) {
  const { t } = useI18n();
  const pill = distinctPill(title, metadata.statusPill);
  const actions = metadata.actions || [];

  const isAccess = type === "BUSINESS_ACCESS";
  const isVerify = type === "VERIFICATION_DECIDED";
  const isQna = type === "QNA";
  const isChat = type === "CHAT";
  const isSystem = type === "SYSTEM" || (!isAccess && !isVerify && !isQna && !isChat);

  const isRejected = isVerify && (metadata.tone === "danger" || metadata.statusPill?.toLowerCase().includes("needs") || metadata.statusPill?.toLowerCase().includes("rejected"));
  const isVerified = isVerify && !isRejected;

  // Leading icon computation
  const renderFallbackIcon = (): ReactNode => {
    if (isAccess) {
      return <Users size={20} color={toneColor(metadata.tone) || "var(--brand-600)"} />;
    }
    if (isVerify) {
      if (isRejected) {
        return <ShieldAlert size={20} color="var(--danger-500)" />;
      }
      return <BadgeCheck size={20} color="var(--success-600)" />;
    }
    if (isQna) {
      return <HelpCircle size={20} color={toneColor(metadata.tone) || "var(--brand-600)"} />;
    }
    if (isChat) {
      return <MessageCircle size={20} color={toneColor(metadata.tone) || "var(--brand-600)"} />;
    }
    return <Bell size={20} color={toneColor(metadata.tone) || "var(--ink-600)"} />;
  };

  const getScopeLabel = (scope: string) => {
    switch (scope) {
      case "appointments":
        return t("scope_appointments", "Appointments");
      case "queue":
        return t("scope_queue", "Queue & Walk-ins");
      case "catalog":
        return t("scope_catalog", "Catalog & Items");
      case "leads":
        return t("scope_leads", "Leads & Inquiries");
      case "delivery":
        return t("scope_delivery", "Delivery & Logistics");
      default:
        return scope.charAt(0).toUpperCase() + scope.slice(1);
    }
  };

  return (
    <div className={`notif-sys-card${unread ? " notif-sys-unread" : ""}`}>
      {/* Header Section */}
      <div className="notif-sys-header">
        <div className="notif-sys-leading">
          {metadata.avatarUrl ? (
            <div className="notif-row-icon notif-row-avatar-wrap">
              <SafeImg src={metadata.avatarUrl} variant="avatar" className="notif-avatar-img" />
              {isAccess && (
                <span className="notif-sys-corner-badge" style={{ background: "var(--brand-600)" }}>
                  <Users size={10} color="#fff" />
                </span>
              )}
              {isVerify && isVerified && (
                <span className="notif-sys-corner-badge" style={{ background: "var(--success-600)" }}>
                  <BadgeCheck size={10} color="#fff" />
                </span>
              )}
              {isVerify && isRejected && (
                <span className="notif-sys-corner-badge" style={{ background: "var(--danger-500)" }}>
                  <ShieldAlert size={10} color="#fff" />
                </span>
              )}
              {isQna && (
                <span className="notif-sys-corner-badge" style={{ background: "var(--brand-600)" }}>
                  <HelpCircle size={10} color="#fff" />
                </span>
              )}
              {isChat && (
                <span className="notif-sys-corner-badge" style={{ background: "var(--brand-600)" }}>
                  <MessageCircle size={10} color="#fff" />
                </span>
              )}
            </div>
          ) : (
            <div
              className="notif-sys-icon-wrap"
              style={{ background: toneBg(metadata.tone) }}
            >
              {renderFallbackIcon()}
            </div>
          )}
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
        </div>

        {/* Text & Meta */}
        <div className="notif-sys-meta">
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

          <p className="notif-sys-preview clamp-2">{preview}</p>

          {/* Status Pill */}
          {metadata.statusPill && (
            <div className="notif-sys-pill-row">
              {pill && <StatusPill label={pill} tone={metadata.tone} />}
              {metadata.businessName && (
                <span className="notif-sys-biz-chip">
                  <Store size={11} />
                  <span>{metadata.businessName}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scopes Section for BUSINESS_ACCESS */}
      {isAccess && metadata.scopes && metadata.scopes.length > 0 && (
        <div className="notif-sys-scopes-box">
          <div className="notif-sys-scopes-title">
            <Key size={12} />
            <span>{t("notif_sys_granted_scopes", "Granted Permissions")}:</span>
          </div>
          <div className="notif-sys-scopes-chips">
            {metadata.scopes.map((scope) => (
              <span key={scope} className="notif-sys-scope-tag">
                {getScopeLabel(scope)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reason Box for Rejected Verification */}
      {isVerify && isRejected && metadata.reason && (
        <div className="notif-sys-reason-box">
          <ShieldAlert size={15} className="notif-sys-reason-icon" />
          <div className="notif-sys-reason-content">
            <span className="notif-sys-reason-label">{t("notif_sys_rejection_reason", "Action needed")}:</span>
            <p className="notif-sys-reason-text">"{metadata.reason}"</p>
          </div>
        </div>
      )}

      {/* Q&A Thread Box */}
      {isQna && (metadata.question || metadata.answer) && (
        <div className="notif-sys-qna-box">
          {metadata.question && (
            <div className="notif-sys-qna-row notif-sys-qna-q">
              <span className="notif-sys-qna-badge">Q</span>
              <p className="notif-sys-qna-text">"{metadata.question}"</p>
            </div>
          )}
          {metadata.answer && (
            <div className="notif-sys-qna-row notif-sys-qna-a">
              <span className="notif-sys-qna-badge">A</span>
              <p className="notif-sys-qna-text">"{metadata.answer}"</p>
            </div>
          )}
        </div>
      )}

      {/* Actions Row */}
      {actions.length > 0 && (
        <div className="notif-sys-actions">
          {actions.map((act) => {
            if (act === "SWITCH_BUSINESS") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-sys-btn notif-sys-btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Users size={14} />
                  <span>{t("notif_sys_switch_biz_btn", "Switch Business")}</span>
                  <ArrowRight size={13} />
                </button>
              );
            }
            if (act === "RESUBMIT_VERIFY") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-sys-btn notif-sys-btn-warning"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <RefreshCw size={14} />
                  <span>{t("notif_sys_resubmit_verify_btn", "Resubmit Verification")}</span>
                </button>
              );
            }
            if (act === "VIEW_STORE") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-sys-btn notif-sys-btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Store size={14} />
                  <span>{t("notif_sys_view_store_btn", "View Store")}</span>
                </button>
              );
            }
            if (act === "ANSWER_QNA") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-sys-btn notif-sys-btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <HelpCircle size={14} />
                  <span>{t("notif_sys_answer_qna_btn", "Reply to Question")}</span>
                </button>
              );
            }
            if (act === "VIEW_QNA") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-sys-btn notif-sys-btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <HelpCircle size={14} />
                  <span>{t("notif_sys_view_qna_btn", "View Discussion")}</span>
                </button>
              );
            }
            if (act === "REPLY_CHAT" || act === "OPEN_CHAT") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-sys-btn notif-sys-btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <MessageCircle size={14} />
                  <span>{t("notif_sys_open_chat_btn", "Open Chat")}</span>
                  <ArrowRight size={13} />
                </button>
              );
            }
            if (act === "VIEW_DETAILS") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-sys-btn notif-sys-btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <span>{t("notif_sys_view_details_btn", "View Details")}</span>
                  <ArrowRight size={13} />
                </button>
              );
            }
            return (
              <button
                key={act}
                type="button"
                className="notif-sys-btn notif-sys-btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  haptics.selection();
                  onAction?.(act, metadata);
                }}
              >
                <span>{act.replace(/_/g, " ")}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
