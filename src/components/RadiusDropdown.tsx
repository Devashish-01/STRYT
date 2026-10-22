import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "@/components/Icons";
import RadiusSelector from "@/components/RadiusSelector";
import { haptics } from "@/lib/haptics";

// Radius as a compact pill — tapping it drops down the existing RadiusSelector
// (unchanged, still shared with every other screen that uses it) instead of
// leaving the full preset row permanently visible above the results.
export default function RadiusDropdown({
  value, onChange, accentColor = "var(--brand-600)", label, align = "right",
}: {
  value: number;
  onChange: (v: number) => void;
  accentColor?: string;
  label: string;
  /** Which side the popover hangs from — "right" (default, for a button sitting
   *  near the right edge of a row) or "left" (for the narrow desktop sidebar,
   *  where opening rightward into the main content area is what has room). */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const valueLabel = value >= 5000 ? "🌍 World" : value === 0.5 ? "500m" : `${value} km`;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="chip"
        style={{ gap: 6 }}
        onClick={() => { haptics.selection(); setOpen((v) => !v); }}
      >
        📍 {valueLabel}
        <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", [align]: 0, zIndex: 1010, width: "min(280px, calc(100vw - 32px))" }}>
          <RadiusSelector
            value={value}
            onChange={(v) => { onChange(v); setOpen(false); }}
            accentColor={accentColor}
            label={label}
          />
        </div>
      )}
    </div>
  );
}
