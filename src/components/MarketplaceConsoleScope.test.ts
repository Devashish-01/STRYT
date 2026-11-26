import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockNav = vi.fn();
let mockParams: Record<string, string> = { id: "biz-1" };
const mockCache = new Map<string, unknown>();
let mockQueryState: { data: unknown; loading: boolean; error: unknown; refetch: () => void } = {
  data: undefined,
  loading: true,
  error: null,
  refetch: vi.fn(),
};

vi.mock("react-router-dom", () => ({
  useParams: () => mockParams,
  useNavigate: () => mockNav,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android" },
}));

vi.mock("@/hooks/useApi", () => ({
  useQuery: () => mockQueryState,
  hasQueryCache: (key: string) => mockCache.has(key),
  peekQueryCache: <T,>(key: string) => mockCache.get(key) as T | undefined,
  findInQueryCacheByPrefix: <T,>(prefix: string, picker: (value: unknown) => T | undefined) => {
    for (const [k, v] of mockCache.entries()) {
      if (!k.startsWith(prefix)) continue;
      const hit = picker(v);
      if (hit !== undefined) return hit;
    }
    return undefined;
  },
}));

vi.mock("@/services/marketplace/businessService", () => ({
  businessService: { get: vi.fn() },
}));

vi.mock("@/services/marketplace/providerService", () => ({
  providerService: { get: vi.fn() },
}));

import MarketplaceConsoleScope from "./MarketplaceConsoleScope";

describe("MarketplaceConsoleScope", () => {
  beforeEach(() => {
    mockParams = { id: "biz-1" };
    mockCache.clear();
    mockNav.mockReset();
    mockQueryState = { data: undefined, loading: true, error: null, refetch: vi.fn() };
  });

  it("renders children immediately without checking banner when cached in my-businesses list", () => {
    mockCache.set("my-businesses:u1", [{ id: "biz-1", name: "Sharma General Store", packageKey: "shop" }]);

    const html = renderToStaticMarkup(
      createElement(MarketplaceConsoleScope, {
        kind: "business",
        children: createElement("div", null, "CONSOLE_OK"),
      }),
    );

    expect(html).toContain("CONSOLE_OK");
    expect(html).not.toContain("Checking listing availability");
  });

  it("renders children immediately when business:id is already in query cache", () => {
    mockCache.set("business:biz-1", { id: "biz-1", name: "Sharma General Store", packageKey: "shop" });

    const html = renderToStaticMarkup(
      createElement(MarketplaceConsoleScope, {
        kind: "business",
        children: createElement("div", null, "CONSOLE_OK"),
      }),
    );

    expect(html).toContain("CONSOLE_OK");
    expect(html).not.toContain("Checking listing availability");
  });

  it("renders safe-area skeleton instead of raw text on cold uncached load", () => {
    const html = renderToStaticMarkup(
      createElement(MarketplaceConsoleScope, {
        kind: "business",
        children: createElement("div", null, "CONSOLE_OK"),
      }),
    );

    expect(html).not.toContain("CONSOLE_OK");
    expect(html).not.toContain("Checking listing availability");
    expect(html).toContain("--safe-area-top");
    expect(html).toContain("Loading console");
  });

  it("blocks excluded listings once settled with unavailable result", () => {
    mockCache.set("business:biz-1", undefined);
    mockQueryState = { data: undefined, loading: false, error: null, refetch: vi.fn() };

    const html = renderToStaticMarkup(
      createElement(MarketplaceConsoleScope, {
        kind: "business",
        children: createElement("div", null, "CONSOLE_OK"),
      }),
    );

    expect(html).not.toContain("CONSOLE_OK");
    expect(html).toContain("Back to Home");
  });
});
