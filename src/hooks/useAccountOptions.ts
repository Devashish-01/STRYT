import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/store";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { businessService, providerService, businessAccessService } from "@/services";
import { displayName as safeName } from "@/lib/publicName";

export interface AccountOption {
  type: "customer" | "business" | "provider";
  id: string | null;
  name: string;
  avatar: string;
  sub: string;
  dest: string;
  active: boolean;
  /** True for a business managed via a delegated grant rather than owned outright. */
  delegated?: boolean;
}

/**
 * Single source of truth for "which hats can this user switch into" — real
 * owned businesses/provider profile PLUS any business delegated to this user
 * via an active access grant (not mock data), shared by every switcher UI
 * (AccountSwitcher sheet, RoleSwitcher dropdown) so they can never drift out
 * of sync with each other, and so a revoked grant disappears from every
 * switcher the moment the grant's status flips (realtime-backed).
 */
export function useAccountOptions() {
  const nav = useNavigate();
  const { user, activeContext, setContext, attemptSwitchContext, ownedBusinessIds, ownedProviderId, ownedEntitiesLoaded, roles, showToast } = useApp();

  const { data: myBiz } = useQuery(() => businessService.mine(), []);
  const { data: myProv } = useQuery(() => providerService.mine(), []);
  const { data: mySessions } = useQueryWithRealtime(
    () => businessAccessService.mySessions(),
    "business_access_sessions",
    [user.id],
    user.id ? `grantee_user_id=eq.${user.id}` : undefined,
  );

  const owned = (myBiz ?? []).filter((b) => ownedBusinessIds.length === 0 || ownedBusinessIds.includes(b.id));
  const ownedIds = new Set(owned.map((b) => b.id));
  // Businesses granted to this user (not owned by them) with a currently ACTIVE
  // session — this is what actually drives the "can I switch into it" list,
  // so a revoke (status flips off ACTIVE) removes the option immediately.
  const delegatedGrants = (mySessions ?? []).filter((s) => s.status === "ACTIVE" && !ownedIds.has(s.businessId));
  const provider = (myProv ?? []).find((p) => !ownedProviderId || p.id === ownedProviderId) ?? null;

  const isActive = (type: string, id: string | null) => activeContext.type === type && activeContext.id === id;

  const options: AccountOption[] = [
    {
      type: "customer", id: null, name: safeName(user.name), avatar: user.avatar,
      sub: "Personal · Customer", dest: "/home", active: isActive("customer", null),
    },
    ...owned.map((b) => ({
      type: "business" as const, id: b.id, name: b.name, avatar: b.coverImage,
      sub: "Business · Live", dest: `/business/${b.id}/manage`, active: isActive("business", b.id),
    })),
    ...delegatedGrants.map((s) => ({
      type: "business" as const, id: s.businessId, name: s.businessName || "Business", avatar: "",
      sub: "Business · Delegated access", dest: `/business/${s.businessId}/manage`, active: isActive("business", s.businessId),
      delegated: true,
    })),
    ...(provider ? [{
      type: "provider" as const, id: provider.id, name: provider.displayName, avatar: provider.avatar,
      sub: "Provider · Active", dest: `/provider/${provider.id}/manage`, active: isActive("provider", provider.id),
    }] : []),
  ];

  // If the context we're currently "wearing" is a delegated business whose
  // grant just disappeared from the active list (revoked/expired), drop back
  // to customer immediately instead of leaving the UI pointed at a business
  // the user can no longer manage.
  useEffect(() => {
    if (activeContext.type !== "business" || !activeContext.id) return;
    if (ownedBusinessIds.includes(activeContext.id)) return;
    if (delegatedGrants.some((s) => s.businessId === activeContext.id)) return;
    if (mySessions === undefined) return; // still loading — don't act on a stale empty list
    if (!ownedEntitiesLoaded) return; // ownedBusinessIds itself may still be hydrating
    setContext({ type: "customer", id: null, name: user.name });
    showToast("Your access to that business was revoked");
    nav("/home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext.type, activeContext.id, ownedBusinessIds, mySessions, ownedEntitiesLoaded]);

  function pick(opt: AccountOption) {
    const ready = attemptSwitchContext({ type: opt.type, id: opt.id, name: opt.name }, opt.dest);
    if (!ready) return; // PIN sheet takes over — it navigates on success
    showToast(`Switched to ${opt.name}`);
    nav(opt.dest);
  }

  const current = options.find((o) => o.active) ?? options[0];
  const canAddBusiness = true;
  const canBecomeProvider = !provider && !roles.includes("provider");

  return { options, current, pick, canAddBusiness, canBecomeProvider, nav };
}
