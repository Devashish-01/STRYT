import { useState } from "react";
import PinEntrySheet from "@/components/PinEntrySheet";
import type { EntityPasswordKind } from "@/services/core/entityPasswordService";
import RecoveryQuestionSheet from "./RecoveryQuestionSheet";

/**
 * Settings flow: verify current password, then set/update backup question.
 */
export default function RecoveryBackfillSheet({
  kind,
  onClose,
  onSaved,
}: {
  kind: EntityPasswordKind;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState<string | null>(null);

  if (!currentPassword) {
    return (
      <PinEntrySheet
        mode="verify"
        kind={kind}
        onClose={onClose}
        onVerified={(password) => setCurrentPassword(password)}
      />
    );
  }

  return (
    <RecoveryQuestionSheet
      kind={kind}
      mode="update"
      currentPassword={currentPassword}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
