import { useState } from "react";
import { AppBar } from "@/components/common";
import { Check } from "@/components/Icons";
import { useApp } from "@/store";
import { userService } from "@/services";
import { useI18n, LANG_LABELS, type Lang } from "@/lib/i18n";

/** Language picker. Its own screen so the hub's "Language · हिन्दी" row opens
 *  the thing it names, instead of the top of a long mixed-topic page. */
export default function LanguageSettings() {
  const { showToast } = useApp();
  const { lang, setLang } = useI18n();
  const [savingLang, setSavingLang] = useState<Lang | null>(null);
  const langs = Object.entries(LANG_LABELS) as [Lang, string][];

  async function handleSelectLang(code: Lang, label: string) {
    if (savingLang || code === lang) return;
    const prevLang = lang;
    setSavingLang(code);
    setLang(code);
    try {
      await userService.update({ language: code });
      showToast(`Language set to ${label}`);
    } catch {
      setLang(prevLang);
      showToast("Failed to save language preference. Reverted.");
    } finally {
      setSavingLang(null);
    }
  }

  return (
    <div className="screen screen-boxed">
      <AppBar title="Language" />
      <div className="screen-scroll page-pad col gap-16 scroll-pad-end" style={{ paddingTop: 14 }}>
        <div className="set-group">
          {langs.map(([code, label]) => {
            const active = lang === code;
            const isSaving = savingLang === code;
            return (
              <button
                key={code}
                className="set-row"
                role="radio"
                aria-checked={active}
                disabled={savingLang !== null}
                style={{ opacity: savingLang && !isSaving && !active ? 0.6 : 1 }}
                onClick={() => void handleSelectLang(code, label)}
              >
                <span className="set-row-label grow">{label}</span>
                {isSaving && <span className="tiny muted" style={{ marginRight: 6 }}>Saving…</span>}
                {active && !isSaving && <Check size={18} color="var(--brand-600)" />}
              </button>
            );
          })}
        </div>
        <p className="tiny muted" style={{ padding: "0 2px", lineHeight: 1.5 }}>
          Applies across the app and to the notifications we send you.
        </p>
      </div>
    </div>
  );
}
