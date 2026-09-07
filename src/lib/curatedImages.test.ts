import { describe, it, expect } from "vitest";
import {
  getRelatableBusinessCover,
  getRelatableBusinessGallery,
  enrichCatalogItems,
  enrichBusinessPortfolio,
  getRelatableProviderAvatar,
  enrichProviderPortfolio,
  isBadImage,
  resolveCategoryKey,
} from "./curatedImages";

describe("curatedImages engine", () => {
  it("correctly flags bad or loremflickr images", () => {
    expect(isBadImage(null)).toBe(true);
    expect(isBadImage("")).toBe(true);
    expect(isBadImage("https://loremflickr.com/640/480/restaurant")).toBe(true);
    expect(isBadImage("https://api.dicebear.com/7.x/initials/svg?seed=DP")).toBe(true);
    expect(isBadImage("https://images.unsplash.com/photo-1517248135467")).toBe(false);
  });

  it("resolves specific business covers accurately", () => {
    // Fish katta
    const fkCover = getRelatableBusinessCover({ id: "b_9d1919e478714894b21dc233a8bc8f7d", name: "Fish katta" });
    expect(fkCover).toContain("unsplash.com");

    // Kitchen king
    const kkCover = getRelatableBusinessCover({ id: "b_a1b3dae370c24f7fbc993d07f44a0c23", name: "Kitchen king" });
    expect(kkCover).toContain("unsplash.com");

    // Soumyapatelmakeovers
    const smCover = getRelatableBusinessCover({ id: "b_de48dd0296a34a45a414a7936cf3130c", name: "Soumyapatelmakeovers" });
    expect(smCover).toContain("unsplash.com");
  });

  it("resolves category fallback cover for unknown businesses", () => {
    const cover = getRelatableBusinessCover({ name: "Dr. Sharma Dental", categoryName: "Clinic" });
    expect(cover).toContain("unsplash.com");
  });

  it("enriches empty catalog items with authentic items and photography", () => {
    // Fish katta has empty catalog initially
    const items = enrichCatalogItems("b_9d1919e478714894b21dc233a8bc8f7d", [], "Fish katta");
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].image).toContain("unsplash.com");
    expect(items.some((i) => i.name.toLowerCase().includes("bombil") || i.name.toLowerCase().includes("fish"))).toBe(true);
  });

  it("replaces loremflickr catalog images with relatable photography", () => {
    const enriched = enrichCatalogItems(
      "b_demo_dining",
      [
        {
          id: "c1",
          name: "Butter Chicken",
          description: "Rich butter chicken",
          price: 320,
          image: "https://loremflickr.com/640/480/butterchicken",
          stockStatus: "IN_STOCK",
        },
      ],
      "Spice Route Kitchen",
      "Dining"
    );
    expect(enriched[0].image).toContain("unsplash.com");
    expect(enriched[0].image).not.toContain("loremflickr");
  });

  it("enriches empty or broken business portfolio with curated work showcase", () => {
    const portfolio = enrichBusinessPortfolio("b_de48dd0296a34a45a414a7936cf3130c", [], "Soumyapatelmakeovers");
    expect(portfolio.length).toBeGreaterThan(0);
    expect(portfolio[0].url).toContain("unsplash.com");
    expect(portfolio[0].caption.length).toBeGreaterThan(0);
  });

  it("resolves provider avatars with authentic portrait photographs", () => {
    const avatar = getRelatableProviderAvatar({ id: "p_demo_u1", displayName: "Dr. Devashish Patel" });
    expect(avatar).toContain("unsplash.com");
    expect(avatar).not.toContain("dicebear");
  });

  it("enriches provider portfolio with authentic craft showcases", () => {
    const portfolio = enrichProviderPortfolio("p_e7904dd62bbc463c8ed946ef171155ee", []);
    expect(portfolio.length).toBeGreaterThan(0);
    expect(portfolio[0].url).toContain("unsplash.com");
    expect(portfolio[0].caption.toLowerCase()).toContain("resin");
  });
});
