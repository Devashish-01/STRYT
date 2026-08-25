import { describe, it, expect, vi } from "vitest";
import { buildConsoleSteps, consoleFor } from "./consoleSteps";
import { BUSINESS_PACKAGES, resolvePackage, type ConsoleStep } from "./businessPackages";

const steps: ConsoleStep[] = [
  { id: "catalog", label: "Menu", hint: "Dishes & prices" },
  { id: "queue", label: "Waitlist" },
  { id: "delivery", label: "Delivery" },
];

describe("buildConsoleSteps", () => {
  it("keeps the package's order and labels", () => {
    const noop = () => {};
    const out = buildConsoleSteps(steps, {
      delivery: { onClick: noop },
      catalog: { onClick: noop },
      queue: { onClick: noop },
    });
    expect(out.map((s) => s.label)).toEqual(["Menu", "Waitlist", "Delivery"]);
  });

  it("drops capabilities the screen didn't supply, rather than rendering them dead", () => {
    // A provider has no queue and no delivery — it must not show either.
    const out = buildConsoleSteps(steps, { catalog: { onClick: () => {} } });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("catalog");
  });

  it("defaults done to false and passes the click through", () => {
    const onClick = vi.fn();
    const [only] = buildConsoleSteps([steps[0]], { catalog: { onClick } });
    expect(only.done).toBe(false);
    only.onClick();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("lets a live value override the config hint", () => {
    const [only] = buildConsoleSteps([steps[0]], {
      catalog: { onClick: () => {}, value: "12 dishes" },
    });
    expect(only.hint).toBe("12 dishes");
  });

  it("falls back to the config hint when there is no live value", () => {
    const [only] = buildConsoleSteps([steps[0]], { catalog: { onClick: () => {} } });
    expect(only.hint).toBe("Dishes & prices");
  });
});

describe("consoleFor", () => {
  it("returns the package's own console when it has one", () => {
    expect(consoleFor(BUSINESS_PACKAGES.dining).storeTabLabel).toBe("Menu");
  });

  it("falls back to generic for a package that hasn't authored one", () => {
    // Every real package is authored now, so construct a synthetic
    // non-generic package with no console to keep the `pkg.console ??
    // genericConsoleFor(kind)` fallback line itself covered — using a real
    // "generic"-keyed package would short-circuit on the separate
    // `pkg.key === "generic"` branch above it instead.
    const unauthored = { ...BUSINESS_PACKAGES.clinic, console: undefined };
    expect(consoleFor(unauthored)).toBe(BUSINESS_PACKAGES.generic.console);
    // ...and the provider default when asked as a provider.
    expect(consoleFor(unauthored, "provider").storeTabLabel).toBe("Services");
  });

  // The two accounts this feature is meant to be judged on: one owner who
  // picked Food, one who picked something unmapped ("Others").
  it("a Food & Beverage business gets the kitchen console end-to-end", () => {
    const pkg = BUSINESS_PACKAGES[resolvePackage({ categoryName: "Food & Beverage", subCategory: "Restaurant" })];
    const cfg = consoleFor(pkg, "business");
    expect(pkg.key).toBe("dining");
    expect(cfg.storeTabLabel).toBe("Menu");
    expect(cfg.setupTitle).toBe("Get your kitchen ready");

    const noop = () => {};
    const tiles = buildConsoleSteps(cfg.actions, {
      catalog: { onClick: noop }, bookings: { onClick: noop },
      queue: { onClick: noop }, delivery: { onClick: noop },
    });
    expect(tiles.map((t) => t.label)).toEqual(["Menu", "Reservations", "Waitlist", "Delivery"]);
  });

  it("an unmapped 'Others' business keeps exactly today's console", () => {
    const pkg = BUSINESS_PACKAGES[resolvePackage({ categoryName: "Astrologer" })];
    const cfg = consoleFor(pkg, "business");
    expect(pkg.key).toBe("generic");
    expect(cfg.storeTabLabel).toBe("Store");
    expect(cfg.setup.map((s) => s.label)).toEqual([
      "Add a catalog item", "Set your hours", "Upload verification", "Post your first update",
    ]);
  });

  it("a generic provider keeps provider wording, not the business wording", () => {
    const cfg = consoleFor(BUSINESS_PACKAGES.generic, "provider");
    expect(cfg.setup.map((s) => s.label)).toEqual([
      "Add a service to your catalog", "Set your availability",
      "Upload verification", "Post your first community update",
    ]);
  });

  it("every authored console references only capabilities the type allows", () => {
    for (const pkg of Object.values(BUSINESS_PACKAGES)) {
      if (!pkg.console) continue;
      for (const step of [...pkg.console.setup, ...pkg.console.actions]) {
        expect(step.label.length, `${pkg.key} has an empty label`).toBeGreaterThan(0);
      }
    }
  });
});
