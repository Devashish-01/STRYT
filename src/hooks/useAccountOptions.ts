import { useNavigate } from "react-router-dom";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import { businessService, providerService } from "@/services";
import { displayName as safeName } from "@/lib/publicName";

export interface AccountOption {
  type: "customer" | "business" | "provider";
  id: string | null;
  name: string;
  avatar: string;
  sub: string;
  dest: string;
  active: boolean;
}

/**
 * Single source of truth for "which hats can this user switch into" — real
 * owned businesses/provider profile (not mock data), shared by every switcher
 * UI (AccountSwitcher sheet, RoleSwitcher dropdown) so they can never drift
 * out of sync with each other.
 */
export function useAccountOptions() {
  const nav = useNavigate();
  const { user, activeContext, setContext, ownedBusinessIds, ownedProviderId, roles, showToast } = useApp();

  const { data: myBiz } = useQuery(() => businessService.mine(), []);
  const { data: myProv } = useQuery(() => providerService.mine(), []);

  const businesses = (myBiz ?? []).filter((b) => ownedBusinessIds.length === 0 || ownedBusinessIds.includes(b.id));
  const provider = (myProv ?? []).find((p) => !ownedProviderId || p.id === ownedProviderId) ?? null;

  const isActive = (type: string, id: string | null) => activeContext.type === type && activeContext.id === id;

  const options: AccountOption[] = [
    {
      type: "customer", id: null, name: safeName(user.name), avatar: user.avatar,
      sub: "Personal · Customer", dest: "/home", active: isActive("customer", null),
    },
    ...businesses.map((b) => ({
      type: "business" as const, id: b.id, name: b.name, avatar: b.coverImage,
      sub: "Business · Live", dest: `/business/${b.id}/manage`, active: isActive("business", b.id),
    })),
    ...(provider ? [{
      type: "provider" as const, id: provider.id, name: provider.displayName, avatar: provider.avatar,
      sub: "Provider · Active", dest: `/provider/${provider.id}/manage`, active: isActive("provider", provider.id),
    }] : []),
  ];

  function pick(opt: AccountOption) {
    setContext({ type: opt.type, id: opt.id, name: opt.name });
    showToast(`Switched to ${opt.name}`);
    nav(opt.dest);
  }

  const current = options.find((o) => o.active) ?? options[0];
  const canAddBusiness = true;
  const canBecomeProvider = !provider && !roles.includes("provider");

  return { options, current, pick, canAddBusiness, canBecomeProvider, nav };
}
