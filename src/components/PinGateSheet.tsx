import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/store";
import PinEntrySheet from "@/components/PinEntrySheet";
import { PasswordRecoverySheet } from "@/components/entity-password";

/**
 * Mounted once in App.tsx. Watches pendingContextSwitch (set by
 * attemptSwitchContext in store.tsx when a switch into a password-protected
 * business/provider needs verification) and renders the verify sheet on top
 * of whatever screen is currently showing.
 */
export default function PinGateSheet() {
  const nav = useNavigate();
  const {
    pendingContextSwitch,
    confirmPendingSwitch,
    cancelPendingSwitch,
    ownedBusinessIds,
    ownedProviderId,
    businessRecoveryIsSet,
    providerRecoveryIsSet,
  } = useApp();

  const [recovering, setRecovering] = useState(false);

  if (!pendingContextSwitch) return null;
  const { ctx } = pendingContextSwitch;
  const kind = ctx.type as "business" | "provider";

  const isOwner =
    kind === "provider"
      ? ctx.id === ownedProviderId
      : !!ctx.id && ownedBusinessIds.includes(ctx.id);

  const canForgot =
    isOwner &&
    (kind === "business" ? businessRecoveryIsSet : providerRecoveryIsSet);

  function finishSwitch() {
    const dest = confirmPendingSwitch();
    if (dest) nav(dest);
  }

  if (recovering) {
    return (
      <PasswordRecoverySheet
        kind={kind}
        onClose={() => setRecovering(false)}
        onReset={finishSwitch}
      />
    );
  }

  return (
    <PinEntrySheet
      mode="verify"
      kind={kind}
      entityId={ctx.id ?? undefined}
      onClose={cancelPendingSwitch}
      onVerified={finishSwitch}
      showForgotPassword={canForgot}
      onForgotPassword={() => setRecovering(true)}
    />
  );
}
