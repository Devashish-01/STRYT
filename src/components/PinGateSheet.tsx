import { useNavigate } from "react-router-dom";
import { useApp } from "@/store";
import PinEntrySheet from "@/components/PinEntrySheet";

/**
 * Mounted once in App.tsx. Watches pendingContextSwitch (set by
 * attemptSwitchContext in store.tsx when a switch into business/provider
 * needs the PIN) and renders the verify sheet on top of whatever screen is
 * currently showing. Renders nothing when there's no pending switch.
 */
export default function PinGateSheet() {
  const nav = useNavigate();
  const { pendingContextSwitch, confirmPendingSwitch, cancelPendingSwitch } = useApp();

  if (!pendingContextSwitch) return null;

  return (
    <PinEntrySheet
      mode="verify"
      onClose={cancelPendingSwitch}
      onVerified={() => {
        const dest = confirmPendingSwitch();
        if (dest) nav(dest);
      }}
    />
  );
}
