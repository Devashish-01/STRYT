import { useEffect } from "react";
import { useAccountOptions } from "@/hooks/useAccountOptions";
import { HatSwitcherList } from "@/components/HatSwitcherList";

interface HatSwitcherPopoverProps {
  onClose: () => void;
  onSeeAll: () => void;
}

/** Upward popover anchored above the footer — opened by long-pressing Profile tab. */
export default function HatSwitcherPopover({ onClose, onSeeAll }: HatSwitcherPopoverProps) {
  const { options, pick, canAddBusiness, canBecomeProvider, nav } = useAccountOptions();

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  function handlePick(opt: Parameters<typeof pick>[0]) {
    pick(opt);
    onClose();
  }

  return (
    <>
      <div className="hat-switcher-backdrop" onClick={onClose} aria-hidden />
      <div className="hat-switcher-popover card" role="dialog" aria-label="Switch account">
        <div className="hat-switcher-popover-header">
          <h3 className="semi small" style={{ margin: 0 }}>Switch account</h3>
          <p className="tiny muted" style={{ margin: "2px 0 0" }}>Pick what you&apos;re managing</p>
        </div>
        <HatSwitcherList
          options={options}
          pick={handlePick}
          canAddBusiness={canAddBusiness}
          canBecomeProvider={canBecomeProvider}
          onAddBusiness={() => { onClose(); nav("/onboard/business"); }}
          onBecomeProvider={() => { onClose(); nav("/onboard/provider"); }}
          onManageAll={() => { onClose(); nav("/manage"); }}
          onSeeAll={() => { onClose(); onSeeAll(); }}
          showSeeAll
        />
      </div>
    </>
  );
}
