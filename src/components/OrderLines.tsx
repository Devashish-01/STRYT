import { inr } from "@/lib/format";
import { lineTotal, orderTotal, type OrderLine } from "@/lib/orderLines";

/**
 * What was actually bought: one row per item (quantity, name, line price) and,
 * for more than one item, a total. Shown on the shop's and the customer's
 * booking cards so an order reads as items, not as "3 items".
 */
export function OrderLines({ lines }: { lines: readonly OrderLine[] }) {
  return (
    <div className="col gap-4" style={{ background: "var(--ink-50)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px" }}>
      {lines.map((l, i) => (
        <div key={`${l.catalogItemId}-${i}`} className="row between gap-8" style={{ alignItems: "baseline" }}>
          <span className="tiny semi" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <span style={{ color: "var(--brand-700)" }}>{l.quantity} ×</span> {l.name}
          </span>
          <span className="tiny muted" style={{ flexShrink: 0 }}>{inr(lineTotal(l))}</span>
        </div>
      ))}
      {lines.length > 1 && (
        <div className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 4, marginTop: 2 }}>
          <span className="tiny muted">Total</span>
          <span className="tiny bold">{inr(orderTotal(lines))}</span>
        </div>
      )}
    </div>
  );
}
