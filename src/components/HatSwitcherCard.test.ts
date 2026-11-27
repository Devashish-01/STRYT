import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockNav = vi.fn();
const mockAttemptSwitchContext = vi.fn(() => true);

const mockAppState = {
  user: { id: "u-1", name: "Rajesh Sharma" },
  roles: ["customer", "business_owner"] as const,
  activeContext: { type: "business" as const, id: "biz-1", name: "Sharma General Store" },
  attemptSwitchContext: mockAttemptSwitchContext,
  ownedBusinessIds: ["biz-1"],
  ownedProviderId: null as string | null,
};

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNav,
}));

vi.mock("@/store", () => ({
  useApp: () => mockAppState,
}));

vi.mock("@/hooks/useApi", () => ({
  useQuery: (fn: () => unknown) => {
    const val = fn();
    return {
      data: val instanceof Promise ? [{ id: "biz-1", name: "Sharma General Store" }] : val,
    };
  },
}));

vi.mock("@/services", () => ({
  businessService: { mine: () => [{ id: "biz-1", name: "Sharma General Store" }] },
  providerService: { mine: () => [] },
}));

vi.mock("react", async (orig) => {
  const mod = await orig<typeof import("react")>();
  return {
    ...mod,
    useState: <T,>(init: T) => [init, vi.fn()] as const,
  };
});

import HatSwitcherCard from "./HatSwitcherCard";

function findElements(node: unknown, predicate: (el: ReactElement<any>) => boolean): ReactElement<any>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((n) => findElements(n, predicate));
  const el = node as ReactElement<any>;
  const own = predicate(el) ? [el] : [];
  const children = el.props?.children;
  return [...own, ...findElements(children, predicate)];
}

describe("HatSwitcherCard", () => {
  beforeEach(() => {
    mockNav.mockReset();
    mockAttemptSwitchContext.mockReset().mockReturnValue(true);
    mockAppState.activeContext = { type: "business", id: "biz-1", name: "Sharma General Store" };
  });

  it("highlights the active business tile from activeContext", () => {
    const html = renderToStaticMarkup(createElement(HatSwitcherCard, { showManageLink: false }));
    expect(html).toContain("Customer");
    expect(html).toContain("Business");
    expect(html).toContain("pf-role active");
  });

  it("resets activeContext to customer when tapping the Customer tile", () => {
    const tree = HatSwitcherCard({ showManageLink: false });
    const buttons = findElements(
      tree,
      (el) => el.type === "button" && typeof el.props?.className === "string" && el.props.className.includes("pf-role"),
    );
    expect(buttons.length).toBe(3);

    buttons[0].props.onClick();

    expect(mockAttemptSwitchContext).toHaveBeenCalledWith(
      { type: "customer", id: null, name: "Rajesh Sharma" },
      "/home",
    );
    expect(mockNav).toHaveBeenCalledWith("/home");
  });
});
