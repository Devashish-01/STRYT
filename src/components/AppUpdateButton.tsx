import { useState } from "react";
import { RefreshCw } from "@/components/Icons";
import { useApp } from "@/store";
import { useAppUpdate, applyPendingUpdate } from "@/lib/appUpdate";

/**
 * "Update available" button for the native app. Renders nothing until the OTA
 * updater has downloaded a new bundle in the background (see appUpdate.ts). On
 * tap it swaps to the new bundle and reloads the WebView — so nothing after the
 * applyPendingUpdate() call runs (the JS context is destroyed by the reload).
 *
 * No-op on web: useAppUpdate() only ever returns non-null on the native app.
 */
export default function AppUpdateButton() {
  const pending = useAppUpdate();
  const { showToast } = useApp();
  const [applying, setApplying] = useState(false);

  if (!pending) return null;

  return (
    <button
      className="btn btn-primary btn-block"
      style={{ marginBottom: 12 }}
      disabled={applying}
      onClick={async () => {
        setApplying(true);
        try {
          await applyPendingUpdate();
          // If we get here the reload didn't fire — surface it instead of
          // leaving the button spinning forever.
          showToast("Couldn't apply the update. Try again.");
          setApplying(false);
        } catch {
          showToast("Couldn't apply the update. Try again.");
          setApplying(false);
        }
      }}
    >
      <RefreshCw size={18} />
      {applying ? "Updating…" : `Update available — tap to update to v${pending.version}`}
    </button>
  );
}
