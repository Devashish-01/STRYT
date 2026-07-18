import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/store";
import { returnTo } from "@/lib/returnTo";

/**
 * Gates an action behind sign-in for guests (see GUEST_MODE_PLAN.md §3).
 *
 * Guest mode deliberately leaves action buttons *visible* — a guest who taps
 * "Join queue" and gets asked to sign in has just discovered a reason to sign
 * up, which is the entire point. Hiding the button would hide the reason.
 *
 * Remembers where they were before bouncing to sign-in, so the existing
 * returnTo plumbing lands them right back on the page they were looking at.
 *
 * Usage:
 *   const requireAuth = useRequireAuth();
 *   <button onClick={requireAuth(() => book(item), "Sign in to book")}>Book</button>
 *
 * For signed-in users this is a passthrough — `fn` runs exactly as before.
 */
export function useRequireAuth() {
  const { isGuest, showToast } = useApp();
  const nav = useNavigate();
  const location = useLocation();

  return useCallback(
    <A extends unknown[]>(fn: (...args: A) => void | Promise<void>, message?: string) =>
      (...args: A) => {
        if (!isGuest) return fn(...args);
        returnTo.remember(location.pathname + location.search);
        if (message) showToast(message);
        nav("/auth/phone");
      },
    [isGuest, nav, location.pathname, location.search, showToast]
  );
}
