import { MapPin, Navigation, RefreshCw, Settings, X } from "@/components/Icons";
import { backgroundLocation } from "@/lib/backgroundLocation";
import { useI18n } from "@/lib/i18n";

export type PreciseIssueMode = "approximate_locked" | "denied" | "gps_off";

/**
 * Clean, user-friendly helper sheet shown when Precise location is locked to Approximate,
 * permission is denied, or device GPS/Location Services are switched off. Gives direct paths
 * to open Settings, retry GPS right away, or place the pin manually on the map.
 */
export default function PreciseLocationSheet({
  mode,
  onRetry,
  onPickOnMap,
  onClose,
}: {
  mode: PreciseIssueMode;
  onRetry: () => void;
  onPickOnMap?: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  const isOff = mode === "gps_off";
  const isDenied = mode === "denied";
  const title = isOff
    ? t("map_gps_off_title")
    : isDenied
      ? t("map_precise_denied_title")
      : t("map_precise_sheet_title");
  const body = isOff
    ? t("map_gps_off_body")
    : isDenied
      ? t("map_precise_denied_body")
      : t("map_precise_sheet_body");

  return (
    <div className="overlay" style={{ zIndex: 1150 }} onClick={onClose}>
      <div
        className="sheet col gap-14"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: "18px 18px calc(24px + var(--safe-area-bottom))",
          borderRadius: "24px 24px 0 0",
          background: "var(--surface)",
        }}
      >
        <div className="sheet-grab" style={{ background: "var(--ink-200)" }} />
        <div className="row between center-v" style={{ gap: 12 }}>
          <div className="row gap-12 center-v" style={{ minWidth: 0 }}>
            <span className="map-locate-sheet-icon">
              <Navigation size={20} color="var(--brand-700)" />
            </span>
            <h3 className="bold h3" style={{ color: "var(--ink-900)" }}>{title}</h3>
          </div>
          <button
            type="button"
            className="icon-btn-sm"
            onClick={onClose}
            aria-label={t("search_cancel")}
            style={{ background: "var(--ink-100)", color: "var(--ink-700)", flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        <p className="small" style={{ color: "var(--ink-600)", lineHeight: 1.5, margin: 0 }}>
          {body}
        </p>

        <div className="col gap-8" style={{ marginTop: 4 }}>
          {!isOff && (
            <button
              type="button"
              className="btn btn-primary btn-block row center gap-8"
              onClick={() => backgroundLocation.openSettings()}
            >
              <Settings size={16} />
              <span>{t("map_open_settings_cta")}</span>
            </button>
          )}
          <button
            type="button"
            className={`btn ${isOff ? "btn-primary" : "btn-outline"} btn-block row center gap-8`}
            onClick={() => {
              onClose();
              onRetry();
            }}
          >
            <RefreshCw size={15} />
            <span>{t("map_retry_gps_cta")}</span>
          </button>
          {onPickOnMap && (
            <button
              type="button"
              className="btn btn-ghost btn-block row center gap-8"
              onClick={() => {
                onClose();
                onPickOnMap();
              }}
            >
              <MapPin size={15} color="var(--brand-600)" />
              <span>{t("map_pick_on_map_cta")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
