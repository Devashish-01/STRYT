import { useState } from "react";
import { Clock, Pencil, X } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import {
  STORY_DEFAULT_HOURS,
  STORY_DURATION_OPTIONS,
  STORY_MAX_HOURS,
  STORY_MIN_HOURS,
  clampStoryHours,
} from "@/lib/stories";

export default function StoryDurationSheet({
  hours,
  onSelect,
  onClose,
}: {
  hours: number;
  onSelect: (nextHours: number) => void;
  onClose: () => void;
}) {
  const { t, tf } = useI18n();
  const isPreset = (STORY_DURATION_OPTIONS as readonly number[]).includes(hours);
  const [customMode, setCustomMode] = useState(!isPreset);
  const [customVal, setCustomVal] = useState(isPreset ? "" : String(hours));

  const formatChip = (h: number) =>
    h === STORY_MAX_HOURS ? tf("storyc_days_short", { n: 7 }) : tf("storyc_hours_short", { n: h });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sc-sheet-dark" role="dialog" aria-modal="true" aria-label={t("storyc_visible_for")} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="row between center-v" style={{ marginBottom: 14 }}>
          <div className="row gap-8 center-v">
            <Clock size={18} color="var(--brand-300)" />
            <h2 className="h3" style={{ margin: 0, color: "var(--white)" }}>{t("storyc_visible_for")}</h2>
          </div>
          <button type="button" className="sc-tool-btn" onClick={onClose} aria-label={t("storyc_cancel")}>
            <X size={16} />
          </button>
        </div>

        <p className="tiny" style={{ color: "rgba(255,255,255,0.7)", marginBottom: 14, lineHeight: 1.4 }}>
          {t("storyc_duration_hint")}
        </p>

        <div className="row wrap gap-8" style={{ marginBottom: 14 }}>
          {STORY_DURATION_OPTIONS.map((h) => {
            const active = !customMode && hours === h;
            return (
              <button
                key={h}
                type="button"
                className={`sc-dur-pill${active ? " active" : ""}`}
                onClick={() => {
                  onSelect(h);
                  onClose();
                }}
              >
                <span>{formatChip(h)}</span>
                {h === STORY_DEFAULT_HOURS && <em className="sc-dur-def">{t("storyc_default")}</em>}
              </button>
            );
          })}
          <button
            type="button"
            className={`sc-dur-pill${customMode ? " active" : ""}`}
            onClick={() => setCustomMode(true)}
          >
            <Pencil size={12} />
            <span>{t("storyc_custom")}</span>
          </button>
        </div>

        {customMode && (
          <div className="row gap-8">
            <input
              type="number"
              inputMode="numeric"
              min={STORY_MIN_HOURS}
              max={STORY_MAX_HOURS}
              className="input grow sc-dark-input"
              placeholder={tf("storyc_custom_ph", { min: STORY_MIN_HOURS, max: STORY_MAX_HOURS })}
              aria-label={t("storyc_visible_for")}
              value={customVal}
              onChange={(e) => setCustomVal(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ height: 42, padding: "0 16px" }}
              onClick={() => {
                const parsed = parseInt(customVal, 10);
                onSelect(Number.isNaN(parsed) ? STORY_DEFAULT_HOURS : clampStoryHours(parsed));
                onClose();
              }}
            >
              {t("storyc_apply")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
