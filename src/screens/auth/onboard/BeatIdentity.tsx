import { useState } from "react";
import { SafeImg } from "@/components/common";
import { Camera, Loader, Phone } from "@/components/Icons";
import { LANGUAGES_ENABLED } from "@/lib/features";
import { useI18n, LANG_LABELS, type Lang } from "@/lib/i18n";
import { isUnusableName } from "@/lib/publicName";
import { formatPhone, isValidPhone, normalizePhone } from "@/lib/phone";
import { uploadService } from "@/services";
import { useApp } from "@/store";
import { BeatFrame } from "./BeatFrame";

export function BeatIdentity({ name, avatar, phone, ageConfirmed, busy, onDone }: {
  name: string;
  avatar?: string;
  phone?: string;
  ageConfirmed?: boolean;
  busy?: boolean;
  onDone: (data: { name: string; avatar: string; phone: string; ageConfirmed: true }) => void;
}) {
  const { t, lang, setLang } = useI18n();
  const { showToast } = useApp();
  const [draft, setDraft] = useState(isUnusableName(name) ? "" : name.trim());
  const [photo, setPhoto] = useState(avatar || "");
  const [adult, setAdult] = useState(ageConfirmed === true);
  const [uploading, setUploading] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState(phone ?? "");
  // Someone who signed in with their number already gave it; asking again is a form field that adds nothing.
  // Show it as a row they can change, and only fall back to the input when there is no usable number yet.
  const [editingPhone, setEditingPhone] = useState(() => !isValidPhone(phone ?? ""));
  const value = draft.trim();
  // Only complain once they have typed enough to be worth judging — flagging "invalid" at the first
  // keystroke is how a required field starts feeling hostile.
  const phoneTouched = phoneDraft.replace(/\D/g, "").length >= 4;
  const phoneOk = isValidPhone(phoneDraft);
  const ready = value.length > 0 && value.length <= 40 && !isUnusableName(value) && phoneOk && adult;
  const submit = () => onDone({ name: value, avatar: photo, phone: normalizePhone(phoneDraft), ageConfirmed: true });
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      showToast(t("ob_photo_invalid")); return;
    }
    setUploading(true);
    try { setPhoto(await uploadService.upload(file, "avatar")); }
    catch { showToast(t("ob_photo_failed")); }
    finally { setUploading(false); }
  }
  return (
    <BeatFrame title={t("ob_beat1_title")} sub={t("ob_identity_sub")}
      ctaLabel={t("ob_continue")} ctaDisabled={!ready} ctaBusy={busy || uploading}
      onCta={submit}
      footer={LANGUAGES_ENABLED ? (
        <div className="onb-langs" role="group" aria-label={t("language")}>
          {(Object.keys(LANG_LABELS) as Lang[]).map(l => (
            <button key={l} type="button" className={`onb-lang ${lang === l ? "active" : ""}`} onClick={() => setLang(l)}>
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      ) : undefined}>
      <div className="onb-photo">
        <label className="onb-avatar-pick" htmlFor="onboard-photo" aria-label={t("ob_change_photo")}>
          <SafeImg src={photo} variant="avatar" className="onb-avatar" />
          <span className="onb-avatar-badge" aria-hidden="true">
            {uploading ? <Loader className="spin" size={14} /> : <Camera size={14} />}
          </span>
        </label>
        <div className="onb-photo-copy">
          <strong>{t("ob_add_photo")}</strong>
          <span>{t("ob_photo_optional")}</span>
        </div>
        <input id="onboard-photo" className="onb-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp"
          disabled={busy || uploading} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      <div className="onb-field">
        <label className="onb-label" htmlFor="onboard-name">{t("full_name")}</label>
        <input id="onboard-name" className="onb-input" value={draft} autoFocus
          onChange={e => setDraft(e.target.value)} maxLength={40} autoComplete="name" disabled={busy}
          enterKeyHint={ready ? "done" : "next"}
          onKeyDown={e => { if (e.key === "Enter" && ready && !busy && !uploading) submit(); }}
          placeholder={t("full_name_placeholder")} />
      </div>

      {editingPhone ? (
        <div className="onb-field">
          <label className="onb-label" htmlFor="onboard-phone">{t("mobile_phone")}</label>
          <input id="onboard-phone" className="onb-input" type="tel" inputMode="tel"
            value={phoneDraft} onChange={e => setPhoneDraft(e.target.value)} disabled={busy}
            autoComplete="tel" maxLength={18} placeholder={t("mobile_phone_placeholder")}
            aria-invalid={phoneTouched && !phoneOk} aria-describedby="onboard-phone-hint" />
          <p id="onboard-phone-hint" className={`onb-hint ${phoneTouched && !phoneOk ? "bad" : ""}`}>
            {phoneTouched && !phoneOk ? t("ob_phone_invalid") : t("ob_phone_why")}
          </p>
        </div>
      ) : (
        <div className="onb-phone-row">
          <Phone size={16} aria-hidden="true" />
          <span>{formatPhone(phoneDraft)}</span>
          <button type="button" className="onb-link" disabled={busy} onClick={() => setEditingPhone(true)}>
            {t("ob_phone_change")}
          </button>
        </div>
      )}

      <label className="onb-consent" htmlFor="onboard-adult">
        <input id="onboard-adult" type="checkbox" checked={adult} disabled={busy}
          onChange={e => setAdult(e.target.checked)} />
        <span>{t("ob_age_confirm")}</span>
      </label>
    </BeatFrame>
  );
}
