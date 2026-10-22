import { useState } from "react";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { Loader, WifiOff } from "@/components/Icons";

/** A failed profile/legal read must not open the app with an empty seed user. */
export default function ProfileLoadError() {
  const { refreshUser, signOut } = useApp();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    try { await refreshUser(); } finally { setBusy(false); }
  }
  return (
    <main className="gate-screen" role="alert">
      <div className="gate-main state-center">
        <span className="state-icon" aria-hidden="true"><WifiOff size={30} /></span>
        <p className="state-text">{t("ob_profile_error")}</p>
      </div>
      <div className="gate-footer">
        <button type="button" className="login-cta" disabled={busy} onClick={() => void retry()}>
          {busy ? <Loader className="spin" size={20} /> : t("ob_retry")}
        </button>
        <button type="button" className="login-ghost" disabled={busy} onClick={signOut}>{t("sign_out")}</button>
      </div>
    </main>
  );
}
