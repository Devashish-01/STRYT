import { useEffect, useRef, useState } from "react";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { errorMessage } from "@/lib/errorMessage";
import { BUSINESS_PACKAGES, resolvePackage } from "@/lib/businessPackages";
import { invalidateQueryCache } from "@/hooks/useApi";
import { businessService, bustBusinessGetCache } from "@/services";
import { calculateNextTurnoffTime, evaluateProviderAvailability } from "@/utils/availability";
import type { Business } from "@/types";
import { bookingStatus } from "@/lib/consoleStatus";

export function useShopStatus(id: string, business: Business | undefined, isOwner: boolean, refetch: () => void) {
  const { showToast } = useApp();
  const { t, tf } = useI18n();
  const persistedAvailability = business?.isAvailableNow ?? false;
  const persistedAccepting = business?.isOpenNow ?? true;
  const bookingsOn = business?.bookingsEnabled ?? BUSINESS_PACKAGES[resolvePackage(business ?? {})].bookingsDefault;
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

  function finishWrite() {
    pending.current = null;
    setSaving(false);
    invalidateQueryCache(`business:${id}`, () => bustBusinessGetCache(id));
    refetch();
  }

  async function toggleAvailability() {
    if (!isOwner || !business || pending.current) return;
    const next = !available;
    pending.current = "availability";
    setSaving(true);
    setAvailable(next);
    try {
      const schedule = evaluateProviderAvailability(business.hours, undefined, business.availableUntil);
      const until = next && !schedule.isOpenNow ? calculateNextTurnoffTime(business.hours) : null;
      await businessService.setAvailability(id, next, until?.toISOString() ?? null);
      showToast(until ? tf("mdash_open_until", { time: until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })
        : t(next ? "bhome_open_now" : "bhome_closed_now"));
    } catch (error) {
      setAvailable(!next);
      showToast(errorMessage(error, t("bfeat_err")));
    } finally {
      finishWrite();
    }
  }

  async function toggleBookings() {
    if (!isOwner || !business || !bookingsOn || pending.current) return;
    const next = !accepting;
    pending.current = "bookings";
    setSaving(true);
    setAccepting(next);
    try {
      await businessService.update(id, { isOpenNow: next });
      showToast(t(next ? "console_bookings_accepting" : "console_bookings_paused"));
    } catch (error) {
      setAccepting(!next);
      showToast(errorMessage(error, t("bfeat_err")));
    } finally {
      finishWrite();
    }
  }

  return { available, bookingsOn, booking: bookingStatus(bookingsOn, accepting), saving, toggleAvailability, toggleBookings };
}
