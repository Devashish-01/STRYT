import { RotateCcw, Loader } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";

/**
 * "Search this area" — the pill that appears once the map has been moved far
 * enough that the on-screen results no longer describe what you're looking at.
 *
 * Deliberately a button rather than an automatic refetch on pan-settle:
 *   · one query per tap, so browsing costs nothing,
 *   · results never shift under someone mid-scan of the list,
 *   · no request cancellation machinery needed for a drag that changes
 *     direction three times.
 */
export default function SearchThisArea({
  busy, onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="chip-pill map-search-area"
      onClick={onClick}
      disabled={busy}
    >
      {busy ? <Loader size={14} className="spin" /> : <RotateCcw size={14} />}
      <span>{busy ? t("map_searching") : t("map_search_this_area")}</span>
    </button>
  );
}
