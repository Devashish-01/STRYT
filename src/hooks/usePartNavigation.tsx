import { useCallback, useState, type ReactNode } from "react";
import { useNavigate, type NavigateOptions } from "react-router-dom";
import { useApp } from "@/store";
import { PartSwitchSheet } from "@/components/PartSwitchSheet";
import { switchTarget, type Part } from "@/lib/partNavigation";

/**
 * Navigation that asks before it moves the user into another part of the app.
 *
 * `go(path)` navigates straight away when the path is in the part the user is already in; otherwise it holds the
 * navigation and `sheet` (render it somewhere in the screen) asks "Switch to X?". Used for notification taps and
 * push taps — the places that used to throw a user from, say, a business console into their personal side unasked.
 */
export function usePartNavigation(): { go: (to: string, options?: NavigateOptions) => void; sheet: ReactNode } {
  const nav = useNavigate();
  const { activeContext } = useApp();
  const [pending, setPending] = useState<{ to: string; part: Part; options?: NavigateOptions } | null>(null);

  const go = useCallback(
    (to: string, options?: NavigateOptions) => {
      const part = switchTarget(activeContext, to);
      if (part) setPending({ to, part, options });
      else nav(to, options);
    },
    [activeContext, nav],
  );

  const sheet = pending ? <PartSwitchSheet part={pending.part} to={pending.to} options={pending.options} onClose={() => setPending(null)} /> : null;
  return { go, sheet };
}
