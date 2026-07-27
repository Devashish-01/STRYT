import { useEffect, useState } from "react";
import { Eye, EyeOff, HelpCircle } from "@/components/Icons";
import { entityPasswordService } from "@/services";
import type { EntityPasswordKind } from "@/services/core/entityPasswordService";
import { recoveryQuestionLabel } from "@/lib/entityPasswordRecovery";
import { useApp } from "@/store";

/**
 * Owner-only forgot-password sheet — answer backup question + set new password.
 * Used from PinGateSheet after switching into a protected console.
 */
export default function PasswordRecoverySheet({
  kind,
  onClose,
  onReset,
}: {
  kind: EntityPasswordKind;
  onClose: () => void;
  onReset: () => void;
}) {
  const { refreshEntityPasswordStatus, showToast } = useApp();
  const label = kind === "business" ? "business" : "provider";

  const [questionId, setQuestionId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState<string | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(true);

  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingQuestion(true);
      try {
        const q = await entityPasswordService.getRecoveryQuestion(kind);
        if (cancelled) return;
        if (!q) {
          setError("No backup question is set for this account.");
        } else {
          setQuestionId(q.questionId);
          setQuestionText(q.questionText);
        }
      } catch {
        if (!cancelled) setError("Couldn't load your backup question.");
      } finally {
        if (!cancelled) setLoadingQuestion(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kind]);

  const questionLabel = questionId
    ? recoveryQuestionLabel(questionId as Parameters<typeof recoveryQuestionLabel>[0], questionText)
    : "";

  async function handleSubmit() {
    if (answer.trim().length < 3) {
      setError("Enter your backup answer.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match — try again.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await entityPasswordService.resetViaRecovery(kind, answer.trim(), newPassword);
      await refreshEntityPasswordStatus();
      showToast(`${label[0].toUpperCase()}${label.slice(1)} password reset`);
      onReset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reset the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay recovery-picker-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="row gap-10" style={{ marginBottom: 4 }}>
          <div className="recovery-step-icon">
            <HelpCircle size={18} color="var(--brand-600)" />
          </div>
          <div className="grow">
            <h3 className="bold h2">Reset {label} password</h3>
          </div>
        </div>
        <p className="small muted" style={{ marginBottom: 16 }}>
          Answer your backup question, then choose a new password. Only the account owner can do this.
        </p>

        {loadingQuestion ? (
          <p className="small muted">Loading your question…</p>
        ) : questionId ? (
          <>
            <div className="recovery-group" style={{ marginBottom: 16 }}>
              <div style={{ padding: "12px 14px" }}>
                <div className="tiny muted" style={{ marginBottom: 4 }}>Your backup question</div>
                <div className="semi small">{questionLabel}</div>
              </div>
            </div>

            <div className="col gap-12">
              <div>
                <label className="tiny semi muted" htmlFor="recovery-reset-answer" style={{ display: "block", marginBottom: 6 }}>
                  Your answer
                </label>
                <input
                  id="recovery-reset-answer"
                  type="password"
                  autoComplete="off"
                  autoFocus
                  value={answer}
                  maxLength={80}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Backup answer"
                  className="input"
                  style={{ width: "100%", padding: "14px 16px" }}
                />
              </div>

              <div>
                <label className="tiny semi muted" htmlFor="recovery-new-pw" style={{ display: "block", marginBottom: 6 }}>
                  New password
                </label>
                <div className="row gap-8" style={{ position: "relative" }}>
                  <input
                    id="recovery-new-pw"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    maxLength={40}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="input"
                    style={{ width: "100%", padding: "14px 44px 14px 16px" }}
                  />
                  <button type="button" onClick={() => setShowNew((v) => !v)} className="recovery-eye-btn" aria-label={showNew ? "Hide password" : "Show password"}>
                    {showNew ? <EyeOff size={18} color="var(--ink-400)" /> : <Eye size={18} color="var(--ink-400)" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="tiny semi muted" htmlFor="recovery-confirm-pw" style={{ display: "block", marginBottom: 6 }}>
                  Confirm new password
                </label>
                <div className="row gap-8" style={{ position: "relative" }}>
                  <input
                    id="recovery-confirm-pw"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    maxLength={40}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
                    placeholder="Type again"
                    className="input"
                    style={{ width: "100%", padding: "14px 44px 14px 16px" }}
                  />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)} className="recovery-eye-btn" aria-label={showConfirm ? "Hide password" : "Show password"}>
                    {showConfirm ? <EyeOff size={18} color="var(--ink-400)" /> : <Eye size={18} color="var(--ink-400)" />}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {error && (
          <div className="small" style={{ color: "var(--red-600)", marginTop: 12 }} role="alert">
            {error}
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy || loadingQuestion || !questionId}
          onClick={() => void handleSubmit()}
          style={{ marginTop: 16 }}
        >
          {busy ? "Please wait…" : "Reset password"}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose} style={{ marginTop: 8 }}>
          Back
        </button>
      </div>
    </div>
  );
}
