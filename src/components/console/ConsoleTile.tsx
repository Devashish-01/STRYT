import type { CSSProperties, ReactNode } from "react";
import {
  BadgeCheck, CalendarClock, Clock, ImageIcon, LayoutGrid,
  Megaphone, Package, Users, Wallet,
} from "@/components/Icons";
import type { ConsoleCapability } from "@/lib/businessPackages";

/**
 * One owner-console action tile. Replaces the two near-identical local
 * components that had already drifted apart — `GrowAction` in ManageDashboard
 * (icon: ReactNode) and `GrowTile` in ProviderDashboard (icon: Component +
 * color) — so both consoles speak one visual language.
 *
 * Built on the existing `.pf-tile` CSS rather than a new one: it already ships
 * the `--pf-tint`/`--pf-accent` custom-property hooks this needs for per-tile
 * theming (see DESIGN_PRINCIPLES §4, "use these, don't reinvent").
 */
export function ConsoleTile({
  icon, label, sub, tint, accent, badge, onClick,
}: {
  icon: ReactNode;
  label: string;
  sub?: string;
  tint: string;
  accent: string;
  badge?: number;
  onClick: () => void;
}) {
  const themed = { "--pf-tint": tint, "--pf-accent": accent } as CSSProperties;
  return (
    <button className="pf-tile" style={themed} onClick={onClick}>
      {badge ? <span className="count-badge feature-card-badge">{badge > 9 ? "9+" : badge}</span> : null}
      <span className="pf-tile-icon">{icon}</span>
      <span className="pf-tile-body">
        <span className="pf-tile-label ellipsis">{label}</span>
        {sub ? <span className="pf-tile-sub ellipsis">{sub}</span> : null}
      </span>
    </button>
  );
}

/** The 2-up grid the tiles sit in. */
export function ConsoleTileGrid({ children }: { children: ReactNode }) {
  return <div className="pf-tiles">{children}</div>;
}

/**
 * Per-capability icon tint/accent. Keyed by capability — NOT by package key —
 * so adding a vertical never touches this file (businessPackages.ts's rule:
 * "no consumer should branch on a package key itself").
 */
export const CAPABILITY_TONE: Record<ConsoleCapability, { tint: string; accent: string }> = {
  catalog:  { tint: "var(--brand-50)",    accent: "var(--brand-600)" },
  photos:   { tint: "var(--pink-100)",    accent: "var(--pink-600)" },
  hours:    { tint: "var(--brand-50)",    accent: "var(--brand-700)" },
  bookings: { tint: "var(--brand-50)",    accent: "var(--brand-600)" },
  queue:    { tint: "var(--amber-100)",   accent: "var(--amber-700)" },
  delivery: { tint: "var(--delivery-50)", accent: "var(--delivery-600)" },
  payments: { tint: "var(--green-100)",   accent: "var(--green-600)" },
  verify:   { tint: "var(--green-100)",   accent: "var(--green-600)" },
  promote:  { tint: "var(--pink-100)",    accent: "var(--pink-600)" },
};

/** Per-capability icon, shared by both consoles so a tile looks the same
 *  wherever it appears. Keyed by capability, never by package key. */
export const CAPABILITY_ICON: Record<ConsoleCapability, ReactNode> = {
  catalog:  <LayoutGrid size={20} />,
  photos:   <ImageIcon size={20} />,
  hours:    <Clock size={20} />,
  bookings: <CalendarClock size={20} />,
  queue:    <Users size={20} />,
  delivery: <Package size={20} />,
  payments: <Wallet size={20} />,
  verify:   <BadgeCheck size={20} />,
  promote:  <Megaphone size={20} />,
};
