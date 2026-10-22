import type { BusinessPackageKey, ConsoleCapability } from "./businessPackages";

/**
 * The "Add features" catalogue: everything a business on STRYT can switch on, in plain words, so an owner of any kind of
 * business — a clinic, a corner shop, a food stall, a tutor — can see what exists, what suits them, and where to start.
 *
 * The ideas are the staples small-business apps converge on (online booking, a walk-in queue, pickup and delivery, a
 * catalogue or menu, payments, reviews, offers, a team). Every entry here is something the app already does; nothing is a
 * promise. Wording is generic on purpose — no currency, payment scheme or country is assumed — so it reads the same
 * anywhere in the world.
 *
 * Which entries a given business is shown first comes from its package (src/lib/businessPackages.ts): `bestFor` lists the
 * packages an idea suits most, and the order of the package's own console actions breaks ties.
 */
export type FeatureId =
  | "bookings"
  | "queue"
  | "delivery"
  | "catalog"
  | "photos"
  | "hours"
  | "payments"
  | "bulk"
  | "updates"
  | "qna"
  | "team"
  | "verify"
  | "reach";

/** Icon name, resolved to a component by the screen (this file stays free of React). */
export type FeatureIcon = "calendar" | "users" | "package" | "grid" | "image" | "clock" | "wallet" | "tag" | "megaphone" | "help" | "team" | "badge" | "globe";

export type FeatureAction =
  /** Flips a setting on the business right here. */
  | { kind: "toggle"; field: "bookingsEnabled" | "deliveryEnabled" }
  /** Opens the screen where it is set up; `path` is relative to the console root, or absolute if it starts with "/". */
  | { kind: "route"; path: string };

export interface FeatureDef {
  id: FeatureId;
  icon: FeatureIcon;
  titleKey: string;
  pitchKey: string;
  bestFor: BusinessPackageKey[] | "all";
  action: FeatureAction;
  /** Where the toggle's own screen is, once it's on ("Open" next to "Turn off"). */
  manage?: string;
  /** Console capability this lines up with, so the package's own ordering can rank it. */
  capability?: ConsoleCapability;
  /** Only shown while the delivery feature flag is on — delivery is dark in builds that haven't shipped it. */
  needsDeliveryFlag?: boolean;
  /** Needs the owner (settings, money, verification) rather than any team member. */
  ownerOnly?: boolean;
}

export const FEATURES: FeatureDef[] = [
  { id: "bookings", icon: "calendar", titleKey: "bfeat_bookings_t", pitchKey: "bfeat_bookings_p", capability: "bookings",
    bestFor: ["clinic", "diagnostics", "vet", "salon", "homeservice", "learning", "fitness", "professional", "events", "dining"],
    action: { kind: "toggle", field: "bookingsEnabled" }, manage: "/appointments", ownerOnly: true },
  { id: "queue", icon: "users", titleKey: "bfeat_queue_t", pitchKey: "bfeat_queue_p", capability: "queue",
    bestFor: ["clinic", "diagnostics", "vet", "pharmacy", "dining", "takeaway", "salon", "shop"],
    action: { kind: "route", path: "/queue" } },
  { id: "delivery", icon: "package", titleKey: "bfeat_delivery_t", pitchKey: "bfeat_delivery_p", capability: "delivery",
    bestFor: ["shop", "pharmacy", "takeaway", "dining"],
    action: { kind: "route", path: "/settings" }, needsDeliveryFlag: true, ownerOnly: true },
  { id: "catalog", icon: "grid", titleKey: "bfeat_catalog_t", pitchKey: "bfeat_catalog_p", capability: "catalog",
    bestFor: "all", action: { kind: "route", path: "/catalog" } },
  { id: "photos", icon: "image", titleKey: "bfeat_photos_t", pitchKey: "bfeat_photos_p", capability: "photos",
    bestFor: "all", action: { kind: "route", path: "/portfolio" } },
  { id: "hours", icon: "clock", titleKey: "bfeat_hours_t", pitchKey: "bfeat_hours_p", capability: "hours",
    bestFor: "all", action: { kind: "route", path: "/hours" } },
  { id: "payments", icon: "wallet", titleKey: "bfeat_payments_t", pitchKey: "bfeat_payments_p", capability: "payments",
    bestFor: "all", action: { kind: "route", path: "/payments" }, ownerOnly: true },
  { id: "bulk", icon: "tag", titleKey: "bfeat_bulk_t", pitchKey: "bfeat_bulk_p",
    bestFor: ["shop", "pharmacy", "takeaway", "dining", "events"], action: { kind: "route", path: "/bulk-deals" } },
  { id: "updates", icon: "megaphone", titleKey: "bfeat_updates_t", pitchKey: "bfeat_updates_p", capability: "promote",
    bestFor: "all", action: { kind: "route", path: "/community" }, ownerOnly: true },
  { id: "qna", icon: "help", titleKey: "bfeat_qna_t", pitchKey: "bfeat_qna_p", capability: "inbox",
    bestFor: "all", action: { kind: "route", path: "/qna" } },
  { id: "team", icon: "team", titleKey: "bfeat_team_t", pitchKey: "bfeat_team_p",
    bestFor: "all", action: { kind: "route", path: "/account/business-access" }, ownerOnly: true },
  { id: "verify", icon: "badge", titleKey: "bfeat_verify_t", pitchKey: "bfeat_verify_p", capability: "verify",
    bestFor: "all", action: { kind: "route", path: "/verify" }, ownerOnly: true },
  { id: "reach", icon: "globe", titleKey: "bfeat_reach_t", pitchKey: "bfeat_reach_p",
    bestFor: "all", action: { kind: "route", path: "/broadcast" }, ownerOnly: true },
];

