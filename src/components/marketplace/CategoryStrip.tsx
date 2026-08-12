import type { ReactNode } from "react";
import type { Category } from "@/types";
import { useI18n } from "@/lib/i18n";

/**
 * Depth-first lookup through the nested category tree `catalogService`
 * returns (roots carrying `.children`). Exported because Home needs to
 * resolve the `?cat=` URL param — which may name a root OR a child — back to
 * the node itself, and the tree is the only place that mapping exists.
 */
export function findCategoryNode(nodes: Category[], id: string): Category | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = node.children ? findCategoryNode(node.children, id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

/**
 * The marketplace's category selector — one horizontal chip rail. Selecting a
 * chip filters the feed below it; selecting the active chip again clears back
 * to "All", so the rail is its own escape hatch (DESIGN_PRINCIPLES §7).
 */
export default function CategoryStrip({
  categories,
  selectedId,
  onSelect,
  sticky = false,
  trailing,
}: {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  sticky?: boolean;
  trailing?: ReactNode;
}) {
  const { t } = useI18n();
  if (categories.length === 0) return null;

  return (
    <div
      className="hscroll"
      style={sticky ? { position: "sticky", top: 0, zIndex: 5, background: "var(--bg)" } : undefined}
    >
      <button
        type="button"
        className={`chip${selectedId === null ? " active" : ""}`}
        onClick={() => onSelect(null)}
      >
        {t("explore_tab_all")}
      </button>

      {categories.map((c) => {
        const active = selectedId === c.id;
        return (
          <button
            key={c.id}
            type="button"
            className={`chip${active ? " active" : ""}`}
            // Tapping the active chip clears the filter rather than being a
            // no-op — otherwise the only way back to "All" is to scroll the
            // rail all the way left.
            onClick={() => onSelect(active ? null : c.id)}
          >
            <span aria-hidden="true">{c.icon}</span> {c.name}
          </button>
        );
      })}

      {trailing}
    </div>
  );
}
