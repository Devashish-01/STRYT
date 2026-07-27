import { useState } from "react";
import type { EntityPasswordKind } from "@/services/core/entityPasswordService";
import { entityPasswordService } from "@/services";
import { useApp } from "@/store";
import RecoveryQuestionStep, { type RecoveryQuestionValue } from "./RecoveryQuestionStep";

/**
 * Standalone sheet for setting or updating a backup recovery question.
 * Used from Settings (Phase 6) and previewable during Phase 3 development.
 */
export default function RecoveryQuestionSheet({
  kind,
  mode,
  currentPassword,
  onClose,
  onSaved,
}: {
  kind: EntityPasswordKind;
  /** `setup` = first-time alongside new password (caller handles password RPC).
   *  `update` = change Q&A on an existing password (requires current password). */
  mode: "setup" | "update";
  /** Required when mode is `update`. */
  currentPassword?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { refreshEntityPasswordStatus, showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const label = kind === "business" ? "business" : "provider";

  async function handleSubmit(value: RecoveryQuestionValue) {
    setBusy(true);
    setError("");
    try {
      if (mode === "update") {
        if (!currentPassword) {
          setError("Current password is required.");
          return;
        }
        await entityPasswordService.setRecovery(
          kind,
          value.questionId,
          value.answer,
          currentPassword,
          value.questionText,
        );
        showToast("Backup question updated");
      } else {
        // setup mode: caller should use setupWithRecovery with password — this
        // sheet is only for update flows unless extended in Phase 4.
        throw new Error("Use the password setup wizard for first-time setup.");
      }
      await refreshEntityPasswordStatus();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the backup question.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <RecoveryQuestionStep
          kind={kind}
          title={mode === "update" ? "Update backup question" : "Set a backup question"}
          subtitle={`Used only if you forget your ${label} password.`}
          submitLabel={mode === "update" ? "Save question" : "Continue"}
          busy={busy}
          error={error}
          onSubmit={handleSubmit}
        />
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose} style={{ marginTop: 8 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
