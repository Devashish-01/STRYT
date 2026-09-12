import { useState, type ReactNode } from "react";
import { Store, Briefcase, Mountains, Tag, MapPin, Phone, Ticket, Copy, Check, Navigation, Calendar } from "@/components/Icons";
import type { NotificationMetadata, NotificationType } from "@/types";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";

interface DiscoveryNotificationCardProps {
  type: NotificationType;
  metadata: NotificationMetadata;
  title: string;
  preview: string;
  time: string;
  unread: boolean;
  onAction?: (action: string, metadata: NotificationMetadata) => void;
  onDelete?: () => void;
}

export default function DiscoveryNotificationCard({
  type,
  metadata,
  title,
  preview,
  time,
  unread,
  onAction,
}: DiscoveryNotificationCardProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const isOffer = type === "OFFER";
  const isProvider = type === "NEW_PROVIDER";
  const isPlace = type === "NEW_PLACE";
  const isBusiness = type === "NEW_BUSINESS";

  const entityName =
    metadata.businessName ||
    metadata.providerName ||
    metadata.placeName ||
    metadata.offerTitle ||
    title;

  const categoryLabel =
    metadata.category ||
    (isOffer ? t("notif_disc_offer_badge", "Offer") : isProvider ? t("provider", "Provider") : isPlace ? t("place", "Place") : t("business", "Business"));

  const statusLabel =
    metadata.statusPill ||
    (isOffer ? t("notif_disc_deal_pill", "Limited Deal") : isProvider ? t("notif_disc_provider_pill", "New Pro") : isPlace ? t("notif_disc_place_pill", "New Landmark") : t("notif_disc_business_pill", "Newly Opened"));

  const badgeIcon: ReactNode = isOffer ? (
    <Tag size={12} weight="fill" />
  ) : isProvider ? (
    <Briefcase size={12} weight="fill" />
  ) : isPlace ? (
    <Mountains size={12} weight="fill" />
  ) : (
    <Store size={12} weight="fill" />
  );

  const thumbUrl = metadata.imageUrl || metadata.avatarUrl;

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!metadata.offerCode) return;
    haptics.light();
    navigator.clipboard?.writeText(metadata.offerCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className={`notif-disc-card${unread ? " notif-disc-unread" : ""}`}>
      {/* Top Meta Bar */}
      <div className="notif-disc-top-bar">
        <div className="notif-disc-badge-row">
          <span className={`notif-disc-type-pill notif-disc-type-${type.toLowerCase()}`}>
            {badgeIcon}
            <span>{categoryLabel}</span>
          </span>
          <span className="notif-disc-status-pill">{statusLabel}</span>
        </div>
        <div className="notif-disc-time-row">
          <span className="notif-disc-time">{time}</span>
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
        </div>
      </div>

      {/* Main Content Row */}
      <div className="notif-disc-main">
        {thumbUrl ? (
          <div className="notif-disc-thumb-wrap">
            <img src={thumbUrl} alt={entityName} className="notif-disc-thumb" />
          </div>
        ) : (
          <div className={`notif-disc-icon-fallback notif-disc-fallback-${type.toLowerCase()}`}>
            {badgeIcon}
          </div>
        )}

        <div className="notif-disc-info">
          <h4 className="notif-disc-title">{entityName}</h4>

          {metadata.address ? (
            <div className="notif-disc-location-row">
              <MapPin size={13} className="notif-disc-pin-icon" />
              <span className="notif-disc-address">{metadata.address}</span>
            </div>
          ) : (
            <p className="notif-disc-preview">{preview}</p>
          )}

          {metadata.phone && (
            <div className="notif-disc-phone-row">
              <Phone size={12} />
              <span>{metadata.phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Offer Ticket Section (Voucher Style) */}
      {isOffer && (
        <div className="notif-disc-ticket">
          <div className="notif-disc-ticket-cutout notif-disc-ticket-left" />
          <div className="notif-disc-ticket-cutout notif-disc-ticket-right" />
          <div className="notif-disc-ticket-body">
            <div className="notif-disc-ticket-header">
              <Ticket size={16} className="notif-disc-ticket-icon" />
              <span className="notif-disc-discount-text">
                {metadata.discountText || metadata.offerTitle || title}
              </span>
            </div>

            <div className="notif-disc-ticket-details">
              {metadata.offerCode && (
                <button
                  type="button"
                  className="notif-disc-code-btn"
                  onClick={handleCopyCode}
                  title="Copy coupon code"
                >
                  <span className="notif-disc-code-label">{t("notif_disc_coupon_code", "Code")}:</span>
                  <span className="notif-disc-code-val">{metadata.offerCode}</span>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              )}
              {metadata.validUntil && (
                <span className="notif-disc-valid-until">
                  {t("notif_disc_valid_until", "Valid until")} {metadata.validUntil}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons Toolbar */}
      {metadata.actions && metadata.actions.length > 0 && (
        <div className="notif-disc-actions">
          {metadata.actions.map((act) => {
            if (act === "VIEW_BUSINESS") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-disc-btn notif-disc-btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Store size={14} />
                  <span>{t("notif_disc_view_business", "View Shop")}</span>
                </button>
              );
            }
            if (act === "VIEW_PROVIDER") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-disc-btn notif-disc-btn-positive"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Briefcase size={14} />
                  <span>{t("notif_disc_view_provider", "View Profile")}</span>
                </button>
              );
            }
            if (act === "VIEW_PLACE") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-disc-btn notif-disc-btn-brand"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Mountains size={14} />
                  <span>{t("notif_disc_view_place", "Explore Place")}</span>
                </button>
              );
            }
            if (act === "CLAIM_OFFER") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-disc-btn notif-disc-btn-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Tag size={14} />
                  <span>{t("notif_disc_claim_offer", "Save Coupon")}</span>
                </button>
              );
            }
            if (act === "DIRECTIONS") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-disc-btn notif-disc-btn-outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Navigation size={14} />
                  <span>{t("notif_disc_directions", "Directions")}</span>
                </button>
              );
            }
            if (act === "BOOK_APPOINTMENT") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-disc-btn notif-disc-btn-outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Calendar size={14} />
                  <span>{t("notif_disc_book", "Book")}</span>
                </button>
              );
            }
            if (act === "VIEW_STORE") {
              return (
                <button
                  key={act}
                  type="button"
                  className="notif-disc-btn notif-disc-btn-outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.selection();
                    onAction?.(act, metadata);
                  }}
                >
                  <Store size={14} />
                  <span>{t("notif_trust_view_store_btn", "View Store")}</span>
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
