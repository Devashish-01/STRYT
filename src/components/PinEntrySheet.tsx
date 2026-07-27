import { useState } from "react";
import { Eye, EyeOff, Lock } from "@/components/Icons";
import { entityPasswordService } from "@/services";
import type { EntityPasswordKind } from "@/services/core/entityPasswordService";
import { useApp } from "@/store";
import RecoveryQuestionStep, { type RecoveryQuestionValue } from "@/components/entity-password/RecoveryQuestionStep";

type Mode = "set" | "verify";

const KIND_LABEL: Record<EntityPasswordKind, string> = {
  business: "business",
  provider: "provider",
};

/**
 * Business/provider password entry sheet.
 *  - "verify": confirm password (Settings remove/change, gate switch).
 *  - "set": password wizard; first-time setup includes backup recovery (step 2).
 *    Changing an existing password prompts for recovery if none is set yet.
 */
export default function PinEntrySheet({
  mode,
  kind,
  entityId,
  onClose,
  onVerified,
  onSaved,
  showForgotPassword,
  onForgotPassword,
}: {
  mode: Mode;
  kind: EntityPasswordKind;
  entityId?: string;
  onClose: () => void;
  onVerified?: (password: string) => void;
  onSaved?: () => void;
  /** Owner-only forgot link on verify sheet (PinGateSheet). */
  showForgotPassword?: boolean;
  onForgotPassword?: () => void;
}) {
  const {
    businessPasswordIsSet,
    providerPasswordIsSet,
    businessRecoveryIsSet,
    providerRecoveryIsSet,
    refreshEntityPasswordStatus,
    showToast,
  } = useApp();

  const hasExisting = kind === "business" ? businessPasswordIsSet : providerPasswordIsSet;
  const recoveryIsSet = kind === "business" ? businessRecoveryIsSet : providerRecoveryIsSet;
  const label = KIND_LABEL[kind];

  const [wizard, setWizard] = useState<"password" | "recovery">("password");
  const [step, setStep] = useState<"current" | "new" | "confirm">(
    mode === "set" && hasExisting ? "current" : "new",
  );
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pin, setPin] = useState("");
  const [pendingPassword, setPendingPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitVerify() {
    if (pin.length < 1) return;
    setBusy(true);
    setError("");
    try {
      const ok = await entityPasswordService.verify(kind, entityId, pin);
      if (ok) {
        onVerified?.(pin);
      } else {
        setError("Wrong password — check and try again, or wait a moment if you've tried a few times.");
        setPin("");
      }
    } finally {
      setBusy(false);
    }
  }

  function submitCurrent() {
    if (currentPin.length < 1) return;
    setError("");
    setStep("new");
  }

  function submitNew() {
    if (newPin.length < 6) return;
    setError("");
    setStep("confirm");
  }

  async function submitConfirm() {
    if (pin.length < 6) return;
    if (pin !== newPin) {
      setError("Passwords don't match — try again.");
      setPin("");
      return;
    }

    if (!hasExisting) {
      setPendingPassword(newPin);
      setWizard("recovery");
      setError("");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await entityPasswordService.set(kind, newPin, currentPin);
      await refreshEntityPasswordStatus();
      if (!recoveryIsSet) {
        setPendingPassword(newPin);
        setWizard("recovery");
        showToast("Password updated — now add a backup question");
      } else {
        showToast(`${label[0].toUpperCase()}${label.slice(1)} password saved`);
        onSaved?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the password.");
      setStep("current");
      setCurrentPin("");
      setNewPin("");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  async function submitRecovery(value: RecoveryQuestionValue) {
    setBusy(true);
    setError("");
    try {
      if (!hasExisting) {
        await entityPasswordService.setupWithRecovery(
          kind,
          pendingPassword,
          value.questionId,
          value.answer,
          value.questionText,
        );
      } else {
        await entityPasswordService.setRecovery(
          kind,
          value.questionId,
          value.answer,
          pendingPassword,
          value.questionText,
        );
      }
      await refreshEntityPasswordStatus();
      showToast(`${label[0].toUpperCase()}${label.slice(1)} password protected`);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the backup question.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "set" && wizard === "recovery") {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grab" />
          <RecoveryQuestionStep
            kind={kind}
            stepLabel={hasExisting ? undefined : "2 of 2"}
            submitLabel="Save & protect console"
            busy={busy}
            error={error}
            onSubmit={submitRecovery}
            onBack={() => {
              setWizard("password");
              setError("");
              if (!hasExisting) setStep("confirm");
            }}
          />
          <button type="button" className="btn btn-ghost btn-block" onClick={onClose} style={{ marginTop: 8 }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const title =
    mode === "verify" ? `Enter the ${label} password`
    : step === "current" ? "Enter your current password"
    : step === "new" ? (hasExisting ? "Choose a new password" : `Set a ${label} password`)
    : "Confirm your password";

  const subtitle =
    mode === "verify"
      ? entityId
        ? `Protects this ${label} console from anyone else opening it.`
        : "Confirm your current password to continue."
    : step === "confirm"
      ? hasExisting ? "Type it once more to confirm." : "Next you'll set a backup question."
    : hasExisting
      ? `At least 6 characters — required to open the ${label} console.`
      : `Step 1 of 2 — at least 6 characters. You'll add a backup question next.`;

  const value = mode === "verify" ? pin : step === "current" ? currentPin : step === "new" ? newPin : pin;
  const setValue = mode === "verify" ? setPin : step === "current" ? setCurrentPin : step === "new" ? setNewPin : setPin;
  const submit =
    mode === "verify" ? submitVerify
    : step === "current" ? submitCurrent
    : step === "new" ? submitNew
    : submitConfirm;
  const minLength = mode === "verify" ? 1 : step === "current" ? 1 : 6;

  const stepLabel = mode === "set" && !hasExisting && step !== "current" ? "1 of 2" : undefined;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        {stepLabel && (
          <div className="recovery-step-label tiny semi muted">{stepLabel}</div>
        )}
        <div className="row gap-10" style={{ marginBottom: 4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Lock size={18} color="var(--brand-600)" />
          </div>
          <div>
            <h3 className="bold h2">{title}</h3>
          </div>
        </div>
        <p className="small muted" style={{ marginBottom: 16 }}>{subtitle}</p>

        <div className="row gap-8" style={{ position: "relative", marginBottom: 8 }}>
          <input
            type={show ? "text" : "password"}
            autoFocus
            value={value}
            maxLength={40}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Password"
            className="input"
            style={{ width: "100%", padding: "14px 44px 14px 16px" }}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", padding: 6 }}
          >
            {show ? <EyeOff size={18} color="var(--ink-400)" /> : <Eye size={18} color="var(--ink-400)" />}
          </button>
        </div>

        {error && <div className="small" style={{ color: "var(--red-600)", marginBottom: 8 }}>{error}</div>}

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={value.length < minLength || busy}
          onClick={submit}
          style={{ marginTop: 8 }}
        >
          {busy ? "Please wait…" : mode === "verify" ? "Confirm" : step === "confirm" ? (hasExisting ? "Save password" : "Continue") : "Continue"}
        </button>

        {mode === "verify" && showForgotPassword && onForgotPassword && (
          <button
            type="button"
            className="btn btn-ghost btn-block recovery-forgot-link"
            onClick={onForgotPassword}
            style={{ marginTop: 4 }}
          >
            Forgot password?
          </button>
        )}

        <button type="button" className="btn btn-ghost btn-block" onClick={onClose} style={{ marginTop: 8 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
