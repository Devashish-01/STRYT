import { useEffect } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { useBusinessAccess } from "@/components/BusinessAccessGuard";
import { useApp } from "@/store";
import type { Scope } from "@/services/marketplace/businessAccessService";

/**
 * Wraps one manage-console route that only owner/FULL access — or a specific
 * scope — may enter. Defense-in-depth against direct URL navigation into a
 * section BusinessHub/ManageNav already hide from a SCOPED team member who
 * lacks it (those hide the link; this blocks the route itself). Must render
 * INSIDE BusinessAccessGuard, which provides the access context this reads.
 *
 * Pass `scope` for one of the four grantable sections (appointments/queue/
 * catalog/leads); omit it for the owner-only surfaces (profile, broadcast,
 * verification, settings, payments, reviews, community) that no scope can
 * ever unlock.
 */
export default function RequireScope({ scope }: { scope?: Scope }) {
  const { id = "" } = useParams();
  const { accessLevel, hasScope } = useBusinessAccess();
  const { showToast } = useApp();
  const base = `/business/${id}/manage`;
  const allowed = scope ? hasScope(scope) : accessLevel === "FULL";

  useEffect(() => {
    if (!allowed) showToast("You don't have access to that section");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (!allowed) return <Navigate to={base} replace />;
  return <Outlet />;
}
