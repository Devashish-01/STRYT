import { useEffect, useState } from "react";
import { bustBusinessGetCache, businessService } from "@/services";
import { invalidateQueryCache } from "@/hooks/useApi";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { errorMessage } from "@/lib/errorMessage";
import { calculateNextTurnoffTime, evaluateProviderAvailability } from "@/utils/availability";
import type { Business } from "@/types";

/**
 * The "open for customers right now" switch, shared by the Dashboard and the Home page so the two can never disagree about
 * what turning it on means. Turning it on outside posted hours opens the shop only until the next closing time rather than
 * leaving it open indefinitely.
 *
 * Watched as fields, not as the object: `business` gets a new identity on every refetch, and re-running the sync then would
 * reset a toggle the owner just flipped before the server echoes it back.
 */
export function useShopOpenToggle(id: string, business: Business | undefined, refetch: () => unknown) {
  const { showToast } = useApp();
  const { t, tf } = useI18n();
  const [available, setAvailable] = useState(false);

  const loaded = business != null;
  const businessId = business?.id;
  const availableNow = business?.isAvailableNow;
  useEffect(() => {
    if (!loaded) return;
    setAvailable(availableNow ?? false);
  }, [businessId, loaded, availableNow]);

  async function toggle() {
    const previous = available;
    const next = !available;
    setAvailable(next);
    try {
      const scheduleEval = evaluateProviderAvailability(business?.hours, undefined, business?.availableUntil);
      if (next && !scheduleEval.isOpenNow) {
        const until = calculateNextTurnoffTime(business?.hours);
        await businessService.setAvailability(id, true, until.toISOString());
        showToast(tf("mdash_open_until", { time: until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }));
      } else {
        await businessService.setAvailability(id, next, null);
        showToast(next ? "Shop marked open right now" : "Shop marked closed");
      }
      invalidateQueryCache(`business:${id}`, () => bustBusinessGetCache(id));
      void refetch();
    } catch (error) {
      setAvailable(previous);
      const msg = String(errorMessage(error, ""));
      showToast(msg.includes("has_business_full_access")
        ? "Couldn't save — database permissions need updating (migration 20260842)"
        : msg || t("bfeat_err"));
    }
  }

  return { available, toggle };
}
