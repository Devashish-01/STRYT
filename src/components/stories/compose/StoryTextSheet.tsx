import { useState } from "react";
import { Check, X } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import {
  STORY_TEXT_COLORS,
  type StoryTextLayer,
  type StoryTextStyle,
} from "@/lib/storyCanvas";

const STYLES: readonly { id: StoryTextStyle; labelKey: string }[] = [
  { id: "snap", labelKey: "storyc_style_snap" },
  { id: "classic", labelKey: "storyc_style_classic" },
  { id: "pill", labelKey: "storyc_style_pill" },
];

export default function StoryTextSheet({
  initial,
  onSave,
  onClose,
}: {
  initial: StoryTextLayer | null;
  onSave: (layer: StoryTextLayer | null) => void;
  onClose: () => void;
}) {
  const { t, tf } = useI18n();
  const [text, setText] = useState(initial?.text ?? "");
  const [style, setStyle] = useState<StoryTextStyle>(initial?.style ?? "snap");
  const [colorId, setColorId] = useState(initial?.colorId ?? "white");

  function commit() {
    const trimmed = text.trim();
    if (!trimmed) {
      onSave(null);
    } else {
      onSave({
        text: trimmed,
        style,
        colorId,
        yPct: initial?.yPct ?? 0.52,
      });
    }
    onClose();
  }

  return (
    <div className="sc-text-modal" role="dialog" aria-modal="true" aria-label={t("storyc_caption")}>
      <div className="sc-text-top">
        <button
          type="button"
          className="sc-tool-pill"
          onClick={() => {
            onSave(null);
            onClose();
          }}
        >
          <X size={15} /> {t("storyc_clear_text")}
        </button>

        <div className="row gap-6">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`sc-style-chip${style === s.id ? " active" : ""}`}
              onClick={() => setStyle(s.id)}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>

        <button type="button" className="sc-done-pill" onClick={commit}>
          <Check size={15} weight="bold" /> {t("storyc_done")}
        </button>
      </div>

      <div className="sc-text-stage">
        {(() => {
          const activeColor = STORY_TEXT_COLORS.find((c) => c.id === colorId) ?? STORY_TEXT_COLORS[0];
          const textColor = style === "pill"
            ? (activeColor.inkOnFill === "dark" ? "var(--ink-900)" : "var(--white)")
            : `var(${activeColor.token})`;
          return (
            <textarea
              className={`sc-text-input style-${style}`}
              style={{
                color: textColor,
                backgroundColor: style === "pill" ? `var(${activeColor.token})` : undefined,
              }}
              maxLength={120}
              rows={3}
              placeholder={t("storyc_caption_ph")}
              aria-label={t("storyc_caption")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          );
        })()}
        {text.length > 80 && (
          <div className="tiny" style={{ color: "rgba(255,255,255,0.75)", marginTop: 8 }}>
            {tf("storyc_chars_left", { n: 120 - text.length })}
          </div>
        )}
      </div>

      <div className="sc-color-row" role="group" aria-label={t("storyc_text_color")}>
        {STORY_TEXT_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={c.id}
            aria-pressed={colorId === c.id}
            className={`sc-swatch${colorId === c.id ? " active" : ""}`}
            style={{ background: `var(${c.token})` }}
            onClick={() => setColorId(c.id)}
          />
        ))}
      </div>
    </div>
  );
}
