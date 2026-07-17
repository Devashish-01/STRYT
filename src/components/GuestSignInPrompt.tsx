import { useNavigate, useLocation } from "react-router-dom";
import { useApp } from "@/store";
import { returnTo } from "@/lib/returnTo";

/**
 * Replaces an action area for signed-out visitors (GUEST_MODE_PLAN.md §3).
 *
 * Guest mode is strictly view-only: a guest sees the shop/provider/request/post
 * exactly as it is, but gets no controls to act on it — no book, message, call,
 * follow, like, comment or join-queue. Rather than showing dead or gated
 * buttons, the whole action region is swapped for this single prompt, so the
 * only thing they *can* press is the one that turns them into a member.
 *
 * Renders nothing for signed-in users, so call sites can wrap unconditionally.
 */
export default function GuestSignInPrompt({
  message = "Sign in to interact",
  compact = false,
}: {
  /** What signing in unlocks *here* — be specific ("Sign in to book or message"). */
  message?: string;
  /** Inline/tight placements (inside a card) vs. a full-width action bar. */
  compact?: boolean;
}) {
  const { isGuest } = useApp();
  const nav = useNavigate();
  const location = useLocation();

  if (!isGuest) return null;

  function go() {
    returnTo.remember(location.pathname + location.search);
    nav("/auth/phone");
  }

  if (compact) {
    return (
      <button
        onClick={go}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          width: "100%", padding: "9px 12px", borderRadius: 12,
          background: "var(--brand-50)", border: "1px solid var(--brand-200)",
          color: "var(--brand-700)", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
        }}
      >
        {message}
      </button>
    );
  }

  return (
    <button
      onClick={go}
      className="btn btn-primary btn-block"
      style={{ marginTop: 16 }}
    >
      {message}
    </button>
  );
}
