import { describe, expect, it } from "vitest";
import {
  STORY_BACKDROPS,
  STORY_FILTERS,
  STORY_TEXT_COLORS,
  clampOverlayPct,
  computeDrawRect,
} from "./storyCanvas";

describe("storyCanvas", () => {
  it("keeps overlay coordinates clamped inside safe viewport bands", () => {
    expect(clampOverlayPct(-0.2, 0.14, 0.86)).toBe(0.14);
    expect(clampOverlayPct(1.4, 0.14, 0.86)).toBe(0.86);
    expect(clampOverlayPct(0.5, 0.14, 0.86)).toBe(0.5);
    expect(clampOverlayPct(Number.NaN, 0.14, 0.86)).toBe(0.5);
  });

  it("computes cover (Fill) geometry edge-to-edge without leaving side bars", () => {
    // 4:3 photo inside 9:16 portrait frame -> height matches 1920 and width overflows cleanly centered
    const rect = computeDrawRect(1600, 1200, 1080, 1920, "cover");
    expect(rect.h).toBe(1920);
    expect(rect.w).toBe(2560);
    expect(rect.x).toBe(-740);
    expect(rect.y).toBe(0);
  });

  it("computes contain (Fit) geometry keeping the entire landscape frame visible", () => {
    const rect = computeDrawRect(1600, 1200, 1080, 1920, "contain");
    expect(rect.w).toBe(1080);
    expect(rect.h).toBe(810);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(555);
  });

  it("defines unique filter, backdrop gradient, and text color presets", () => {
    expect(new Set(STORY_FILTERS.map((f) => f.id)).size).toBe(STORY_FILTERS.length);
    expect(new Set(STORY_BACKDROPS.map((b) => b.id)).size).toBe(STORY_BACKDROPS.length);
    expect(new Set(STORY_TEXT_COLORS.map((c) => c.id)).size).toBe(STORY_TEXT_COLORS.length);
    expect(STORY_FILTERS[0].id).toBe("original");
  });
});
