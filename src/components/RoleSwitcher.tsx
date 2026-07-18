import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Store, Briefcase, User, Plus, ChevronDown } from "@/components/Icons";
import { SafeImg } from "@/components/common";
import { useAccountOptions, type AccountOption } from "@/hooks/useAccountOptions";
import { useLongPress } from "@/hooks/useLongPress";
import AccountSwitcher from "@/components/AccountSwitcher";

const PANEL_WIDTH = 260;

const ICONS = { customer: User, business: Store, provider: Briefcase } as const;
const COLORS = { customer: "var(--brand-600)", business: "var(--orange-500)", provider: "var(--green-500)" } as const;

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

  // The panel has no portal and no popper-style collision detection — anchor
  // it from the right edge instead of the left whenever the trigger sits
  // close enough to the viewport edge that a fixed 260px-wide panel would
  // run off-screen.
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
          <div className="col gap-2">
            {options.map((opt) => (
              <OptionRow key={`${opt.type}:${opt.id}`} opt={opt} onClick={() => { pick(opt); setOpen(false); }} />
            ))}
          </div>

          <div className="divider" style={{ margin: "8px 0" }} />

          <div className="col gap-1">
            {canAddBusiness && (
              <ActionRow emoji="🏪" label="Add a business" onClick={() => { setOpen(false); nav("/onboard/business"); }} />
            )}
            {canBecomeProvider && (
              <ActionRow emoji="🛠️" label="Become a provider" onClick={() => { setOpen(false); nav("/onboard/provider"); }} />
            )}
            <ActionRow emoji="🗂️" label="Manage all" onClick={() => { setOpen(false); nav("/manage"); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function OptionRow({ opt, onClick }: { opt: AccountOption; onClick: () => void }) {
  const Icon = ICONS[opt.type];
  const color = COLORS[opt.type];
  return (
    <button
      className="row gap-10"
      style={{ width: "100%", padding: "8px 8px", borderRadius: 10, textAlign: "left", background: opt.active ? "var(--ink-50)" : "transparent" }}
      onClick={onClick}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <SafeImg src={opt.avatar} variant="avatar" className="avatar" style={{ width: 34, height: 34 }} />
        <span style={{ position: "absolute", bottom: -2, right: -2, width: 15, height: 15, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
          <Icon size={9} />
        </span>
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="semi small ellipsis">{opt.name}</div>
        <div className="tiny muted">{opt.sub}</div>
      </div>
      {opt.active && <Check size={16} color={color} style={{ flexShrink: 0 }} />}
    </button>
  );
}

function ActionRow({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button className="row gap-10" style={{ width: "100%", padding: "8px 8px", borderRadius: 10, textAlign: "left" }} onClick={onClick}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--ink-50)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{emoji}</span>
      <span className="semi small">{label}</span>
    </button>
  );
}
