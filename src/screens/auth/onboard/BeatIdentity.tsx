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
  initialPhone,
  busy,
  onDone,
}: {
  name: string;
  avatar?: string;
  initialPhone?: string;
  busy?: boolean;
  onDone: (data: { name: string; phone: string }) => void;
}) {
  const { t, lang, setLang } = useI18n();
  const derived = isUnusableName(name) ? "" : name.trim();
  // Nothing worth confirming → open straight into the editable state, so the
  // screen never shows a card that says "Is this you?" above an empty name.
  const [editing, setEditing] = useState(!derived);
  const [draft, setDraft] = useState(derived);
  const [phone, setPhone] = useState(() => (initialPhone ? initialPhone.replace(/\D/g, "").slice(-10) : ""));

  const value = draft.trim();
  const cleanPhone = phone.replace(/\D/g, "");
  const phoneValid = cleanPhone.length === 10 && /^[6-9]/.test(cleanPhone);
  const ready = value.length > 0 && !isUnusableName(value) && phoneValid;

  return (
    <BeatFrame
      title={t("ob_beat1_title")}
      sub={t("ob_beat1_sub")}
      ctaLabel={editing ? t("ob_continue") : (t("ob_continue") || t("ob_beat1_confirm"))}
      ctaDisabled={!ready}
      ctaBusy={busy}
      onCta={() => onDone({ name: value, phone: cleanPhone })}
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

        {!editing && (
          <button type="button" className="ob-inline-link" onClick={() => setEditing(true)} style={{ marginTop: -4 }}>
            {t("ob_beat1_edit")}
          </button>
        )}

        {/* Mobile number field */}
        <div style={{ width: "100%", marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255, 255, 255, 0.16)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255, 255, 255, 0.95)" }}>
              {t("ob_beat1_phone_label")}
            </span>
            {cleanPhone.length === 10 && phoneValid && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--green-400)" }}>
                ✓ Valid
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(255, 255, 255, 0.16)",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                borderRadius: 12,
                fontWeight: 800,
                fontSize: 14,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              +91
            </div>
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={10}
              placeholder={t("ob_beat1_phone_placeholder")}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              style={{
                flex: 1,
                background: "#fff",
                color: "var(--ink-900)",
                fontWeight: 600,
                fontSize: 15,
                borderRadius: 12,
                borderColor: cleanPhone.length > 0 && !phoneValid && cleanPhone.length === 10 ? "var(--red-400)" : undefined,
              }}
              aria-label={t("ob_beat1_phone_label")}
            />
          </div>
          <div style={{ fontSize: 11.5, color: "rgba(255, 255, 255, 0.72)", marginTop: 6, textAlign: "left", lineHeight: 1.4 }}>
            {t("ob_beat1_phone_hint")}
          </div>
        </div>
      </div>
    </BeatFrame>
  );
}
