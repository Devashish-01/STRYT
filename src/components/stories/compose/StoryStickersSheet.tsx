import { MapPin, X } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { STORY_STICKER_EMOJIS, type StorySticker } from "@/lib/storyCanvas";

export default function StoryStickersSheet({
  locationLabel,
  hasLocationSticker,
  onAdd,
  onClose,
}: {
  locationLabel: string;
  hasLocationSticker: boolean;
  onAdd: (sticker: Omit<StorySticker, "id">) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sc-sheet-dark" role="dialog" aria-modal="true" aria-label={t("storyc_stickers")} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="row between center-v" style={{ marginBottom: 14 }}>
          <h2 className="h3" style={{ margin: 0, color: "var(--white)" }}>{t("storyc_stickers")}</h2>
          <button type="button" className="sc-tool-btn" onClick={onClose} aria-label={t("storyc_cancel")}>
            <X size={16} />
          </button>
        </div>

        <button
          type="button"
          className="sc-loc-sticker-btn"
          disabled={hasLocationSticker}
          onClick={() => {
            onAdd({ kind: "location", label: locationLabel, xPct: 0.5, yPct: 0.72 });
            onClose();
          }}
        >
          <MapPin size={16} color="var(--brand-600)" />
          <span>{locationLabel}</span>
          {hasLocationSticker && <span className="tiny muted">✓</span>}
        </button>

        <div className="sc-emoji-grid">
          {STORY_STICKER_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="sc-emoji-btn"
              onClick={() => {
                onAdd({ kind: "emoji", label: emoji, xPct: 0.5, yPct: 0.36 });
                onClose();
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
