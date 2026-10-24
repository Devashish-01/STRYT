import { useEffect } from "react";
import { useQuery } from "@/hooks/useApi";
import { deliveryService } from "@/services";
import { ORDER_STAGES, orderStageIndex } from "@/lib/deliveryStage";
import { etaDisplay, stageCopy } from "@/lib/orderJourney";
import { useI18n } from "@/lib/i18n";
import type { AppointmentRecord } from "@/types";

/**
 * The two lines of a "your order" card on Home: where the order is (with its picture) and when it arrives. They read the same progress
 * the tracker reads (same cache key), and keep it fresh while Home is open, so the card changes as the order does.
 */
function useOrderStage(apt: Pick<AppointmentRecord, "id" | "status" | "readyAt">) {
  const { data: d, refetch } = useQuery(() => deliveryService.myProgress(apt.id), [apt.id], `delivery:my-progress:${apt.id}`);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") refetch(); }, 15000);
    return () => clearInterval(timer);
  }, [refetch]);
  const idx = orderStageIndex(apt, d ? { status: d.status, pickedUp: d.pickedUp } : null);
  const stage = idx >= 0 ? ORDER_STAGES[idx] : null;
  return { d, stage, arrived: d?.status === "ARRIVED" };
}

export function LiveOrderHeadline({ apt }: { apt: AppointmentRecord }) {
  const { t } = useI18n();
  const { stage, arrived } = useOrderStage(apt);
  if (!stage) return null;
  const c = stageCopy(stage, arrived);
  return <>{c.emoji} {t(c.headlineKey)}</>;
}

export function LiveOrderEta({ apt }: { apt: AppointmentRecord }) {
  const { t, tf } = useI18n();
  const { d, stage, arrived } = useOrderStage(apt);
  if (!stage) return null;
  const eta = d?.status === "EN_ROUTE" ? etaDisplay(d.etaMinutes) : null;
  if (eta) return <>{eta.kind === "now" ? t("trk_eta_now") : tf("home_order_eta", { n: eta.n })}</>;
  return <>{t(stageCopy(stage, arrived).subKey)}</>;
}
