type ProviderTab = "home" | "jobs" | "find-work" | "money" | "profile";

const PROFILE_ROUTES = new Set([
  "profile", "edit-profile", "verify", "settings", "availability", "catalog", "portfolio",
  "inventory", "inbox", "reviews", "community",
]);

export function activeProviderTab(base: string, pathname: string): ProviderTab | undefined {
  if (pathname === base || pathname === `${base}/`) return "home";
  if (!pathname.startsWith(`${base}/`)) return undefined;
  const section = pathname.slice(base.length + 1).split("/")[0];
  if (section === "dashboard") return "home";
  if (section === "leads") return "find-work";
  if (section === "jobs" || section === "find-work" || section === "money") return section;
  return PROFILE_ROUTES.has(section) ? "profile" : undefined;
}
