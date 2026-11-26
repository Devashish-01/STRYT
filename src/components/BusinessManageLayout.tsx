import { Outlet, useParams } from "react-router-dom";
import { useBusinessAccess } from "@/lib/businessAccess";
import TeamConsoleBanner from "@/components/TeamConsoleBanner";
import { BusinessConsoleDataContext, useLoadBusinessConsoleData } from "@/features/business-home/businessConsoleData";

/** Wraps all /business/:id/manage* routes with console-mode theming. */
export default function BusinessManageLayout() {
  const { consoleMode } = useBusinessAccess();
  const { id = "" } = useParams();
  const data = useLoadBusinessConsoleData(id);

  return (
    <div className="business-manage-root" data-console-mode={consoleMode}>
      <TeamConsoleBanner />
      <BusinessConsoleDataContext.Provider value={data}>
        <Outlet />
      </BusinessConsoleDataContext.Provider>
    </div>
  );
}
