import { useState } from "react";
import { Eye, EyeOff, Lock } from "@/components/Icons";
import { switchPinService } from "@/services";
import { useApp } from "@/store";

type Mode = "set" | "verify";

/**
 * Numeric PIN entry sheet, two modes:
 *  - "verify": single PIN entry, used to confirm a pending business/provider
 *    switch. Wrong guesses surface the rate limiter's own message.
 *  - "set": new PIN + confirm, plus a leading "current PIN" step if one is
 *    already set (Settings screen use). 4-6 digits — a masked single field
 *    rather than fixed-length OTP-style boxes, since the length isn't fixed.
 */
export default function PinEntrySheet({
  mode,
  onClose,
  onVerified,
  onSaved,
}: {
  mode: Mode;
  onClose: () => void;
  onVerified?: (pin: string) => void;
  onSaved?: () => void;
}) {
  const { switchPinIsSet, refreshSwitchPinStatus, showToast } = useApp();
  const hasExisting = switchPinIsSet;

  const [step, setStep] = useState<"current" | "new" | "confirm">(
    mode === "set" && hasExisting ? "current" : "new"
  );
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function digitsOnly(v: string) {
    return v.replace(/\D/g, "").slice(0, 6);
  }

  async function submitVerify() {
    if (pin.length < 4) return;
    setBusy(true);
    setError("");
    try {
      const ok = await switchPinService.verify(pin);
      if (ok) {
        onVerified?.(pin);
      } else {
        setError("Wrong PIN — check and try again, or wait a moment if you've tried a few times.");
        setPin("");
      }
    } finally {
      setBusy(false);
    }
  }

  function submitCurrent() {
    if (currentPin.length < 4) return;
    setStep("new");
  }

  function submitNew() {
    if (newPin.length < 4) return;
    setStep("confirm");
  }

  async function submitConfirm() {
    if (pin.length < 4) return;
    if (pin !== newPin) {
      setError("PINs don't match — try again.");
      setPin("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await switchPinService.set(newPin, hasExisting ? currentPin : undefined);
      await refreshSwitchPinStatus();
      showToast("Switch PIN saved");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the PIN.");
      setStep(hasExisting ? "current" : "new");
      setCurrentPin("");
      setNewPin("");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "verify" ? "Enter your switch PIN"
    : step === "current" ? "Enter your current PIN"
    : step === "new" ? (hasExisting ? "Choose a new PIN" : "Set a switch PIN")
    : "Confirm your PIN";

  const subtitle =
    mode === "verify" ? "Protects your business/provider console from anyone else picking up this device."
    : step === "confirm" ? "Type it once more to confirm."
    : "4 to 6 digits, whatever's easy for you to remember.";

  const value = mode === "verify" ? pin : step === "current" ? currentPin : step === "new" ? newPin : pin;
  const setValue = mode === "verify" ? setPin : step === "current" ? setCurrentPin : step === "new" ? setNewPin : setPin;
  const submit =
    mode === "verify" ? submitVerify
    : step === "current" ? submitCurrent
    : step === "new" ? submitNew
    : submitConfirm;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
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
            inputMode="numeric"
            pattern="[0-9]*"
            autoFocus
            value={value}
            onChange={(e) => setValue(digitsOnly(e.target.value))}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="••••"
            className="input"
            style={{ width: "100%", fontSize: 20, letterSpacing: 4, textAlign: "center", padding: "14px 44px 14px 16px" }}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide PIN" : "Show PIN"}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", padding: 6 }}
          >
            {show ? <EyeOff size={18} color="var(--ink-400)" /> : <Eye size={18} color="var(--ink-400)" />}
          </button>
        </div>

        {error && <div className="small" style={{ color: "var(--red-600)", marginBottom: 8 }}>{error}</div>}

        <button
          className="btn btn-primary btn-block"
          disabled={value.length < 4 || busy}
          onClick={submit}
          style={{ marginTop: 8 }}
        >
          {busy ? "Please wait…" : mode === "verify" ? "Confirm" : step === "confirm" ? "Save PIN" : "Continue"}
        </button>
        <button className="btn btn-ghost btn-block" onClick={onClose} style={{ marginTop: 8 }}>Cancel</button>
      </div>
    </div>
  );
}
