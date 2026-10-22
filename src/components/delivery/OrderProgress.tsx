import { ORDER_STAGES } from "@/lib/deliveryStage";

/**
 * The customer's whole-order progress line: placed → accepted → packed → partner assigned → picked up → on the way → delivered.
 * Same dots as DeliveryStepper (teal for done), but it begins when the order is placed rather than when a rider appears.
 * `index` comes from orderStageIndex(); -1 (ended without being delivered) draws every dot grey.
 */
export default function OrderProgress({ index, compact }: { index: number; compact?: boolean }) {
  const dot = compact ? 7 : 9;
  return (
    <div className="row" style={{ gap: 4, alignItems: "center" }} role="img" aria-label={index >= 0 ? `Step ${index + 1} of ${ORDER_STAGES.length}` : undefined}>
      {ORDER_STAGES.map((stage, i) => {
        const done = index >= 0 && i <= index;
        return (
          <div key={stage} className="row center-v" style={{ gap: 4, flex: i < ORDER_STAGES.length - 1 ? 1 : "0 0 auto" }}>
            <span style={{ width: dot, height: dot, borderRadius: "50%", background: done ? "var(--delivery-600)" : "var(--ink-200)", flexShrink: 0 }} />
            {i < ORDER_STAGES.length - 1 && (
              <span style={{ flex: 1, height: 2, background: index >= 0 && i < index ? "var(--delivery-600)" : "var(--ink-200)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
