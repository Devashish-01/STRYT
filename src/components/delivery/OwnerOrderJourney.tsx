import { JourneySteps } from "@/components/delivery/JourneySteps";
import { ORDER_STAGES, orderStageIndex } from "@/lib/deliveryStage";
import { milestoneIndex, ownerNextStepKey } from "@/lib/orderJourney";
import { useI18n } from "@/lib/i18n";
import type { AppointmentDelivery } from "@/services/engagement/deliveryService";
import type { AppointmentRecord } from "@/types";

/**
 * The shop's view of where a home-delivery order is — the same five named steps the customer follows, with one line under them for what
 * to do next. The owner never has to guess whether to pack, assign, or wait.
 */
export function OwnerOrderJourney({ apt, delivery }: { apt: AppointmentRecord; delivery: AppointmentDelivery | null | undefined }) {
  const { t } = useI18n();
  const active = delivery && delivery.status !== "CANCELLED" ? delivery : null;
  const idx = orderStageIndex(apt, active ? { status: active.status } : null);
  if (idx < 0) return null;
  const done = ORDER_STAGES[idx] === "delivered";
  const hintKey = ownerNextStepKey(apt, active);
  return (
    <div className="col gap-8" style={{ padding: "10px 6px 8px", background: "var(--delivery-50)", borderRadius: 12 }}>
      <JourneySteps here={milestoneIndex(idx)} delivered={done} />
      {hintKey && (
        <div className="small semi" style={{ textAlign: "center", color: done ? "var(--green-700)" : "var(--delivery-800)" }}>{t(hintKey)}</div>
      )}
    </div>
  );
}
