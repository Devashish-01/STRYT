import { businessService, providerService } from "@/services";

/** Which console a catalog screen is running in. Businesses and providers share these screens;
 *  only the service behind them differs. */
export type Kind = "business" | "provider";

export function serviceFor(kind: Kind) {
  return kind === "business" ? businessService : providerService;
}
