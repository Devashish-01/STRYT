import { describe, it, expect } from "vitest";
import { resolveStorefrontActions } from "./storefrontActions";
import type { Business } from "@/types/marketplace";

describe("Dynamic Storefront Action Engine", () => {
  const dummyT = (k: string) => k;

  it("resolves grocery / kirana shop as commerce with delivery / pickup and no appointment text", () => {
    const kirana: Business = {
      id: "biz-kirana-1",
      name: "Sharma General Store",
      categoryName: "Groceries & Essentials",
      subCategory: "Daily Needs",
      deliveryEnabled: true,
      isOpenNow: true,
      catalog: [{ id: "item-1", name: "Amul Milk 1L", price: 30, stockStatus: "IN_STOCK" }],
    } as unknown as Business;

    const res = resolveStorefrontActions(kirana, dummyT);

    expect(res.isCommerce).toBe(true);
    expect(res.operatingModel).toBe("RETAIL_COMMERCE");
    expect(res.canDeliver).toBe(true);
    expect(res.canBookSlot).toBe(false);
    expect(res.ctaIcon).toBe("cart");
    expect(res.ownerManagementLabel).toBe("orders_and_fulfillment");
    expect(res.ownerManagementPath).toBe("/business/biz-kirana-1/manage/deliveries");
  });

  it("resolves salon / beauty parlour as service appointment with time booking", () => {
    const salon: Business = {
      id: "biz-salon-1",
      name: "Looks Unisex Salon",
      categoryName: "Beauty & Personal Care",
      subCategory: "Salon",
      isOpenNow: true,
      bookingsEnabled: true,
      catalog: [{ id: "srv-1", name: "Haircut", price: 250, stockStatus: "IN_STOCK" }],
    } as unknown as Business;

    const res = resolveStorefrontActions(salon, dummyT);

    expect(res.isCommerce).toBe(false);
    expect(res.operatingModel).toBe("SERVICE_APPOINTMENT");
    expect(res.canBookSlot).toBe(true);
    expect(res.ctaIcon).toBe("clock");
    expect(res.ownerManagementLabel).toBe("view_appointments");
    expect(res.ownerManagementPath).toBe("/business/biz-salon-1/manage/appointments");
  });

  it("resolves pharmacy as commerce with medicine ordering", () => {
    const pharmacy: Business = {
      id: "biz-pharm-1",
      name: "Apollo Pharmacy",
      categoryName: "Health & Wellness",
      subCategory: "Pharmacy",
      isOpenNow: true,
      deliveryEnabled: true,
      catalog: [{ id: "med-1", name: "Paracetamol", price: 20, stockStatus: "IN_STOCK" }],
    } as unknown as Business;

    const res = resolveStorefrontActions(pharmacy, dummyT);

    expect(res.isCommerce).toBe(true);
    expect(res.operatingModel).toBe("RETAIL_COMMERCE");
    expect(res.canDeliver).toBe(true);
    expect(res.canBookSlot).toBe(false);
  });
});
