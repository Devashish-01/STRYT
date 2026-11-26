import type { Role } from "@/types";

/**
 * The app is several "parts" in one: the personal/customer side, each business console, the provider console and
 * the delivery console. A notification (or a push tap) can point into any of them, and following it used to move the
 * user there silently. This works out which part a destination belongs to so the app can ask before switching.
 */
export type Part =
  | { type: "customer" }
  | { type: "business"; id: string }
  | { type: "provider"; id: string }
  | { type: "delivery" };

const BUSINESS_CONSOLE = /^\/business\/([^/]+)\/manage(?:\/|$)/;
const PROVIDER_CONSOLE = /^\/provider\/([^/]+)\/manage(?:\/|$)/;
const DELIVERY_CONSOLE = /^\/delivery(?:\/|$)/;

const PERSONAL_EXACT_ROUTES = new Set([
  "/home",
  "/appointments",
  "/orders",
  "/queues",
  "/bookmarks",
  "/followers",
  "/lists",
  "/achievements",
]);

const PERSONAL_PREFIX_ROUTES = ["/profile", "/account", "/settings", "/safety"];

/** Keeps the legacy Role value in lock-step with activeContext.type. */
export function roleForContextType(type: string): Role {
  if (type === "business" || type === "business_owner") return "business_owner";
  if (type === "provider") return "provider";
  return "customer";
}

/** True when a route belongs exclusively to the user's personal/customer experience
 *  (never used while acting as a business/provider), so activeContext should always be Customer there. */
export function isPersonalOnlyRoute(pathname: string, search = ""): boolean {
  const path = pathname.split(/[?#]/)[0];
  if (PERSONAL_EXACT_ROUTES.has(path)) return true;
  if (PERSONAL_PREFIX_ROUTES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return true;
  if (path === "/chats" || path === "/notifications") {
    return new URLSearchParams(search).get("scope") === "CUSTOMER";
  }
  return false;
}

/** Resolves the part the user is effectively in for a given location: console routes override stale context,
 *  exclusively-personal routes resolve to Customer, and shared routes fall back to the active context. */
export function effectivePartForLocation(
  ctx: { type: string; id: string | null },
  pathname: string,
  search = "",
): Part {
  const pathPart = partOfPath(pathname);
  if (pathPart.type !== "customer") return pathPart;
  if (isPersonalOnlyRoute(pathname, search)) return { type: "customer" };
  return partOfContext(ctx);
}

/** The part a route lives in. Everything outside a console — home, chats, a business's public page — is the personal side. */
export function partOfPath(to: string): Part {
  const path = to.split(/[?#]/)[0];
  const business = BUSINESS_CONSOLE.exec(path);
  if (business) return { type: "business", id: decodeURIComponent(business[1]) };
  const provider = PROVIDER_CONSOLE.exec(path);
  if (provider) return { type: "provider", id: decodeURIComponent(provider[1]) };
  if (DELIVERY_CONSOLE.test(path)) return { type: "delivery" };
  return { type: "customer" };
}

/** The part the user is in right now (the app's active context) as a Part. */
export function partOfContext(ctx: { type: string; id: string | null }): Part {
  if (ctx.type === "business" && ctx.id) return { type: "business", id: ctx.id };
  if (ctx.type === "provider" && ctx.id) return { type: "provider", id: ctx.id };
  if (ctx.type === "delivery") return { type: "delivery" };
  return { type: "customer" };
}

export function samePart(a: Part, b: Part): boolean {
  if (a.type !== b.type) return false;
  if ((a.type === "business" || a.type === "provider") && (b.type === "business" || b.type === "provider")) return a.id === b.id;
  return true;
}

/** The part following `to` would move the user into, or null when it stays in the part they are already in. */
export function switchTarget(active: { type: string; id: string | null }, to: string): Part | null {
  const target = partOfPath(to);
  return samePart(partOfContext(active), target) ? null : target;
}
