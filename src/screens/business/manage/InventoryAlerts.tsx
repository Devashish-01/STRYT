import { useParams } from "react-router-dom";
import { useState } from "react";
import { AppBar } from "@/components/common";
import { AlertTriangle, ChevronRight, Package, Check, X } from "@/components/Icons";
import { businessService, providerService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";
import { ListSkeleton, ErrorView } from "@/components/states";
import type { CatalogItem } from "@/types";
import { ItemEditor, type Kind } from "./CatalogManager";
import { resolvePackage, BUSINESS_PACKAGES } from "@/lib/businessPackages";

const LOW_STOCK_THRESHOLD = 5;

/**
 * Inventory management for a business or provider.
 *
 * This was "Inventory alerts": a read-only-ish list of just the flagged items,
 * where the only way to change anything was to open the full item editor. It
 * was reported as needing to be "inventory management" — so it now actually
 * manages inventory:
 *
 *   · the WHOLE catalogue is listed, with flagged items surfaced first
 *   · stock can be toggled in/out and quantity nudged inline, without opening
 *     the editor for a one-number change
 *   · the full editor is still one tap away for everything else
 *
 * Renaming the screen without this would have over-promised — which is why the
 * nav entry said "Inventory" while the screen still said "alerts".
 */
export function InventoryAlerts({ kind }: { kind: Kind }) {
  const { id = "" } = useParams();
  const { showToast } = useApp();
  const { data: entity, loading, refetch } = useQuery<{ catalog: CatalogItem[]; categoryName?: string; subCategory?: string; packageKey?: string | null } | undefined>(
    () => (kind === "business" ? businessService.get(id) : providerService.get(id)),
    [id],
    kind === "business" ? `business:${id}` : `provider:${id}`
  );
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
  const bizTheme = BUSINESS_PACKAGES[resolvePackage(entity)];
  const isOut = (i: CatalogItem) => i.stockStatus === "OUT_OF_STOCK";
  const isLow = (i: CatalogItem) =>
    i.inventoryType === "FINITE" && !isOut(i) && (i.quantity ?? 0) <= LOW_STOCK_THRESHOLD;

  const outOfStock = catalog.filter(isOut);
  const lowStock = catalog.filter(isLow);
  const healthy = catalog.filter((i) => !isOut(i) && !isLow(i));
  const totalFlagged = outOfStock.length + lowStock.length;

  /** Optimistic-feeling inline write, then refetch so the section it belongs to updates. */
  async function patch(item: CatalogItem, changes: Partial<CatalogItem>, okMsg: string) {
    if (busyId) return;
    setBusyId(item.id);
    haptics.selection();
    try {
      await businessService.updateCatalogItem(id, item.id, changes);
      showToast(okMsg);
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't update — try again");
    } finally {
      setBusyId(null);
    }
  }

  function toggleStock(item: CatalogItem) {
    const goingOut = !isOut(item);
    void patch(
      item,
      goingOut
        ? { stockStatus: "OUT_OF_STOCK" }
        // Coming back in stock with no quantity on a tracked item would leave it
        // instantly "0 left" and auto-hidden again, so give it one.
        : { stockStatus: "IN_STOCK", ...(item.inventoryType === "FINITE" && !(item.quantity ?? 0) ? { quantity: 1 } : {}) },
      goingOut ? `${item.name} marked unavailable` : `${item.name} is back in stock`,
    );
  }

  function nudge(item: CatalogItem, delta: number) {
    const next = Math.max(0, (item.quantity ?? 0) + delta);
    void patch(
      item,
      // Hitting zero IS going out of stock — keep the two fields consistent
      // rather than leaving a "0 left" item still marked available.
      next === 0 ? { quantity: 0, stockStatus: "OUT_OF_STOCK" } : { quantity: next, stockStatus: "IN_STOCK" },
      next === 0 ? `${item.name} is now out of stock` : `${item.name}: ${next} left`,
    );
  }

  function row(item: CatalogItem) {
    const out = isOut(item);
    const low = isLow(item);
    const finite = item.inventoryType === "FINITE";
    const busy = busyId === item.id;

    return (
      <div key={item.id} className="card col gap-10" style={{ padding: 12, opacity: busy ? 0.6 : 1 }}>
        <button className="row gap-12 center-v" style={{ width: "100%", textAlign: "left" }} onClick={() => setEditing(item)}>
          {item.image
            ? <img src={item.image} alt={item.name} className="thumb" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
            : <div style={{ width: 48, height: 48, borderRadius: 10, background: "var(--ink-100)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Package size={20} color="var(--ink-400)" /></div>
          }
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="semi small ellipsis">{item.name}</div>
            <div className="tiny semi" style={{ color: out ? "var(--red-600)" : low ? "var(--amber-700)" : "var(--green-600)", marginTop: 2 }}>
              {out ? "Unavailable" : finite ? `${item.quantity ?? 0} left` : "Always available"}
            </div>
          </div>
          <ChevronRight size={17} color="var(--ink-300)" />
        </button>

        {/* Inline controls — the difference between "alerts" and "management".
            A shopkeeper marking one thing sold out shouldn't have to open a
            full product form to do it. */}
        <div className="row gap-8 center-v">
          <button
            type="button"
            className="btn btn-sm btn-outline row gap-6 center"
            style={{ flex: 1, borderColor: out ? "var(--green-500)" : "var(--red-500)", color: out ? "var(--green-600)" : "var(--red-600)" }}
            disabled={busy}
            onClick={() => toggleStock(item)}
          >
            {out ? <><Check size={14} /> Back in stock</> : <><X size={14} /> Mark sold out</>}
          </button>

          {finite && !out && (
            <div className="row gap-6 center-v">
              <button type="button" className="btn btn-sm btn-outline" style={{ minWidth: 38 }} disabled={busy} onClick={() => nudge(item, -1)} aria-label="Reduce quantity">−</button>
              <span className="semi small" style={{ minWidth: 26, textAlign: "center" }}>{item.quantity ?? 0}</span>
              <button type="button" className="btn btn-sm btn-outline" style={{ minWidth: 38 }} disabled={busy} onClick={() => nudge(item, 1)} aria-label="Increase quantity">+</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar
        title="Inventory"
        subtitle={totalFlagged > 0
          ? `${totalFlagged} item${totalFlagged === 1 ? "" : "s"} need attention`
          : `${catalog.length} item${catalog.length === 1 ? "" : "s"} · all in stock`}
      />
      <div className="screen-scroll page-pad col gap-18" style={{ paddingBottom: 30 }}>
        {catalog.length === 0 && (
          <div className="col center" style={{ padding: "48px 20px", gap: 12 }}>
            <Package size={36} color="var(--ink-300)" />
            <div className="semi small" style={{ color: "var(--ink-500)" }}>Nothing in your catalogue yet</div>
            <p className="tiny muted center" style={{ maxWidth: 250, lineHeight: 1.5 }}>
              Add products or services from the Catalogue screen and their stock will show up here.
            </p>
          </div>
        )}

        {outOfStock.length > 0 && (
          <section className="col gap-8">
            <div className="row gap-6 center-v small semi" style={{ color: "var(--red-600)" }}>
              <Package size={15} /> Out of stock ({outOfStock.length})
            </div>
            {outOfStock.map(row)}
          </section>
        )}

        {lowStock.length > 0 && (
          <section className="col gap-8">
            <div className="row gap-6 center-v small semi" style={{ color: "var(--amber-700)" }}>
              <AlertTriangle size={15} /> Running low ({lowStock.length})
            </div>
            {lowStock.map(row)}
          </section>
        )}

        {/* Everything else. Previously hidden entirely, which meant you could
            only manage stock for things already in trouble. */}
        {healthy.length > 0 && (
          <section className="col gap-8">
            <div className="row gap-6 center-v small semi" style={{ color: "var(--ink-500)" }}>
              <Check size={15} /> In stock ({healthy.length})
            </div>
            {healthy.map(row)}
          </section>
        )}
      </div>

      {editing && (
        <ItemEditor
          kind={kind}
          targetId={id}
          item={editing}
          bizTheme={bizTheme}
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
