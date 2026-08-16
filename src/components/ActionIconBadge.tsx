import React from "react";
import type { Icon, IconWeight } from "@phosphor-icons/react";

export type IconBadgeVariant =
  | "amber"
  | "sunset"
  | "emerald"
  | "indigo"
  | "violet"
  | "rose"
  | "cyan";

export type IconBadgeSize = "sm" | "md" | "lg";

export interface ActionIconBadgeProps {
  icon: Icon | React.ComponentType<any>;
  variant?: IconBadgeVariant;
  size?: IconBadgeSize;
  weight?: IconWeight;
  className?: string;
}

const ICON_SIZES: Record<IconBadgeSize, number> = {
  sm: 18,
  md: 24,
  lg: 28,
};

export function ActionIconBadge({
  icon: IconComponent,
  variant = "violet",
  size = "md",
  weight = "duotone",
  className = "",
}: ActionIconBadgeProps) {
  const iconPixelSize = ICON_SIZES[size] ?? 24;

  return (
    <div
      className={`action-icon-badge action-icon-badge--${variant} action-icon-badge--${size} ${className}`.trim()}
      aria-hidden="true"
    >
      <div className="action-icon-badge__specular" />
      <IconComponent size={iconPixelSize} weight={weight} className="action-icon-badge__glyph" />
    </div>
  );
}

export default ActionIconBadge;
