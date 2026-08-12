import { useState } from "react";
import { SafeImg } from "@/components/common";
import { useI18n, LANG_LABELS, type Lang } from "@/lib/i18n";
import { isUnusableName } from "@/lib/publicName";
import { BeatFrame } from "./BeatFrame";

/**
 * Beat 1 — "Is this you?"
 *
 * Google already gave us a real name and avatar (userService.me() reads them
 * off user_metadata), so for almost everyone this is a confirmation, not a
 * form: one tap and they're past what used to be the two required fields.
 * The editable input only takes over when there is genuinely nothing usable to
 * confirm — `isUnusableName` covers blank, the "New user" seed, and a raw
 * email or phone that leaked in as a display name.
 *
 * The language switcher lives here rather than in a step of its own: it costs
 * one row on the first screen, and putting it any later means a Hindi or
 * Marathi speaker reads the whole flow in English to reach it.
 */
export function BeatIdentity({
  name,
  avatar,
  busy,
  onDone,
}: {
  name: string;
  avatar?: string;
  busy?: boolean;
  onDone: (name: string) => void;
}) {
  const { t, lang, setLang } = useI18n();
  const derived = isUnusableName(name) ? "" : name.trim();
  // Nothing worth confirming → open straight into the editable state, so the
  // screen never shows a card that says "Is this you?" above an empty name.
  const [editing, setEditing] = useState(!derived);
  const [draft, setDraft] = useState(derived);

  const value = draft.trim();
  const ready = value.length > 0 && !isUnusableName(value);

  return (
    <BeatFrame
      title={t("ob_beat1_title")}
      sub={t("ob_beat1_sub")}
      ctaLabel={editing ? t("ob_continue") : t("ob_beat1_confirm")}
      ctaDisabled={!ready}
      ctaBusy={busy}
      onCta={() => onDone(value)}
      footer={
        <div className="ob-langs" role="group" aria-label={t("language")}>
          {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              className={`ob-lang ${lang === l ? "active" : ""}`}
              onClick={() => setLang(l)}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      }
    >
      <div className="ob-identity-card">
        <SafeImg src={avatar} variant="avatar" className="ob-identity-avatar" />
        {editing ? (
          <input
            className="input ob-identity-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("full_name_placeholder")}
            maxLength={40}
            autoFocus
            aria-label={t("full_name")}
          />
        ) : (
          <div className="ob-identity-name">{value}</div>
        )}
      </div>

      {!editing && (
        <button type="button" className="ob-inline-link" onClick={() => setEditing(true)}>
          {t("ob_beat1_edit")}
        </button>
      )}
    </BeatFrame>
  );
}
