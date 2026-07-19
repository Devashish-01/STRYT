import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader, ArrowRight, LogOut } from "@/components/Icons";
import { useApp } from "@/store";
import { userService } from "@/services";
import { LEGAL_VERSION, LEGAL_ROUTES } from "@/lib/legal";

// Clickwrap Terms & Privacy acceptance gate. Shown by App.tsx whenever the
// signed-in user has not accepted the current LEGAL_VERSION — covers both a
// brand-new user's first sign-in and an existing user being re-prompted after a
// policy update. One combined, explicit, un-pre-ticked confirmation (18+ AND
// agreement) is the enforceable pattern under the IT Act / Indian Contract Act,
// and the affirmative action satisfies the DPDP Act's consent requirement.
export default function TermsAccept() {
  const nav = useNavigate();
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
      showToast(err instanceof Error ? err.message : "Could not save. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div
      className="screen"
      style={{
        background: "linear-gradient(160deg, var(--brand-50) 0%, var(--brand-100) 60%, var(--brand-200) 100%)",
        color: "var(--ink-900)",
      }}
    >
      <div
        className="screen-scroll page-pad col"
        style={{ minHeight: "100%", justifyContent: "center", alignItems: "center", paddingTop: 32, paddingBottom: 40 }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, color: "var(--brand-700)", letterSpacing: -0.5, marginBottom: 20 }}>
          STRYT
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: 380,
            background: "#fff",
            border: "1.5px solid var(--brand-300)",
            borderRadius: 24,
            padding: 24,
            boxShadow: "0 8px 24px rgba(160, 32, 224, 0.08)",
          }}
        >
          <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🤝</div>

          <h1 className="h1" style={{ textAlign: "center", letterSpacing: -0.5, color: "var(--ink-900)", marginBottom: 8 }}>
            {isUpdate ? "We've updated our terms" : "Before you start"}
          </h1>

          <p style={{ textAlign: "center", fontSize: 13.5, color: "var(--ink-600)", lineHeight: 1.55, marginBottom: 20 }}>
            {isUpdate
              ? "We've made changes to our Terms & Conditions and Privacy Policy. Please review and accept them to continue using STRYT."
              : "STRYT connects you with real neighbours, shops, and providers nearby. Please review and accept the following to continue."}
          </p>

          {/* Document links (open the bundled in-app policy viewer) */}
          <div className="col gap-8" style={{ marginBottom: 18 }}>
            {[
              { to: LEGAL_ROUTES.terms, label: "Terms & Conditions" },
              { to: LEGAL_ROUTES.privacy, label: "Privacy Policy" },
            ].map((d) => (
              <Link
                key={d.to}
                to={d.to}
                className="row space-between center-v"
                style={{
                  padding: "12px 14px",
                  background: "var(--ink-50)",
                  border: "1px solid var(--ink-200)",
                  borderRadius: 14,
                  textDecoration: "none",
                  color: "var(--ink-900)",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                <span>{d.label}</span>
                <span style={{ color: "var(--brand-600)", fontSize: 12, fontWeight: 700 }}>Read →</span>
              </Link>
            ))}
          </div>

          {/* Single combined consent checkbox — never pre-ticked */}
          <label
            className="row gap-10"
            style={{
              alignItems: "flex-start",
              padding: "14px",
              background: checked ? "var(--brand-50)" : "var(--ink-50)",
              border: `1.5px solid ${checked ? "var(--brand-400)" : "var(--ink-200)"}`,
              borderRadius: 14,
              cursor: "pointer",
              marginBottom: 20,
              transition: "all 0.15s",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              style={{ width: 20, height: 20, marginTop: 1, accentColor: "var(--brand-600)", flexShrink: 0, cursor: "pointer" }}
            />
            <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-800)" }}>
              I confirm that I am <strong>18 years of age or older</strong> and I agree to STRYT&rsquo;s{" "}
              <strong style={{ color: "var(--brand-700)" }}>Terms &amp; Conditions</strong> and{" "}
              <strong style={{ color: "var(--brand-700)" }}>Privacy Policy</strong> (linked above).
            </span>
          </label>

          <button
            className="btn btn-primary btn-block row center gap-8"
            onClick={handleAccept}
            disabled={!checked || saving}
            style={{ padding: "15px", fontSize: 15.5, fontWeight: 700, borderRadius: 16, width: "100%" }}
          >
            {saving ? (
              <>
                <Loader className="spin" size={18} /> Saving…
              </>
            ) : (
              <>
                Agree &amp; continue <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>

        <button
          onClick={() => {
            signOut();
            nav("/");
          }}
          className="row center gap-6"
          style={{
            marginTop: 24,
            background: "none",
            border: "none",
            color: "var(--ink-500)",
            cursor: "pointer",
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          <LogOut size={15} /> Not now — sign out
        </button>
      </div>
    </div>
  );
}
