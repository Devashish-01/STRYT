import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader, ArrowRight, ChevronRight } from "@/components/Icons";
import AppMark from "@/components/AppMark";
import { useApp } from "@/store";
import { userService } from "@/services";
import { useI18n } from "@/lib/i18n";
import { LEGAL_VERSION, LEGAL_ROUTES } from "@/lib/legal";

// Clickwrap Terms & Privacy acceptance gate. Shown by App.tsx whenever the
// signed-in user has not accepted the current LEGAL_VERSION — covers both a
// brand-new user's first sign-in and an existing user being re-prompted after a
// policy update. One combined, explicit, un-pre-ticked confirmation (18+ AND
// agreement) is the enforceable pattern under the IT Act / Indian Contract Act,
// and the affirmative action satisfies the DPDP Act's consent requirement.
export default function TermsAccept() {
  const nav = useNavigate();
  const { t } = useI18n();
  const { user, refreshUser, showToast, signOut } = useApp();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  // An already-onboarded user with a prior (now-stale) acceptance is being
  // re-prompted after an update; anyone else is accepting for the first time.
  const isUpdate = !!user.onboardingCompletedAt && !!user.termsAcceptedVersion;

  async function handleAccept() {
    if (!checked || saving) return;
    setSaving(true);
    try {
      await userService.acceptTerms(LEGAL_VERSION);
      await refreshUser();
      nav("/home", { replace: true });
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : t("gate_terms_failed"));
      setSaving(false);
    }
  }

  const docs = [
    { to: LEGAL_ROUTES.terms, label: t("gate_terms_doc_terms") },
    { to: LEGAL_ROUTES.privacy, label: t("gate_terms_doc_privacy") },
  ];

  return (
    <div className="screen gate-screen">
      <main className="gate-main">
        <AppMark size={56} radius={16} shadow={false} />
        <h1 className="gate-title">{isUpdate ? t("gate_terms_title_update") : t("gate_terms_title_first")}</h1>
        <p className="gate-sub">{isUpdate ? t("gate_terms_sub_update") : t("gate_terms_sub_first")}</p>

        {/* The documents open in the bundled in-app viewer */}
        <div className="gate-list">
          {docs.map((d) => (
            <Link key={d.to} to={d.to} className="gate-row">
              <span className="gate-row-label">{d.label}</span>
              <span className="gate-row-cta">{t("gate_terms_read")}</span>
              <ChevronRight size={18} />
            </Link>
          ))}
        </div>

        {/* Single combined consent — never pre-ticked */}
        <label className={`gate-consent${checked ? " checked" : ""}`}>
          <input type="checkbox" className="gate-check" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>{t("gate_terms_consent")}</span>
        </label>
      </main>

      <footer className="gate-footer">
        <button type="button" className="login-cta" onClick={handleAccept} disabled={!checked || saving}>
          {saving ? (
            <>
              <Loader className="spin" size={20} /> {t("gate_terms_saving")}
            </>
          ) : (
            <>
              {t("gate_terms_agree")} <ArrowRight size={18} />
            </>
          )}
        </button>
        <button
          type="button"
          className="login-ghost"
          onClick={() => {
            signOut();
            nav("/");
          }}
        >
          {t("gate_terms_signout")}
        </button>
      </footer>
    </div>
  );
}
