import { Bell, Briefcase, Package, Store, X } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import type { LiveNotificationAlert } from "@/store/useNotificationBadges";

const SCOPE_META: Record<
  LiveNotificationAlert["scope"],
  { labelKey: string; color: string; bg: string; Icon: typeof Bell }
> = {
  CUSTOMER: { labelKey: "notif_hat_personal", color: "var(--brand-700)", bg: "var(--brand-50)", Icon: Bell },
  BUSINESS: { labelKey: "notif_hat_business", color: "var(--orange-500)", bg: "var(--orange-50)", Icon: Store },
  PROVIDER: { labelKey: "notif_hat_provider", color: "var(--green-600)", bg: "var(--green-100)", Icon: Briefcase },
  DELIVERY: { labelKey: "notif_hat_delivery", color: "var(--delivery-600)", bg: "var(--delivery-50)", Icon: Package },
};

/**
 * Clickable top foreground banner shown when any notification (Personal,
 * Business, Provider, or Delivery) arrives in real time while the app is open.
 */
export default function LiveNotificationBanner({
  alert,
  onOpen,
  onDismiss,
}: {
  alert: LiveNotificationAlert;
  onOpen: (alert: LiveNotificationAlert) => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const meta = SCOPE_META[alert.scope] ?? SCOPE_META.CUSTOMER;
  const Icon = meta.Icon;

  return (
    <div className="live-notif-wrap" role="status" aria-live="polite">
      <div className="live-notif-card">
        <button
          type="button"
          className="live-notif-hit"
          onClick={() => onOpen(alert)}
        >
          <span className="live-notif-icon" style={{ background: meta.bg, color: meta.color }}>
            <Icon size={18} />
          </span>
          <div className="live-notif-copy">
            <div className="row gap-6 center-v">
              <span className="live-notif-pill" style={{ background: meta.bg, color: meta.color }}>
                {t(meta.labelKey)}
              </span>
              <span className="live-notif-title ellipsis">{alert.title}</span>
            </div>
            {alert.body && <div className="live-notif-body ellipsis">{alert.body}</div>}
          </div>
          <span className="live-notif-cta">{t("notif_view_cta")}</span>
        </button>
        <button
          type="button"
          className="live-notif-close"
          onClick={onDismiss}
          aria-label={t("notif_dismiss_label")}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
