import { useParams } from "react-router-dom";
import { useState } from "react";
import { AppBar } from "@/components/common";
import { AlertTriangle, ChevronRight, Package } from "@/components/Icons";
import { businessService, providerService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import type { CatalogItem } from "@/types";
import { ItemEditor, type Kind } from "./CatalogManager";

const LOW_STOCK_THRESHOLD = 5;

// Business/provider view of "what needs attention" in the catalogue — split
// out from CatalogManager (which lists everything) so an owner with a large
// menu/catalog can see exactly what's sold out or about to be, at a glance,
// without scrolling the full listing to spot the "○ Sold out" rows.
export function InventoryAlerts({ kind }: { kind: Kind }) {
  const { id = "" } = useParams();
  const { data: entity, loading, refetch } = useQuery<{ catalog: CatalogItem[] } | undefined>(
    () => (kind === "business" ? businessService.get(id) : providerService.get(id)),
    [id],
    kind === "business" ? `business:${id}` : `provider:${id}`
  );
  const [editing, setEditing] = useState<CatalogItem | null>(null);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Inventory" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  if (loading) return <div className="screen"><AppBar title="Inventory" /><ListSkeleton count={3} /></div>;
  if (!entity) return null;

  const catalog: CatalogItem[] = entity.catalog ?? [];
  const outOfStock = catalog.filter((item) => item.stockStatus === "OUT_OF_STOCK");
  const lowStock = catalog.filter(
    (item) => item.inventoryType === "FINITE" && item.stockStatus !== "OUT_OF_STOCK" && (item.quantity ?? 0) <= LOW_STOCK_THRESHOLD
  );
  const totalFlagged = outOfStock.length + lowStock.length;

  function row(item: CatalogItem, tone: "red" | "amber") {
    return (
      <button key={item.id} className="card row gap-12 center-v" style={{ padding: 12, textAlign: "left" }} onClick={() => setEditing(item)}>
        {item.image
          ? <img src={item.image} className="thumb" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
          : <div style={{ width: 48, height: 48, borderRadius: 10, background: "var(--ink-100)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Package size={20} color="var(--ink-400)" /></div>
        }
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="semi small ellipsis">{item.name}</div>
          <div className="tiny semi" style={{ color: tone === "red" ? "var(--red-600)" : "var(--amber-700)", marginTop: 2 }}>
            {item.stockStatus === "OUT_OF_STOCK" ? "Unavailable" : `${item.quantity} left`}
          </div>
        </div>
        <ChevronRight size={17} color="var(--ink-300)" />
      </button>
    );
  }

  return (
    <div className="screen">
      <AppBar title="Inventory" subtitle={totalFlagged > 0 ? `${totalFlagged} item${totalFlagged === 1 ? "" : "s"} need attention` : "Stock status"} />
      <div className="screen-scroll page-pad col gap-18" style={{ paddingBottom: 30 }}>
        {totalFlagged === 0 && (
          <div className="col center" style={{ padding: "48px 20px", gap: 12 }}>
            <Package size={36} color="var(--green-500)" />
            <div className="semi small" style={{ color: "var(--ink-500)" }}>All caught up</div>
            <p className="tiny muted center" style={{ maxWidth: 240, lineHeight: 1.5 }}>
              Nothing is out of stock or running low right now.
            </p>
          </div>
        )}

        {outOfStock.length > 0 && (
          <section className="col gap-8">
            <div className="row gap-6 center-v small semi" style={{ color: "var(--red-600)" }}>
              <Package size={15} /> Out of stock ({outOfStock.length})
            </div>
            {outOfStock.map((item) => row(item, "red"))}
          </section>
        )}

        {lowStock.length > 0 && (
          <section className="col gap-8">
            <div className="row gap-6 center-v small semi" style={{ color: "var(--amber-700)" }}>
              <AlertTriangle size={15} /> Running low ({lowStock.length})
            </div>
            {lowStock.map((item) => row(item, "amber"))}
          </section>
        )}
      </div>

      {editing && (
        <ItemEditor
          kind={kind}
          targetId={id}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch(); }}
        />
      )}
    </div>
  );
}

export default function BusinessInventoryAlerts() {
  return <InventoryAlerts kind="business" />;
}
