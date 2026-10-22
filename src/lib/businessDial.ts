import type { ConsoleCapability } from "./businessPackages";
import type { Scope } from "@/services/marketplace/businessAccessService";

/**
 * What the business console's quick dial offers. The owner's tools used to be six tabs, which crowded the bottom bar and
 * hid half of them from anyone with a long label; they are now a ring of round shortcuts that opens above Home.
 *
 * Which circles appear depends on who is looking and what this business does — the same rules the old tabs and the hub
 * used (a scoped team member only gets what their grant covers; a business that takes no bookings never sees Appointments;
 * delivery stays out of sight while the feature flag is off). The order follows the business's own package, so a clinic's
 * first circle is Appointments and a shop's is its store.
 */
export type DialId =
  | "appointments"
  | "queue"
  | "deliveries"
  | "my-deliveries"
  | "store"
  | "business"
  | "messages"
  | "payments"
  | "hours"
  | "reviews"
  | "features";

export interface DialItem {
  id: DialId;
  to: string;
  /** i18n key — or `label` for the one name that comes from the business's package ("Menu", "Store"). */
  labelKey?: string;
  label?: string;
  badge?: number;
}

export interface DialContext {
  businessId: string;
  base: string;
  isOwner: boolean;
  hasScope: (scope: Scope) => boolean;
  bookingsOn: boolean;
  /** A queue exists (or has people in it) — the old tab only showed then; setup is offered from "Add features". */
  queueUsed: boolean;
  queueWaiting: number;
  deliveryOn: boolean;
  hasActiveDeliveries: boolean;
  storeLabel: string;
  /** The package's own ordering of what matters, from its console config. */
  consoleOrder: ConsoleCapability[];
  /** The package's own words for those ("Consultations", "Waiting room", "Menu"), which beat the generic labels. */
  consoleLabels?: Partial<Record<ConsoleCapability, string>>;
}

/** Which dial circle a package's console capability leads to. */
const FOR_CAPABILITY: Partial<Record<ConsoleCapability, DialId>> = {
  bookings: "appointments",
  queue: "queue",
  delivery: "deliveries",
  catalog: "store",
  inbox: "messages",
  payments: "payments",
  hours: "hours",
};

/** Only the circles whose destination really is that capability take the package's name for it — "Messages" opens chats, not
 *  the leads inbox the package calls "Reachouts", so it keeps its own label. */
const CAPABILITY_OF: Partial<Record<DialId, ConsoleCapability>> = {
  appointments: "bookings",
  queue: "queue",
  deliveries: "delivery",
  store: "catalog",
  payments: "payments",
  hours: "hours",
};

/** Order for anything the package didn't mention. */
const DEFAULT_ORDER: DialId[] = ["appointments", "queue", "deliveries", "my-deliveries", "store", "messages", "payments", "hours", "reviews", "business"];

export function buildDialItems(ctx: DialContext): DialItem[] {
  const { base, businessId, hasScope, isOwner } = ctx;
  const available: Record<DialId, DialItem | null> = {
    appointments: hasScope("appointments") && ctx.bookingsOn ? { id: "appointments", to: `${base}/appointments`, labelKey: "nav_appointments" } : null,
    queue: hasScope("queue") && ctx.queueUsed ? { id: "queue", to: `${base}/queue`, labelKey: "nav_queue", badge: ctx.queueWaiting } : null,
    deliveries: ctx.deliveryOn && hasScope("appointments") ? { id: "deliveries", to: `${base}/deliveries`, labelKey: "bdial_live_deliveries" } : null,
    "my-deliveries": ctx.deliveryOn && ctx.hasActiveDeliveries ? { id: "my-deliveries", to: `${base}/my-deliveries`, labelKey: "nav_deliveries" } : null,
    store: hasScope("catalog") ? { id: "store", to: `${base}/store`, label: ctx.storeLabel } : null,
    business: { id: "business", to: `${base}/business`, labelKey: "nav_business" },
    messages: hasScope("leads") ? { id: "messages", to: `/chats?scope=BUSINESS&id=${businessId}`, labelKey: "messages_header" } : null,
    payments: isOwner ? { id: "payments", to: `${base}/payments`, labelKey: "bdial_payments" } : null,
    hours: hasScope("catalog") ? { id: "hours", to: `${base}/hours`, labelKey: "bdial_hours" } : null,
    reviews: isOwner ? { id: "reviews", to: `${base}/reviews`, labelKey: "bdial_reviews" } : null,
    features: isOwner ? { id: "features", to: `${base}/features`, labelKey: "bdial_features" } : null,
  };

  const order: DialId[] = [];
  const push = (id: DialId | undefined) => { if (id && !order.includes(id)) order.push(id); };
  for (const cap of ctx.consoleOrder) push(FOR_CAPABILITY[cap]);
  for (const id of DEFAULT_ORDER) push(id);

  const named = (item: DialItem): DialItem => {
    const cap = CAPABILITY_OF[item.id];
    const own = cap ? ctx.consoleLabels?.[cap] : undefined;
    return own ? { ...item, label: own } : item;
  };
  const items = order.flatMap((id) => (available[id] ? [named(available[id] as DialItem)] : []));
  // "Add features" always closes the ring: it is the way to everything that isn't switched on yet.
  const features = available.features;
  return features ? [...items, features] : items;
}
