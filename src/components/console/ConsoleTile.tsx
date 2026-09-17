import type { CSSProperties, ReactNode } from "react";

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

