import { useEffect } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { useBusinessAccess } from "@/components/BusinessAccessGuard";
import { useApp } from "@/store";

/**
 * Owner-only manage routes (settings, profile, payments, etc.). FULL delegates
 * and scoped team members are bounced — stricter than the old RequireScope()
 * with no scope, which allowed FULL access.
 */
export default function RequireOwner() {
  const { id = "" } = useParams();
  const { isOwner } = useBusinessAccess();
  const { showToast } = useApp();
  const base = `/business/${id}/manage`;

  useEffect(() => {
    if (!isOwner) showToast("Only the business owner can open that section");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  if (!isOwner) return <Navigate to={base} replace />;
  return <Outlet />;
}
