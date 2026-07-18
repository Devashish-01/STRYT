import { useState } from "react";
import { X } from "@/components/Icons";

export interface SetupChecklistItem {
  label: string;
  done: boolean;
  onClick: () => void;
}

interface SetupChecklistProps {
  title: string;
  items: SetupChecklistItem[];
  /** Per-entity localStorage key, e.g. `stryt_checklist_dismissed_${id}` —
   *  an owner running multiple businesses/providers dismisses each one's
   *  card independently, not all of them at once. */
  storageKey: string;
}

/**
 * Shared setup-checklist card for the business and provider "Today"
 * dashboards. Used to be two independently hand-rolled versions that never
 * matched (business showed only 2 undone items with no progress indicator;
 * provider showed everything with a progress bar) and neither was
 * dismissible — an owner who deliberately skipped one item saw a nag card at
 * the top of their most-visited screen forever. This adopts the fuller
 * (progress bar + all items) presentation as the shared standard, since a
 * bar is a stronger "almost there" signal than a bare fraction, and now
 * matters more with a dismiss option: worth showing why finishing is close
 * before someone closes the card.
 */
export function SetupChecklist({ title, items, storageKey }: SetupChecklistProps) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === "true");
  const done = items.filter((i) => i.done).length;

  if (dismissed || done === items.length) return null;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row between center-v" style={{ marginBottom: 8 }}>
        <span className="semi small">{title}</span>
        <div className="row gap-8 center-v">
          <span className="tiny semi muted">{done}/{items.length}</span>
          <button
            className="icon-btn"
            style={{ width: 24, height: 24, color: "var(--ink-400)" }}
            aria-label="Dismiss"
            onClick={() => {
              localStorage.setItem(storageKey, "true");
              setDismissed(true);
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--ink-100)", overflow: "hidden", marginBottom: 12 }}>
        <div style={{ height: "100%", width: `${(done / items.length) * 100}%`, background: "var(--green-500)", transition: "width 0.3s" }} />
      </div>
      <div className="col gap-8">
        {items.map((item) => (
          <button
            key={item.label}
            className="row gap-10 align-center"
            style={{ width: "100%", textAlign: "left" }}
            onClick={item.onClick}
            disabled={item.done}
          >
            <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: item.done ? "var(--green-500)" : "var(--ink-100)", color: item.done ? "#fff" : "var(--ink-400)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
              {item.done ? "✓" : ""}
            </span>
            <span className={`small ${item.done ? "muted" : "semi"}`} style={{ textDecoration: item.done ? "line-through" : "none" }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
