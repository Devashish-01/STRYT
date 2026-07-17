import type { ActiveContext } from "@/store";

/**
 * The route that "home" means for the hat the user is currently wearing.
 *
 * The app chrome (desktop sidebar, mobile bottom nav, profile header) all render
 * from `activeContext`, which is persisted in localStorage and restored on
 * launch. But the initial redirects used to hardcode the customer "/home", so a
 * business/provider owner reopening the app landed on the customer Home while
 * the sidebar/nav still showed their business identity — the page and the chrome
 * disagreed. Routing "home" through the active context keeps them in sync:
 * an owner returns to their console dashboard, a customer to Home.
 *
 * Mirrors goHome() in BrandHome / DesktopSidebar so every "go home" path agrees
 * on one rule. Owned-but-revoked business ids self-heal via BusinessAccessGuard,
 * which resets the context back to customer and bounces to /home.
 */
export function contextHomePath(ctx: ActiveContext): string {
  if (ctx.type === "business" && ctx.id) return `/business/${ctx.id}/manage`;
  if (ctx.type === "provider" && ctx.id) return `/provider/${ctx.id}/manage`;
  return "/home";
}
