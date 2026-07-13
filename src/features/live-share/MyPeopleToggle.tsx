import { useRef, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "@/components/Icons";
import { useApp } from "@/store";
import { useLiveShare } from "./useLiveShare";

const LONG_PRESS_MS = 500;

/**
 * "My People" header toggle — replaces the old Home tile.
 *   Tap:        instantly start/stop sharing your live location with your
 *               emergency contacts (no confirmation sheet — press and go).
 *   Long-press: open the My People hub (manage contacts / see status).
 * Lives in the same icon-btn row as chat/notifications on Home.
 */
export default function MyPeopleToggle({ size = 20 }: { size?: number }) {
  const nav = useNavigate();
  const { showToast } = useApp();
  const { activeShareId, busy, start, stop } = useLiveShare();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const sharing = !!activeShareId;

  function clearTimer() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }

  function onPressStart() {
    longPressed.current = false;
    clearTimer();
    timerRef.current = setTimeout(() => {
      longPressed.current = true;
      nav("/safety");
    }, LONG_PRESS_MS);
  }

  async function onPressEnd() {
    clearTimer();
    if (longPressed.current) { longPressed.current = false; return; }
    if (busy) return;
    if (sharing) {
      await stop();
      showToast("Live location sharing stopped");
    } else {
      const id = await start();
      showToast(id ? "Live location shared with My People" : "Couldn't start sharing — add a contact first");
    }
  }

  function onPressCancel() {
    clearTimer();
    longPressed.current = false;
  }

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
    <button
      className="icon-btn"
      style={style}
      onPointerDown={onPressStart}
      onPointerUp={() => void onPressEnd()}
      onPointerLeave={onPressCancel}
      onPointerCancel={onPressCancel}
      onContextMenu={(e) => e.preventDefault()}
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
  );
}
