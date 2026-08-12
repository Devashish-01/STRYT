import { useState } from "react";
import { useQuery } from "@/hooks/useApi";
import { catalogService } from "@/services";
import { useI18n } from "@/lib/i18n";
import { Skeleton } from "@/components/states";
import { BeatFrame } from "./BeatFrame";

/**
 * Beat 4 — "What brings you here?"
 *
 * The only genuinely new thing the flow collects, and deliberately the
 * cheapest to answer: taps on the real top-level categories, no minimum, fully
 * skippable. It exists so the first Home isn't identical for everyone — the
 * nearby rail leads with what they picked.
 *
 * Parents only (`parentId === null`): the ten groups are a decision someone can
 * make in a couple of seconds, where the ~55 leaf categories are a directory.
 *
 * Uses the UNFILTERED tree (getCategories(), no kind argument) rather than
 * byKind("BUSINESS") — three of the ten top-level groups (Home & Repair,
 * Professional Services, Events & Personal) are seeded as kind: 'SERVICE', so
 * byKind("BUSINESS") silently dropped them. Home.tsx ranks both the business
 * AND the provider nearby rails off these same ids, and providers skew toward
 * exactly those three groups, so filtering here would have made personalization
 * structurally unavailable for most providers no matter what a user picked.
 */
export function BeatInterests({
  initial,
  busy,
  onDone,
  onSkip,
}: {
  initial?: string[] | null;
  busy?: boolean;
  onDone: (categoryIds: string[]) => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const { data, loading } = useQuery(() => catalogService.getCategories(), [], "categories");
  const groups = (data ?? []).filter((c) => c.parentId === null);
  const [picked, setPicked] = useState<string[]>(initial ?? []);

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <BeatFrame
      title={t("ob_beat4_title")}
      sub={t("ob_beat4_sub")}
      ctaLabel={t("ob_beat4_finish")}
      ctaBusy={busy}
      onCta={() => onDone(picked)}
      onSkip={onSkip}
    >
      {loading ? (
        <div className="ob-interests">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={44} r={14} mb={0} />)}
        </div>
      ) : (
        <div className="ob-interests">
          {groups.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`ob-interest ${picked.includes(c.id) ? "active" : ""}`}
              aria-pressed={picked.includes(c.id)}
              onClick={() => toggle(c.id)}
            >
              <span className="ob-interest-icon">{c.icon}</span>
              <span className="ob-interest-name">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </BeatFrame>
  );
}
