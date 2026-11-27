import { describe, expect, it } from "vitest";

import { resolveDeliveryRouteEndpoints } from "@/lib/geo/deliveryRoute";

describe("resolveDeliveryRouteEndpoints", () => {
  const store = { storeLat: 18.518, storeLng: 73.934 };
  const dest = { destLat: 18.522, destLng: 73.941 };

  it("routes Store → Drop-off during ASSIGNED when no rider GPS fix exists yet", () => {
    const res = resolveDeliveryRouteEndpoints({
      ...store,
      ...dest,
      riderLat: null,
      riderLng: null,
      status: "ASSIGNED",
    });
    expect(res.origin).toEqual({ lat: 18.518, lng: 73.934 });
    expect(res.destination).toEqual({ lat: 18.522, lng: 73.941 });
    expect(res.previewLeg).toBeNull();
  });

  it("routes Store → Drop-off during ASSIGNED if rider fix happens to sit on the store", () => {
    const res = resolveDeliveryRouteEndpoints({
      ...store,
      ...dest,
      riderLat: 18.518,
      riderLng: 73.934,
      status: "ASSIGNED",
    });
    expect(res.origin).toEqual({ lat: 18.518, lng: 73.934 });
    expect(res.destination).toEqual({ lat: 18.522, lng: 73.941 });
  });

  it("routes Rider → Store with a previewLeg Store → Drop-off when rider is en route to pickup", () => {
    const res = resolveDeliveryRouteEndpoints({
      ...store,
      ...dest,
      riderLat: 18.512,
      riderLng: 73.928,
      status: "ASSIGNED",
    });
    expect(res.origin).toEqual({ lat: 18.512, lng: 73.928 });
    expect(res.destination).toEqual({ lat: 18.518, lng: 73.934 });
    expect(res.previewLeg).toEqual([
      { lat: 18.518, lng: 73.934 },
      { lat: 18.522, lng: 73.941 },
    ]);
  });

  it("routes Rider → Drop-off once EN_ROUTE", () => {
    const res = resolveDeliveryRouteEndpoints({
      ...store,
      ...dest,
      riderLat: 18.519,
      riderLng: 73.937,
      status: "EN_ROUTE",
    });
    expect(res.origin).toEqual({ lat: 18.519, lng: 73.937 });
    expect(res.destination).toEqual({ lat: 18.522, lng: 73.941 });
    expect(res.previewLeg).toBeNull();
  });
});
