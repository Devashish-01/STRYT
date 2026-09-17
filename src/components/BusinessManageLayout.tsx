import { Outlet } from "react-router-dom";
import { useBusinessAccess } from "@/lib/businessAccess";
import TeamConsoleBanner from "@/components/TeamConsoleBanner";

/** Wraps all /business/:id/manage* routes with console-mode theming. */
export default function BusinessManageLayout() {
  const { consoleMode } = useBusinessAccess();

  return (
    <div className="business-manage-root" data-console-mode={consoleMode}>
      <TeamConsoleBanner />
      <Outlet />
    </div>
  );
}
