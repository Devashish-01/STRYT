import { MILESTONES } from "@/lib/orderJourney";
import { useI18n } from "@/lib/i18n";

/**
 * The five named milestones of a home-delivery order (sent · packing · rider · on the way · delivered), a tick on each one done and a
 * soft ring on the one in progress. The customer's tracker and the shop's order card show the same strip, so both read the same.
 * `here` is the milestone index from milestoneIndex(); `delivered` turns every dot green.
 */
export function JourneySteps({ here, delivered = false }: { here: number; delivered?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`trk-steps${delivered ? " all-done" : ""}`}>
      {MILESTONES.map((m, i) => {
        const done = delivered || i < here;
        const now = !delivered && i === here;
        return (
          <div key={m} className={`trk-step${done ? " done" : ""}${now ? " now" : ""}`}>
            <span className="trk-dot" aria-hidden="true">{done ? "✓" : i + 1}</span>
            <span>{t(`trk_m_${m}`)}</span>
          </div>
        );
      })}
    </div>
  );
}
