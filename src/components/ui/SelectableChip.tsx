import React from "react";

function syncRadioTabStops(group: Element) {
  const radios = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]')).filter((radio) => !radio.disabled);
  const tabStop = radios.find((radio) => radio.getAttribute("aria-checked") === "true") ?? radios[0];
  radios.forEach((radio) => { radio.tabIndex = radio === tabStop ? 0 : -1; });
}

export interface SelectableChipProps {
  label?: React.ReactNode;
  children?: React.ReactNode;
  selected: boolean;
  onSelect?: () => void;
  onClick?: () => void;
  icon?: React.ComponentType<{ size?: number | string; className?: string; [key: string]: any }>;
  role?: "radio" | "checkbox" | "button";
  disabled?: boolean;
  badge?: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
  style?: React.CSSProperties;
}

export function SelectableChip({
  label,
  children,
  selected,
  onSelect,
  onClick,
  icon: Icon,
  role = "button",
  disabled = false,
  badge,
  size = "md",
  className = "",
  style,
}: SelectableChipProps) {
  const isSm = size === "sm";
  const content = children ?? label;
  const handleClick = onSelect ?? onClick;
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    const group = buttonRef.current?.closest('[role="radiogroup"]');
    if (role === "radio" && group) syncRadioTabStops(group);
  }, [role, selected, disabled]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (role !== "radio") return;
    const group = event.currentTarget.closest('[role="radiogroup"]');
    if (!group) return;
    const radios = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]')).filter((radio) => !radio.disabled);
    const index = radios.indexOf(event.currentTarget);
    if (index < 0 || radios.length === 0) return;
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown": nextIndex = (index + 1) % radios.length; break;
      case "ArrowLeft":
      case "ArrowUp": nextIndex = (index - 1 + radios.length) % radios.length; break;
      case "Home": nextIndex = 0; break;
      case "End": nextIndex = radios.length - 1; break;
      default: return;
    }
    event.preventDefault();
    radios[nextIndex].focus();
    radios[nextIndex].click();
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      role={role}
      aria-pressed={role === "button" ? selected : undefined}
      aria-checked={role === "radio" || role === "checkbox" ? selected : undefined}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`chip ${selected ? "active chip--selected" : ""} ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        minHeight: isSm ? 38 : 44,
        padding: isSm ? "6px 12px" : "8px 16px",
        borderRadius: 999,
        border: selected ? "1.5px solid var(--brand-600)" : "1.5px solid var(--ink-200)",
        background: selected ? "var(--brand-50)" : "var(--surface)",
        color: selected ? "var(--brand-700)" : "var(--ink-800)",
        fontWeight: selected ? 600 : 500,
        fontSize: isSm ? 13 : 14,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s ease",
        touchAction: "manipulation",
        ...style,
      }}
    >
      {Icon && <Icon size={isSm ? 14 : 16} />}
      <span>{content}</span>
      {badge && <span style={{ marginLeft: 2 }}>{badge}</span>}
    </button>
  );
}

export default SelectableChip;
