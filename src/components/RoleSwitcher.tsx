import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Store, Briefcase, User, ChevronDown, Package } from "@/components/Icons";
import { useAccountOptions } from "@/hooks/useAccountOptions";
import { useLongPress } from "@/hooks/useLongPress";
import AccountSwitcher from "@/components/AccountSwitcher";
import { HatSwitcherList } from "@/components/HatSwitcherList";

const PANEL_WIDTH = 260;

const ICONS = { customer: User, business: Store, provider: Briefcase, delivery: Package } as const;
const COLORS = { customer: "var(--brand-600)", business: "var(--orange-500)", provider: "var(--green-500)", delivery: "var(--delivery-600)" } as const;

/**
 * Replaces the old one-tap "Switch to Customer" toggle buttons with a real
 * dropdown: click the current identity, pick any of your hats from a list
 * (not just a binary back-and-forth), same panel everywhere it's used
 * (manage-console headers, desktop sidebar).
 */
export default function RoleSwitcher({
  theme = "light",
  enableLongPress = false,
}: {
  theme?: "light" | "dark-pill";
  /** Long-press/right-click opens the full AccountSwitcher sheet, matching
   *  the customer bottom-nav's Profile tab. A plain click still just toggles
   *  the inline dropdown below — nothing existing changes. */
  enableLongPress?: boolean;
}) {
  const { options, current, pick, canAddBusiness, canBecomeProvider, nav } = useAccountOptions();
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [fullSwitcher, setFullSwitcher] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { handlers: longPress, wrapTap } = useLongPress(() => setFullSwitcher(true));

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    setAlignRight(rect.left + PANEL_WIDTH > window.innerWidth);
  }, [open]);

  const CurIcon = ICONS[current?.type ?? "customer"];
  const curColor = COLORS[current?.type ?? "customer"];
  const triggerClick = enableLongPress ? wrapTap(() => setOpen((v) => !v)) : () => setOpen((v) => !v);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        className="row gap-6"
        onClick={triggerClick}
        {...(enableLongPress ? longPress : {})}
        aria-label={enableLongPress ? "Switch account — long-press for all options" : "Switch account"}
        style={
          theme === "dark-pill"
            ? { padding: "6px 10px 6px 6px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 100, color: "#fff", alignItems: "center" }
            : { padding: "6px 10px 6px 6px", background: "var(--ink-50)", border: "1px solid var(--line)", borderRadius: 100, color: "var(--ink-800)", alignItems: "center" }
        }
      >
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: curColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CurIcon size={12} />
        </span>
        <span className="tiny semi" style={{ color: "inherit", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current?.name ?? "Personal"}
        </span>
        <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
      </button>

      {fullSwitcher && <AccountSwitcher onClose={() => setFullSwitcher(false)} />}

      {open && (
        <div
          className="card"
          style={{
            position: "absolute", top: "calc(100% + 8px)",
            ...(alignRight ? { right: 0 } : { left: 0 }),
            zIndex: 500,
            width: PANEL_WIDTH, padding: 8, background: "#fff", color: "var(--ink-900)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)", border: "1px solid var(--line)",
          }}
        >
          <HatSwitcherList
            options={options}
            pick={(opt) => { pick(opt); setOpen(false); }}
            canAddBusiness={canAddBusiness}
            canBecomeProvider={canBecomeProvider}
            onAddBusiness={() => { setOpen(false); nav("/onboard/business"); }}
            onBecomeProvider={() => { setOpen(false); nav("/onboard/provider"); }}
            onManageAll={() => { setOpen(false); nav("/manage"); }}
          />
        </div>
      )}
    </div>
  );
}
