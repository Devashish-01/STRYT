import { useState } from "react";
import { SafeImg } from "@/components/common";
import { LANGUAGES_ENABLED } from "@/lib/features";
import { useI18n, LANG_LABELS, type Lang } from "@/lib/i18n";
import { isUnusableName } from "@/lib/publicName";
import { uploadService } from "@/services";
import { useApp } from "@/store";
import { BeatFrame } from "./BeatFrame";

export function BeatIdentity({ name, avatar, email, ageConfirmed, busy, onDone }: {
  name: string;
  avatar?: string;
  email?: string;
  ageConfirmed?: boolean;
  busy?: boolean;
  onDone: (data: { name: string; avatar: string; ageConfirmed: true }) => void;
}) {
  const { t, lang, setLang } = useI18n();
  const { showToast } = useApp();
  const [draft, setDraft] = useState(isUnusableName(name) ? "" : name.trim());
  const [photo, setPhoto] = useState(avatar || "");
  const [adult, setAdult] = useState(ageConfirmed === true);
  const [uploading, setUploading] = useState(false);
  const value = draft.trim();
  const ready = value.length > 0 && value.length <= 40 && !isUnusableName(value) && adult;
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
      onCta={() => onDone({ name: value, avatar: photo, ageConfirmed: true })}
      footer={LANGUAGES_ENABLED ? (
        <div className="ob-langs" role="group" aria-label={t("language")}>
          {(Object.keys(LANG_LABELS) as Lang[]).map(l => (
            <button key={l} type="button" className={`ob-lang ${lang === l ? "active" : ""}`} onClick={() => setLang(l)}>
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      ) : undefined}>
      <div className="ob-identity-card">
        <SafeImg src={photo} variant="avatar" className="ob-identity-avatar" />
        <label className="ob-photo-label" htmlFor="onboard-photo">{t("ob_change_photo")}</label>
        <input id="onboard-photo" type="file" accept="image/jpeg,image/png,image/webp"
          disabled={busy || uploading} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
        <label className="ob-label" htmlFor="onboard-name">{t("full_name")}</label>
        <input id="onboard-name" className="input ob-identity-input" value={draft}
          onChange={e => setDraft(e.target.value)} maxLength={40} autoComplete="name" disabled={busy}
          placeholder={t("full_name_placeholder")} />
        <label className="ob-label" htmlFor="onboard-email">{t("ob_google_email")}</label>
        <input id="onboard-email" className="input ob-identity-input" type="email" value={email || ""} readOnly />
        <label className="ob-age-confirm" htmlFor="onboard-adult">
          <input id="onboard-adult" type="checkbox" checked={adult} disabled={busy}
            onChange={e => setAdult(e.target.checked)} />
          <span>{t("ob_age_confirm")}</span>
        </label>
        <p className="ob-identity-hint">{t("ob_phone_later")}</p>
      </div>
    </BeatFrame>
  );
}
