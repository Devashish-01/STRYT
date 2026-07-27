import { useMemo, useState } from "react";
import { ChevronRight, Eye, EyeOff, HelpCircle } from "@/components/Icons";
import type { EntityPasswordKind, EntityRecoveryQuestionId } from "@/services/core/entityPasswordService";
import { presetQuestionsForKind, recoveryQuestionLabel } from "@/lib/entityPasswordRecovery";
import RecoveryQuestionPicker from "./RecoveryQuestionPicker";

export type RecoveryQuestionValue = {
  questionId: EntityRecoveryQuestionId;
  questionText?: string;
  answer: string;
};

/**
 * Step 2 of password setup — backup reset question + answer.
 * Embeds inside PinEntrySheet (Phase 4) or a standalone sheet (Settings).
 */
export default function RecoveryQuestionStep({
  kind,
  stepLabel,
  title = "Set a backup question",
  subtitle = "If you forget your password, you'll answer this to reset it. Only you should know the answer.",
  initialQuestionId,
  initialQuestionText = "",
  submitLabel = "Save & continue",
  busy = false,
  error: externalError,
  onSubmit,
  onBack,
}: {
  kind: EntityPasswordKind;
  /** e.g. "2 of 2" */
  stepLabel?: string;
  title?: string;
  subtitle?: string;
  initialQuestionId?: EntityRecoveryQuestionId;
  initialQuestionText?: string;
  submitLabel?: string;
  busy?: boolean;
  error?: string;
  onSubmit: (value: RecoveryQuestionValue) => void | Promise<void>;
  onBack?: () => void;
}) {
  const defaultQuestionId = initialQuestionId ?? presetQuestionsForKind(kind)[0];

  const [questionId, setQuestionId] = useState<EntityRecoveryQuestionId>(defaultQuestionId);
  const [customQuestion, setCustomQuestion] = useState(initialQuestionText);
  const [answer, setAnswer] = useState("");
  const [confirmAnswer, setConfirmAnswer] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [localError, setLocalError] = useState("");

  const displayQuestion = useMemo(
    () => recoveryQuestionLabel(questionId, questionId === "custom" ? customQuestion : null),
    [questionId, customQuestion],
  );

  const error = externalError || localError;

  function validate(): RecoveryQuestionValue | null {
    if (questionId === "custom" && customQuestion.trim().length < 3) {
      setLocalError("Write a question that's at least 3 characters.");
      return null;
    }
    if (answer.trim().length < 3) {
      setLocalError("Answer must be at least 3 characters.");
      return null;
    }
    if (answer !== confirmAnswer) {
      setLocalError("Answers don't match — try again.");
      return null;
    }
    setLocalError("");
    return {
      questionId,
      questionText: questionId === "custom" ? customQuestion.trim() : undefined,
      answer: answer.trim(),
    };
  }

  async function handleSubmit() {
    const value = validate();
    if (!value) return;
    await onSubmit(value);
  }

  return (
    <>
      <div className="recovery-question-step">
        {stepLabel && (
          <div className="recovery-step-label tiny semi muted">{stepLabel}</div>
        )}

        <div className="row gap-10" style={{ marginBottom: 4 }}>
          <div className="recovery-step-icon">
            <HelpCircle size={18} color="var(--brand-600)" />
          </div>
          <div className="grow">
            <h3 className="bold h2">{title}</h3>
          </div>
        </div>

        <p className="small muted" style={{ marginBottom: 16 }}>{subtitle}</p>

        <div className="recovery-group">
          <button
            type="button"
            className="recovery-question-row"
            onClick={() => setPickerOpen(true)}
          >
            <span className="col grow" style={{ gap: 2, textAlign: "left", minWidth: 0 }}>
              <span className="tiny muted">Question</span>
              <span className="semi small recovery-question-preview">{displayQuestion}</span>
            </span>
            <ChevronRight size={18} color="var(--ink-400)" style={{ flexShrink: 0 }} />
          </button>
        </div>

        {questionId === "custom" && (
          <div style={{ marginTop: 12 }}>
            <label className="tiny semi muted" htmlFor="recovery-custom-q" style={{ display: "block", marginBottom: 6 }}>
              Your question
            </label>
            <textarea
              id="recovery-custom-q"
              className="input recovery-custom-input"
              value={customQuestion}
              maxLength={120}
              rows={2}
              placeholder="e.g. What street did you open your first stall on?"
              onChange={(e) => setCustomQuestion(e.target.value)}
            />
          </div>
        )}

        <div className="col gap-12" style={{ marginTop: 16 }}>
          <div>
            <label className="tiny semi muted" htmlFor="recovery-answer" style={{ display: "block", marginBottom: 6 }}>
              Your answer
            </label>
            <div className="row gap-8" style={{ position: "relative" }}>
              <input
                id="recovery-answer"
                type={showAnswer ? "text" : "password"}
                autoComplete="off"
                value={answer}
                maxLength={80}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Answer"
                className="input"
                style={{ width: "100%", padding: "14px 44px 14px 16px" }}
              />
              <button
                type="button"
                onClick={() => setShowAnswer((v) => !v)}
                aria-label={showAnswer ? "Hide answer" : "Show answer"}
                className="recovery-eye-btn"
              >
                {showAnswer ? <EyeOff size={18} color="var(--ink-400)" /> : <Eye size={18} color="var(--ink-400)" />}
              </button>
            </div>
          </div>

          <div>
            <label className="tiny semi muted" htmlFor="recovery-confirm" style={{ display: "block", marginBottom: 6 }}>
              Confirm answer
            </label>
            <div className="row gap-8" style={{ position: "relative" }}>
              <input
                id="recovery-confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="off"
                value={confirmAnswer}
                maxLength={80}
                onChange={(e) => setConfirmAnswer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
                placeholder="Type answer again"
                className="input"
                style={{ width: "100%", padding: "14px 44px 14px 16px" }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide confirmation" : "Show confirmation"}
                className="recovery-eye-btn"
              >
                {showConfirm ? <EyeOff size={18} color="var(--ink-400)" /> : <Eye size={18} color="var(--ink-400)" />}
              </button>
            </div>
          </div>
        </div>

        <p className="tiny muted" style={{ marginTop: 12, lineHeight: 1.45 }}>
          Answers aren&apos;t case-sensitive. Avoid answers others could guess from your public profile.
        </p>

        {error && (
          <div className="small" style={{ color: "var(--red-600)", marginTop: 10 }} role="alert">
            {error}
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy}
          onClick={() => void handleSubmit()}
          style={{ marginTop: 16 }}
        >
          {busy ? "Please wait…" : submitLabel}
        </button>

        {onBack && (
          <button type="button" className="btn btn-ghost btn-block" onClick={onBack} style={{ marginTop: 8 }}>
            Back
          </button>
        )}
      </div>

      {pickerOpen && (
        <RecoveryQuestionPicker
          kind={kind}
          selectedId={questionId}
          onSelect={(id) => {
            setQuestionId(id);
            setLocalError("");
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
