import { useEffect } from "react";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import { businessService, providerService } from "@/services";

/**
 * Working inside a business or provider console means acting as that business or provider.
 *
 * The Manage hub switches the active context before it opens a console, but a console reached any other way — a
 * "New Home & Repair request" notification, a shared link, the back stack — kept the personal context. Everything the
 * console hands off to shared screens then acted as the person: a proposal sent from Find work went out as a customer,
 * never showed in the provider's Sent tab, and the requester saw a stranger (E2E-022).
 *
 * Call from the console guards once access (and any password) has been verified. Uses the same cache keys as the
 * console screens, so it adds no request.
 */
export function useAdoptConsoleContext(type: "business" | "provider" | "delivery", id: string, enabled: boolean) {
  const { activeContext, setContext } = useApp();
  const entityId = type === "delivery" ? null : id;
  const { data } = useQuery<{ name?: string; displayName?: string } | undefined>(
    () =>
      type === "business" ? businessService.get(id)
      : type === "provider" ? providerService.get(id)
      : Promise.resolve(undefined),
    [type, id],
    type === "delivery" ? undefined : `${type}:${id}`,
  );
  const name =
    type === "delivery" ? "Delivery"
    : ((type === "business" ? data?.name : data?.displayName) ?? "");

  useEffect(() => {
    if (!enabled || (type !== "delivery" && !id)) return;
    const sameEntity = activeContext.type === type && activeContext.id === entityId;
    if (sameEntity && (activeContext.name || !name)) return;
    setContext({ type, id: entityId, name: name || (sameEntity ? activeContext.name : "") });
  }, [enabled, type, id, entityId, name, activeContext.type, activeContext.id, activeContext.name, setContext]);
}
