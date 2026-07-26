import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/** Back navigation that falls back to a tab root when there is no history. */
export function useSmartBack(fallback = "/home") {
  const nav = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === "number" && idx > 0) nav(-1);
    else nav(fallback);
  }, [nav, fallback]);
}
