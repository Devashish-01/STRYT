import { Minus, Plus } from "@/components/Icons";
import { SafeImg, VegDot, inr } from "@/components/common";
import type { BusinessPackage } from "@/lib/businessPackages";
import type { CatalogItem } from "@/types";

/**
 * Photo-forward 2-column grid catalog rendering (used by packages whose
 * `catalogRenderMode` is `"grid"` — dining, takeaway, shop, events), reusing
 * whatever `cart` state and `add()` handler the caller's own list rendering
 * uses so the two modes never drift out of sync with each other. Extracted
 * out of BusinessDetail.tsx (Phase 3, Business Packages) so ProviderDetail.tsx
 * can render the exact same grid a themed provider (e.g. a Home Chef) needs,
 * instead of a second hand-rolled copy.
 */
export function BizCatalogGrid({
  catalog, cart, add, isOwner, isGuest, bizTheme, bookingsOn = true, onOpenPhoto, onBook,
}: {
  catalog: CatalogItem[];
  cart: Record<string, number>;
  add: (itemId: string, delta: number) => void;
  isOwner: boolean;
  isGuest: boolean;
  bizTheme: BusinessPackage;
  /** Structural "does this business/provider take bookings at all" — hides
   *  the per-item CTA regardless of bizTheme.catalogItemCta.show when false.
   *  Defaults true so callers that don't have the concept yet are unaffected. */
  bookingsOn?: boolean;
  onOpenPhoto: (item: CatalogItem) => void;
  onBook: (item: CatalogItem) => void;
}) {
  return (
    <div className="biz-catalog-grid">
      {catalog.map((item) => {
        const qty = cart[item.id] ?? 0;
        return (
          <div key={item.id} className="biz-catalog-grid-card">
            <SafeImg
              src={item.image}
              alt={item.name}
              className="biz-catalog-grid-img"
              style={{ cursor: "pointer" }}
              onClick={() => onOpenPhoto(item)}
            />
            <div className="biz-catalog-grid-body">
              <div className="row gap-4 center-v" style={{ flexWrap: "wrap", minHeight: 16 }}>
                {item.isVeg != null && <VegDot veg={item.isVeg} />}
                {item.bestSeller && <span className="badge badge-amber">⭐</span>}
              </div>
              <div className="semi ellipsis" style={{ marginTop: 4, fontSize: 14 }}>{item.name}</div>
              <div className="row gap-6" style={{ marginTop: 2 }}>
                <span className="bold small">{inr(item.salePrice ?? item.price)}</span>
                {item.salePrice && <span className="tiny muted" style={{ textDecoration: "line-through" }}>{inr(item.price)}</span>}
              </div>
              {item.stockStatus === "OUT_OF_STOCK" && <span className="badge badge-red" style={{ marginTop: 6 }}>Out of stock</span>}
              {!isOwner && !isGuest && bookingsOn && bizTheme.catalogItemCta.show && item.stockStatus !== "OUT_OF_STOCK" && (
                <button
                  className="btn btn-outline btn-sm"
                  style={{ marginTop: 8, fontSize: 11, padding: "4px 10px", color: "var(--biz-accent-strong)", borderColor: "var(--brand-200)", width: "100%" }}
                  onClick={() => onBook(item)}
                >{bizTheme.catalogItemCta.label}</button>
              )}
              {!isGuest && !isOwner && bizTheme.showCartStepper && item.stockStatus !== "OUT_OF_STOCK" && (
                qty === 0 ? (
                  <button
                    className="btn btn-sm btn-block"
                    style={{ marginTop: 8, background: "#fff", color: "var(--green-600)", border: "1.5px solid var(--green-500)", fontWeight: 800 }}
                    onClick={() => add(item.id, 1)}
                  >ADD</button>
                ) : (
                  <div className="row between" style={{ marginTop: 8, background: "var(--green-500)", borderRadius: 10, color: "#fff" }}>
                    <button style={{ padding: "6px 9px", color: "#fff" }} onClick={() => add(item.id, -1)}><Minus size={14} /></button>
                    <span className="bold" style={{ minWidth: 18, textAlign: "center" }}>{qty}</span>
                    <button style={{ padding: "6px 9px", color: "#fff" }} onClick={() => add(item.id, 1)}><Plus size={14} /></button>
                  </div>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
