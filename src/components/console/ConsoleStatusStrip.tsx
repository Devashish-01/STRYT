import { Link } from "react-router-dom";
import { Calendar, Zap } from "@/components/Icons";
import Toggle from "@/components/Toggle";
import { useI18n } from "@/lib/i18n";
import type { BookingStatus } from "@/lib/consoleStatus";

type Props = {
  available: boolean;
  availabilityKey: string;
  labelKey?: string;
  booking: BookingStatus;
  saving?: boolean;
  onAvailability?: () => void;
  onBookings?: () => void;
  settingsPath?: string;
  editPath?: string;
};

export default function ConsoleStatusStrip({
  available, availabilityKey, labelKey = "console_status_title", booking, saving, onAvailability, onBookings, settingsPath, editPath,
}: Props) {
  const { t } = useI18n();
  const availability = t(availabilityKey);
  const bookingLabel = t(`console_bookings_${booking}`);
  const accepting = booking === "accepting";
  return (
    <div className="col gap-8" role="group" aria-label={t(labelKey)}>
      <div className="console-status-grid">
        {onAvailability ? (
          <button type="button" className="console-status-item" role="switch" aria-checked={available}
            aria-label={t("console_availability")} onClick={onAvailability} disabled={saving}>
            <Zap size={18} aria-hidden="true" />
            <span>{availability}</span>
            <span aria-hidden="true"><Toggle on={available} /></span>
          </button>
        ) : (
          <div className="console-status-item" data-active={available}>
            <Zap size={18} aria-hidden="true" /><span>{availability}</span>
          </div>
        )}
        {onBookings && booking !== "off" ? (
          <button type="button" className="console-status-item" role="switch" aria-checked={accepting}
            aria-label={t("bset_accepting")} onClick={onBookings} disabled={saving}>
            <Calendar size={18} aria-hidden="true" />
            <span>{bookingLabel}</span>
            <span aria-hidden="true"><Toggle on={accepting} /></span>
          </button>
        ) : (
          <div className="console-status-item" data-active={accepting}>
            <Calendar size={18} aria-hidden="true" /><span>{bookingLabel}</span>
          </div>
        )}
      </div>
      {editPath && <Link className="small semi" to={editPath}>{t("console_change_status")}</Link>}
      {booking === "off" && settingsPath && <Link className="small semi" to={settingsPath}>{t("console_booking_settings")}</Link>}
    </div>
  );
}
