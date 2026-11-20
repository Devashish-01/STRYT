/**
 * Dynamic Storefront Action Engine
 *
 * Implements the Round 2 specification from brainstorm.md:
 * Eliminates static "Book Appointment" buttons for retail, kiranas, supermarkets,
 * bakeries, and cloud kitchens, dynamically resolving primary and secondary actions
 * from the business operating model and fulfillment capabilities.
 */

import type { Business } from "@/types/marketplace";
import { resolvePackage, BUSINESS_PACKAGES } from "@/lib/businessPackages";

export type StorefrontFulfillmentKind =
  | "RETAIL_COMMERCE"
  | "FOOD_DINING_TAKEAWAY"
  | "SERVICE_APPOINTMENT"
  | "HEALTHCARE_CONSULT"
  | "FIELD_SERVICE_DISPATCH"
  | "BATCH_OR_SESSION"
  | "PROFESSIONAL_QUOTE"
  | "RETAIL_SHOWROOM";

export interface ResolvedStorefrontActions {
  operatingModel: StorefrontFulfillmentKind;
  isCommerce: boolean;
  canDeliver: boolean;
  canPickup: boolean;
  canBookSlot: boolean;
  canJoinQueue: boolean;
  primaryCtaLabel: string;
  closedLabel: string;
  ownerManagementLabel: string;
  ownerManagementPath: string;
  catalogHeading: string;
  ctaIcon: "cart" | "clock" | "package";
}

export function resolveStorefrontActions(
  b: Business,
  t: (key: string) => string
): ResolvedStorefrontActions {
  const pkgKey = resolvePackage(b);
  const pkg = BUSINESS_PACKAGES[pkgKey];

  // 1. Determine operating model
  let model: StorefrontFulfillmentKind = b.operatingModel || "RETAIL_COMMERCE";

  if (!b.operatingModel) {
    if (pkgKey === "shop" || pkgKey === "pharmacy") {
      model = "RETAIL_COMMERCE";
    } else if (pkgKey === "takeaway" || pkgKey === "dining") {
      model = "FOOD_DINING_TAKEAWAY";
    } else if (pkgKey === "clinic" || pkgKey === "diagnostics" || pkgKey === "vet") {
      model = "HEALTHCARE_CONSULT";
    } else if (pkgKey === "salon" || pkgKey === "fitness") {
      model = "SERVICE_APPOINTMENT";
    } else if (pkgKey === "homeservice") {
      model = "FIELD_SERVICE_DISPATCH";
    } else if (pkgKey === "learning") {
      model = "BATCH_OR_SESSION";
    } else if (pkgKey === "professional") {
      model = "PROFESSIONAL_QUOTE";
    } else {
      model = (b.catalog && b.catalog.length > 0 && !pkg.bookingsDefault) ? "RETAIL_COMMERCE" : "SERVICE_APPOINTMENT";
    }
  }

  const isCommerce = model === "RETAIL_COMMERCE" || model === "FOOD_DINING_TAKEAWAY" || model === "RETAIL_SHOWROOM";

  const canDeliver = b.deliveryEnabled === true || Boolean(b.fulfillmentCapabilities?.delivery);
  const canPickup = b.fulfillmentCapabilities?.pickup !== false;
  const canBookSlot = !isCommerce && (b.bookingsEnabled ?? pkg.bookingsDefault);
  const canJoinQueue = b.fulfillmentCapabilities?.queue !== false;

  let primaryCtaLabel = pkg.primaryCtaLabel;
  let closedLabel = pkg.bookingClosedLabel;
  let ctaIcon: "cart" | "clock" | "package" = isCommerce ? "cart" : "clock";

  if (isCommerce) {
    if (canDeliver && canPickup) {
      primaryCtaLabel = t("order_now") || "Order Delivery / Pickup";
    } else if (canDeliver) {
      primaryCtaLabel = t("order_delivery") || "Order for Delivery";
    } else {
      primaryCtaLabel = t("in_store_pickup") || "Order / In-Store Pickup";
    }
    closedLabel = t("store_closed_now") || "Store closed right now";
    ctaIcon = "cart";
  }

  const ownerManagementLabel = isCommerce
    ? (t("orders_and_fulfillment") || "Orders & Fulfillment")
    : (t("view_appointments") || "View Appointments");

  const ownerManagementPath = isCommerce && canDeliver
    ? `/business/${b.id}/manage/deliveries`
    : `/business/${b.id}/manage/appointments`;

  const catalogHeading = pkg.catalogNoun;

  return {
    operatingModel: model,
    isCommerce,
    canDeliver,
    canPickup,
    canBookSlot,
    canJoinQueue,
    primaryCtaLabel,
    closedLabel,
    ownerManagementLabel,
    ownerManagementPath,
    catalogHeading,
    ctaIcon,
  };
}
