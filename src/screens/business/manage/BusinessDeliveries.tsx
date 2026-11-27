import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { ErrorView } from "@/components/states";
import { LiveBoardContent } from "@/components/delivery/LiveBoardContent";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import { useI18n } from "@/lib/i18n";
import ManageNav from "./ManageNav";

/**
 * Dedicated Live Board route (/business/:id/manage/deliveries).
 * Opens with "Live board" selected by default and gives 1-tap switching
 * to Dispatch or Finished orders so the owner is never trapped on an empty view.
 */
export default function BusinessDeliveries() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
  const [activeCount, setActiveCount] = useState(0);

  if (!DELIVERY_AGENT_ENABLED) return <Navigate to={`/business/${id}/manage`} replace />;

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Deliveries" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  return (
    <div className="screen with-nav">
      <div style={{ position: "sticky", top: 0, zIndex: 25, background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <AppBar
          title={t("dlv_live_board")}
          subtitle={activeCount > 0 ? `${activeCount} in progress` : "Nothing out right now"}
        />
        <div className="row gap-6" style={{ padding: "8px 14px 10px", background: "var(--ink-50)" }}>
          <button
            type="button"
            className="chip grow center"
            onClick={() => nav(`/business/${id}/manage/appointments?tab=deliveries&view=dispatch`)}
          >
            📦 {t("dlv_view_dispatch")}
          </button>
          <button
            type="button"
            className="chip active grow center"
            aria-current="page"
          >
            🛵 {t("dlv_live_board")}{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
          <button
            type="button"
            className="chip grow center"
            onClick={() => nav(`/business/${id}/manage/appointments?tab=deliveries&view=finished`)}
          >
            ✓ {t("dlv_view_finished")}
          </button>
        </div>
      </div>

      <div className="screen-scroll">
        <LiveBoardContent businessId={id} onActiveCountChange={setActiveCount} />
      </div>

      <ManageNav bizId={id} />
    </div>
  );
}
