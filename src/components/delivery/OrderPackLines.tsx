import { inr } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { lineTotal, orderTotal, type OrderLine } from "@/lib/orderLines";
import { enrichOrderLinesWithStock, hasStockShortage, type StockHealth } from "@/lib/orderStockEnrichment";
import type { CatalogItem } from "@/types";
import { Check, AlertTriangle } from "@/components/Icons";
import { haptics } from "@/lib/haptics";

export function OrderPackLines({
  lines,
  catalog,
  fee,
  mode = "review",
  checkedItemIds,
  onToggleItem,
  showStockBadges = true,
}: {
  lines: readonly OrderLine[];
  catalog?: readonly CatalogItem[];
  fee?: number;
  /** "review" = clean inspection with stock badges; "pack" = interactive packing checklist */
  mode?: "review" | "pack";
  checkedItemIds?: ReadonlySet<string>;
  onToggleItem?: (catalogItemId: string) => void;
  showStockBadges?: boolean;
}) {
  const { t } = useI18n();
  const extra = fee && fee > 0 ? fee : 0;
  const enriched = enrichOrderLinesWithStock(lines, catalog);
  const shortage = hasStockShortage(enriched);

  const totalLines = lines.length;
  const checkedCount = checkedItemIds ? lines.filter((l) => checkedItemIds.has(l.catalogItemId)).length : 0;
  const allPacked = mode === "pack" && totalLines > 0 && checkedCount === totalLines;

  function renderStockBadge(health: StockHealth, avail: number | null, shortageN: number) {
    if (!showStockBadges || health === "UNTRACKED") return null;

    if (health === "OUT_OF_STOCK") {
      return (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--red-600)",
            background: "var(--red-50)",
            padding: "1px 6px",
            borderRadius: 6,
            border: "1px solid var(--red-200)",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          ❌ {t("stock_out_of_stock") || "Out of stock"}
        </span>
      );
    }

    if (health === "SHORTAGE") {
      return (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--red-600)",
            background: "var(--red-50)",
            padding: "1px 6px",
            borderRadius: 6,
            border: "1px solid var(--red-200)",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          ⚠️ {avail != null ? `${avail} in stock (need ${shortageN} more)` : "Shortage"}
        </span>
      );
    }

    if (health === "LOW_STOCK") {
      return (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--amber-800)",
            background: "var(--amber-50)",
            padding: "1px 6px",
            borderRadius: 6,
            border: "1px solid var(--amber-200)",
          }}
        >
          ⚡ {avail != null ? `Only ${avail} left` : "Low stock"}
        </span>
      );
    }

    if (health === "IN_STOCK" && avail != null) {
      return (
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--green-700)",
            background: "var(--green-50)",
            padding: "1px 6px",
            borderRadius: 6,
            border: "1px solid var(--green-200)",
          }}
        >
          ✓ {avail} in stock
        </span>
      );
    }

    return null;
  }

  return (
    <div className="col gap-6" style={{ background: "var(--ink-50)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px" }}>
      {/* Shortage warning banner */}
      {shortage && (
        <div
          className="row gap-6 center-v"
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            background: "var(--red-50)",
            border: "1px solid var(--red-200)",
            color: "var(--red-700)",
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          <AlertTriangle size={14} color="var(--red-600)" />
          <span>Notice: One or more ordered items have limited or zero catalog stock.</span>
        </div>
      )}

      {/* Packing Progress Bar in pack mode */}
      {mode === "pack" && totalLines > 1 && (
        <div className="col gap-4" style={{ paddingBottom: 6, borderBottom: "1px solid var(--line)" }}>
          <div className="row between center-v">
            <span className="tiny semi" style={{ color: allPacked ? "var(--green-700)" : "var(--ink-600)" }}>
              {allPacked ? "✓ All items checked & packed" : `Packing progress: ${checkedCount}/${totalLines} items`}
            </span>
            <span className="tiny muted">{Math.round((checkedCount / totalLines) * 100)}%</span>
          </div>
          <div style={{ width: "100%", height: 5, background: "var(--line)", borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                width: `${(checkedCount / totalLines) * 100}%`,
                height: "100%",
                background: allPacked ? "var(--green-500)" : "var(--brand-500)",
                transition: "width 0.2s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Item rows */}
      <div className="col gap-8">
        {enriched.map((l, i) => {
          const isChecked = checkedItemIds?.has(l.catalogItemId) ?? false;
          return (
            <div
              key={`${l.catalogItemId}-${i}`}
              className="row between gap-8 center-v"
              onClick={
                mode === "pack" && onToggleItem
                  ? () => {
                      haptics.selection();
                      onToggleItem(l.catalogItemId);
                    }
                  : undefined
              }
              style={{
                cursor: mode === "pack" ? "pointer" : "default",
                userSelect: "none",
                opacity: mode === "pack" && isChecked ? 0.65 : 1,
              }}
            >
              <div className="row gap-8 center-v grow" style={{ minWidth: 0 }}>
                {mode === "pack" && (
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      border: isChecked ? "none" : "2px solid var(--ink-300)",
                      background: isChecked ? "var(--green-500)" : "var(--surface)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isChecked && <Check size={13} color="var(--white)" />}
                  </div>
                )}
                <div className="col" style={{ minWidth: 0 }}>
                  <div
                    className="tiny semi"
                    style={{
                      overflowWrap: "anywhere",
                      textDecoration: mode === "pack" && isChecked ? "line-through" : "none",
                    }}
                  >
                    <span style={{ color: "var(--brand-700)", fontWeight: 700 }}>{l.quantity} ×</span> {l.name}
                  </div>
                  <div style={{ marginTop: 2 }}>
                    {renderStockBadge(l.stockHealth, l.availableQuantity, l.shortageCount)}
                  </div>
                </div>
              </div>

              <span className="tiny muted tabular-nums" style={{ flexShrink: 0 }}>
                {inr(lineTotal(l))}
              </span>
            </div>
          );
        })}
      </div>

      {/* Fee & Total */}
      {extra > 0 && (
        <div className="row between" style={{ borderTop: "1px dashed var(--line)", paddingTop: 6, marginTop: 2 }}>
          <span className="tiny muted">{t("ord_delivery_fee")}</span>
          <span className="tiny muted tabular-nums">{inr(extra)}</span>
        </div>
      )}

      {(lines.length > 1 || extra > 0) && (
        <div className="row between center-v" style={{ borderTop: "1px solid var(--line)", paddingTop: 6, marginTop: 2 }}>
          <span className="tiny semi">{t("ord_total")}</span>
          <span className="tiny bold tabular-nums" style={{ color: "var(--ink-900)", fontSize: 13 }}>
            {inr(orderTotal(lines) + extra)}
          </span>
        </div>
      )}
    </div>
  );
}
