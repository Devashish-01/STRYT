import type { AppointmentRecord } from "@/types";

export type OrderLine = NonNullable<AppointmentRecord["items"]>[number];

/** The server caps a package name at 200 characters; stay well inside it. */
const NAME_MAX = 120;

/** "Chai x2, Samosa x1" — the same shape the cart summary uses. */
export function summarizeLines(lines: readonly OrderLine[], max = NAME_MAX): string {
  const text = lines.map((l) => `${l.name} x${l.quantity}`).join(", ");
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function lineTotal(line: OrderLine): number {
  return line.price * line.quantity;
}

export function orderTotal(lines: readonly OrderLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotal(l), 0);
}

/** Maps the embedded `appointment_items` rows of an appointment query to cart lines (oldest first). Undefined when there are none. */
export function linesFromRows(rows: unknown): OrderLine[] | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  const lines = [...rows]
    .sort((a, b) => String(a?.created_at ?? "").localeCompare(String(b?.created_at ?? "")))
    .map((r) => ({
      catalogItemId: String(r?.catalog_item_id ?? ""),
      name: String(r?.item_name ?? "Item"),
      price: Number(r?.unit_price ?? 0),
      quantity: Number(r?.quantity ?? 1),
    }))
    .filter((l) => l.quantity > 0);
  return lines.length > 0 ? lines : undefined;
}

/** The cart-summary note the order sheet used to write ("Order: Milk x1, Oil x1"). With the item lines now stored and shown, it only repeats them. */
export function isAutoOrderNote(note: string | null | undefined, hasItems: boolean): boolean {
  return hasItems && /^Order:\s/i.test((note ?? "").trim());
}

/** What the customer owes for an order: the items plus the delivery fee. */
export function amountDue(apt: { packagePrice?: number | null; deliveryFee?: number | null }): number {
  return (apt.packagePrice ?? 0) + (apt.deliveryFee ?? 0);
}
