import { useEffect, useRef, useState } from "react";
import { invalidateQueryCache } from "@/hooks/useApi";
import { providerService, bustProviderGetCache } from "@/services/marketplace/providerService";
import { bookingStatus } from "@/lib/consoleStatus";
import { errorMessage } from "@/lib/errorMessage";
import { BUSINESS_PACKAGES, resolvePackage } from "@/lib/businessPackages";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/store";
import type { Provider } from "@/types";

export function useProviderStatus(id: string, provider: Provider | undefined, refetch: () => void) {
  const { showToast } = useApp();
  const { t } = useI18n();
  const persistedAvailability = provider?.isAvailableNow ?? false;
  const persistedAccepting = provider?.isOpenNow ?? true;
  const bookingsOn = provider?.bookingsEnabled ?? BUSINESS_PACKAGES[resolvePackage(provider ?? {})].bookingsDefault;
  const [available, setAvailable] = useState(persistedAvailability);
  const [accepting, setAccepting] = useState(persistedAccepting);
  const [saving, setSaving] = useState(false);
  const pending = useRef<"availability" | "bookings" | null>(null);

  useEffect(() => {
    if (pending.current !== "availability") setAvailable(persistedAvailability);
  }, [persistedAvailability]);
  useEffect(() => {
    if (pending.current !== "bookings") setAccepting(persistedAccepting);
  }, [persistedAccepting]);

  async function toggle(kind: "availability" | "bookings") {
    if (!provider || pending.current || (kind === "bookings" && !bookingsOn)) return;
    const isAvailability = kind === "availability";
    const next = !(isAvailability ? available : accepting);
    const set = isAvailability ? setAvailable : setAccepting;
    pending.current = kind;
    setSaving(true);
    set(next);
    try {
      if (isAvailability) {
        await providerService.setAvailability(id, next, 3);
        showToast(t(next ? "provider_available_for_three" : "provider_unavailable"));
      } else {
        await providerService.update(id, { isOpenNow: next });
        showToast(t(next ? "console_bookings_accepting" : "console_bookings_paused"));
      }
    } catch (error) {
      set(!next);
      showToast(errorMessage(error, t("bfeat_err")));
    } finally {
      pending.current = null;
      setSaving(false);
      invalidateQueryCache(`provider:${id}`, () => bustProviderGetCache(id));
      refetch();
    }
  }

  return {
    available, bookingsOn, booking: bookingStatus(bookingsOn, accepting), saving,
    toggleAvailability: () => toggle("availability"),
    toggleBookings: () => toggle("bookings"),
  };
}
