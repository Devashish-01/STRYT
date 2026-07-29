import type { ReactNode } from "react";
import { ChevronRight } from "@/components/Icons";

/**
 * The settings vocabulary — one shared answer for the three things every
 * settings-style screen needs (a titled group, a row that navigates, a row
 * that toggles).
 *
 * These existed 11 times over before this: 5 nav-row implementations and 6
 * switches, disagreeing on chevron size/colour, icon size and container shape,
 * whether the hint sits under the label or right-aligned, and whether the
 * divider is on the top or bottom edge. Screens should compose these instead
 * of hand-rolling another variant — see DESIGN_PRINCIPLES §4 ("use these,
 * don't reinvent").
 *
 * Styling lives in index.css under "Settings rows" so the shape is themeable
 * from one place and no component ships hardcoded colours.
 */

export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title && <div className="profile-eyebrow">{title}</div>}
      <div className="set-group">{children}</div>
    </section>
  );
}

interface RowProps {
  icon?: ReactNode;
  label: string;
  /** Secondary line under the label. Use for what the row does, not its state. */
  hint?: string;
  /** Right-aligned current value, e.g. the active language. */
  value?: string;
  badge?: ReactNode;
  onClick: () => void;
  /** Red treatment for destructive rows (delete account, etc.). */
  danger?: boolean;
}

/** A row that navigates somewhere. Always renders a chevron — if it doesn't
 *  lead anywhere, it should be a SettingsToggleRow or plain content instead. */
export function SettingsRow({ icon, label, hint, value, badge, onClick, danger }: RowProps) {
  return (
    <button className={`set-row${danger ? " set-row-danger" : ""}`} onClick={onClick}>
      {icon && <span className="set-row-icon">{icon}</span>}
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="set-row-label" style={{ display: "block" }}>{label}</span>
        {hint && <span className="set-row-hint" style={{ display: "block" }}>{hint}</span>}
      </span>
      {badge}
      {value && <span className="set-row-value ellipsis">{value}</span>}
      <ChevronRight size={18} color="var(--ink-300)" />
    </button>
  );
}

interface ToggleProps {
  icon?: ReactNode;
  label: string;
  hint?: string;
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

/** A row whose whole job is one boolean. The switch carries role="switch" +
 *  aria-checked + an accessible name, which none of the six hand-rolled
 *  toggles this replaces did (DESIGN_PRINCIPLES §9 requires it). */
export function SettingsToggleRow({ icon, label, hint, on, onChange, disabled }: ToggleProps) {
  return (
    <div className="set-row">
      {icon && <span className="set-row-icon">{icon}</span>}
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="set-row-label" style={{ display: "block" }}>{label}</span>
        {hint && <span className="set-row-hint" style={{ display: "block" }}>{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        className="set-switch"
        onClick={() => onChange(!on)}
      />
    </div>
  );
}