/** What the screen knows about this business. */
export interface FeatureContext {
  bookingsOn: boolean;
  deliveryOn: boolean;
  queueUsed: boolean;
  catalogCount: number;
  galleryCount: number;
  hoursSet: boolean;
  verified: boolean;
  deliveryFlag: boolean;
  isOwner: boolean;
}

/** "on" = working now · "off" = available, not switched on · "todo" = started but not finished · "tool" = no on/off state. */
export type FeatureStatus = "on" | "off" | "todo" | "tool";

export function featureStatus(def: FeatureDef, ctx: FeatureContext): FeatureStatus {
  switch (def.id) {
    case "bookings": return ctx.bookingsOn ? "on" : "off";
    case "queue": return ctx.queueUsed ? "on" : "off";
    case "delivery": return ctx.deliveryOn ? "on" : "off";
    case "catalog": return ctx.catalogCount > 0 ? "on" : "todo";
    case "photos": return ctx.galleryCount > 0 ? "on" : "todo";
    case "hours": return ctx.hoursSet ? "on" : "todo";
    case "verify": return ctx.verified ? "on" : "todo";
    default: return "tool";
  }
}

export function visibleFeatures(ctx: FeatureContext): FeatureDef[] {
  return FEATURES.filter((f) => (!f.needsDeliveryFlag || ctx.deliveryFlag) && (!f.ownerOnly || ctx.isOwner));
}

export interface RankedFeatures {
  /** Suit this kind of business and aren't switched on yet — where to start. */
  recommended: FeatureDef[];
  /** Available, but less usual for this kind of business. */
  more: FeatureDef[];
  /** Already working. */
  active: FeatureDef[];
}

export function rankFeatures(pkg: BusinessPackageKey, consoleOrder: ConsoleCapability[], ctx: FeatureContext): RankedFeatures {
  const suits = (f: FeatureDef) => f.bestFor === "all" || f.bestFor.includes(pkg) || pkg === "generic";
  const rankOf = (f: FeatureDef) => {
    const i = f.capability ? consoleOrder.indexOf(f.capability) : -1;
    return i === -1 ? 1000 : i;
  };
  const order = (a: FeatureDef, b: FeatureDef) => rankOf(a) - rankOf(b) || FEATURES.indexOf(a) - FEATURES.indexOf(b);
  const all = visibleFeatures(ctx);
  const isOn = (f: FeatureDef) => featureStatus(f, ctx) === "on";
  return {
    recommended: all.filter((f) => suits(f) && !isOn(f)).sort(order),
    more: all.filter((f) => !suits(f) && !isOn(f)).sort(order),
    active: all.filter(isOn).sort(order),
  };
}

/** Where a feature's action leads, as a full path: console screens hang off `base`, account screens are already absolute. */
export function featurePath(base: string, path: string): string {
  return path.startsWith("/account/") ? path : `${base}${path}`;
}
