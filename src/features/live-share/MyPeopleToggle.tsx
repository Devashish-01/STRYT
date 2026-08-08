import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "@/components/Icons";
import { useApp } from "@/store";
import { useLongPress } from "@/hooks/useLongPress";
import { haptics } from "@/lib/haptics";
import { useLiveShare } from "./useLiveShare";
import LiveShareExplainer from "./LiveShareExplainer";

const LONG_PRESS_MS = 500;
/** Set once the user has been told what live sharing does. Per device. */
const EXPLAINED_KEY = "stryt_live_share_explained_v1";

function hasBeenExplained(): boolean {
  try {
    return localStorage.getItem(EXPLAINED_KEY) === "1";
  } catch {
    // Storage blocked (private mode) — fail toward SHOWING the explainer.
    // Explaining twice is a minor annoyance; starting an unexplained live
    // location broadcast is not.
    return false;
  }
}

function rememberExplained(): void {
  try { localStorage.setItem(EXPLAINED_KEY, "1"); } catch { /* best-effort */ }
}

/**
 * "My People" header toggle — replaces the old Home tile.
 *   Tap:        start/stop sharing your live location with your emergency
 *               contacts. The FIRST start shows an explainer (see below).
 *   Long-press: open the My People hub (manage contacts / see status).
 * Lives in the same icon-btn row as chat/notifications on Home.
 *
 * This used to be "press and go" with no explanation. The only sheet in the
 * path was the Android background-location PERMISSIONS notice, which explains
 * a permission rather than the feature, and is suppressed after first accept —
 * so a customer had no in-app answer to "what did I just turn on, and who can
 * see me?". Stopping needs no confirmation: it's the safe direction.
 */
export default function MyPeopleToggle({ size = 20 }: { size?: number }) {
  const nav = useNavigate();
  const { showToast } = useApp();
  const { activeShareId, busy, start, stop } = useLiveShare();
  const [explaining, setExplaining] = useState(false);
  const sharing = !!activeShareId;

  async function beginShare() {
    const id = await start();
    if (id) showToast("Live location shared with My People");
    // null = declined disclosure, no contacts / RPC failure, or cancelled — avoid noisy toast on decline
  }

  async function handleTap() {
    if (busy || explaining) return;
    if (sharing) {
      // Stopping is the safe direction — never gated.
      haptics.selection();
      await stop();
      showToast("Live location sharing stopped");
      return;
    }
    if (!hasBeenExplained()) {
      setExplaining(true);
      return;
    }
    haptics.selection();
    await beginShare();
  }

  async function confirmExplainer() {
    // Remembered on CONFIRM, not on open — dismissing without starting must
    // not count as having been told.
    rememberExplained();
    setExplaining(false);
    await beginShare();
  }

  function openSettings() {
    haptics.medium();
    nav("/safety");
  }

  // Touch+Mouse events (not Pointer Events) — same pairing BottomNav's
  // account-switcher long-press uses, which is the more reliable one across
  // Android/iOS WebViews. Explicit 500ms to keep the existing feel rather than
  // the hook's 450ms default.
  const { handlers: longPress, wrapTap } = useLongPress(openSettings, LONG_PRESS_MS);
  const onTap = wrapTap(() => void handleTap());

  const style: CSSProperties = {
    background: sharing ? "var(--accent-500)" : "rgba(255,255,255,0.16)",
    color: "#fff",
    border: "none",
    position: "relative",
    WebkitTouchCallout: "none",
    userSelect: "none",
    touchAction: "manipulation",
  };

  return (
    <>
    {explaining && (
      <LiveShareExplainer
        onConfirm={() => void confirmExplainer()}
        onClose={() => setExplaining(false)}
      />
    )}
    <button
      className="icon-btn"
      style={style}
      onClick={onTap}
      {...longPress}
      disabled={busy}
      aria-label={sharing ? "Stop sharing with My People (hold to open My People)" : "Share with My People (hold to open My People)"}
      title="Tap to share · hold to open My People"
    >
      <Users size={size} />
      {sharing && (
        <span style={{
          position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%",
          background: "#fff", boxShadow: "0 0 0 0 rgba(255,255,255,0.7)",
          animation: "livePulseRing 1.6s ease-out infinite",
        }} />
      )}
    </button>
    </>
  );
}
