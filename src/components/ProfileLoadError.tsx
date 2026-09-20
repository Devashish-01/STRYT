import { useState } from "react";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";

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
    <main className="page" style={{ padding: "calc(32px + var(--safe-area-top)) 24px" }}>
      <p role="alert">{t("ob_profile_error")}</p>
      <button className="btn btn-primary" disabled={busy} onClick={() => void retry()}>{t("ob_retry")}</button>
      <button className="btn btn-outline" disabled={busy} onClick={signOut}>{t("sign_out")}</button>
    </main>
  );
}
