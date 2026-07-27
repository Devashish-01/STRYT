import { Check, X } from "@/components/Icons";
import type { EntityPasswordKind, EntityRecoveryQuestionId } from "@/services/core/entityPasswordService";
import { presetQuestionsForKind, recoveryQuestionLabel } from "@/lib/entityPasswordRecovery";
import { haptics } from "@/lib/haptics";

/**
 * iOS-style preset list for choosing a backup reset question.
 * Renders as a stacked sheet above an existing overlay (z-index 110).
 */
export default function RecoveryQuestionPicker({
  kind,
  selectedId,
  onSelect,
  onClose,
}: {
  kind: EntityPasswordKind;
  selectedId: EntityRecoveryQuestionId | null;
  onSelect: (id: EntityRecoveryQuestionId) => void;
  onClose: () => void;
}) {
  const options = presetQuestionsForKind(kind);

  return (
    <div
      className="overlay recovery-picker-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a backup question"
    >
      <div className="sheet recovery-picker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="row between center-v" style={{ marginBottom: 12 }}>
          <h3 className="bold h2">Backup question</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="small muted" style={{ marginBottom: 14 }}>
          Pick something only you would know. You&apos;ll use this answer if you forget your password.
        </p>

        <div className="recovery-picker-list" role="listbox">
          {options.map((id) => {
            const active = selectedId === id;
            const isCustom = id === "custom";
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={active}
                className={`recovery-picker-option ${active ? "active" : ""}`}
                onClick={() => {
                  haptics.selection();
                  onSelect(id);
                  if (!isCustom) onClose();
                }}
              >
                <span className="recovery-picker-option-label">
                  {isCustom ? recoveryQuestionLabel(id) : recoveryQuestionLabel(id)}
                </span>
                {active && (
                  <span className="recovery-picker-check" aria-hidden>
                    <Check size={18} strokeWidth={2.6} color="var(--brand-600)" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedId === "custom" && (
          <button type="button" className="btn btn-primary btn-block" onClick={onClose} style={{ marginTop: 14 }}>
            Continue with custom question
          </button>
        )}
      </div>
    </div>
  );
}
