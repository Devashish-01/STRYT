import type { ReactNode } from "react";
import { inr } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { lineTotal, orderTotal, type OrderLine } from "@/lib/orderLines";

/**
 * What was actually bought: one row per item (quantity, name, line price) and,
 * for more than one item, a total. Shown on the shop's and the customer's
 * booking cards so an order reads as items, not as "3 items".
 */
export function OrderLines({
  lines,
  fee,
  footer,
}: {
  lines: readonly OrderLine[];
  /** Home-delivery fee: shown as its own line and added into the total. */
  fee?: number;
  /** Optional inline receipt footer (e.g. unified payment status) inside the same box. */
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const extra = fee && fee > 0 ? fee : 0;
  return (
    <div className="col gap-4" style={{ background: "var(--ink-50)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
      {lines.map((l, i) => (
        <div key={`${l.catalogItemId}-${i}`} className="row between gap-8" style={{ alignItems: "baseline" }}>
          <span className="tiny semi" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <span style={{ color: "var(--brand-700)" }}>{l.quantity} ×</span> {l.name}
          </span>
          <span className="tiny muted tabular-nums" style={{ flexShrink: 0 }}>{inr(lineTotal(l))}</span>
        </div>
      ))}
      {extra > 0 && (
        <div className="row between">
          <span className="tiny muted">{t("ord_delivery_fee")}</span>
          <span className="tiny muted tabular-nums">{inr(extra)}</span>
        </div>
      )}
      {(lines.length > 1 || extra > 0) && (
        <div className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 6, marginTop: 2 }}>
          <span className="tiny semi">{t("ord_total")}</span>
          <span className="tiny bold tabular-nums">{inr(orderTotal(lines) + extra)}</span>
        </div>
      )}
      {footer && (
        <div style={{ borderTop: "1px dashed var(--line)", paddingTop: 8, marginTop: 4 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
