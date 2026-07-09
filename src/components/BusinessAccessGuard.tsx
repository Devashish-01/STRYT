import { useEffect, useState } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { businessAccessService } from "@/services";
import { useApp } from "@/store";
import { Skeleton } from "@/components/states";

/**
 * Wraps every /business/:id/manage* route. Owned-business reads always
 * succeed via the public `businesses` SELECT policy, so without this guard a
 * revoked delegate could still open and browse the whole console — write
 * actions would silently fail one by one via RLS, but the UI itself never
 * told them access was gone. This re-validates against
 * has_business_access() (owner OR active session) on every entry to the
 * console and on every business_access_sessions change, and bounces to the
 * customer home the moment access is missing — same guarantee the RLS write
 * policies already give the database, now enforced for reads too.
 */
export default function BusinessAccessGuard() {
  const { id = "" } = useParams();
  const { ownedBusinessIds, setContext, showToast } = useApp();
  const isOwner = ownedBusinessIds.includes(id);

  // Owners never need the network round trip — they always have access.
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">(isOwner ? "allowed" : "checking");

  useEffect(() => {
    if (isOwner) {
      setStatus("allowed");
      return;
    }
    let active = true;
    setStatus("checking");
    businessAccessService.checkAccess(id).then((ok) => {
      if (!active) return;
      setStatus(ok ? "allowed" : "denied");
    });
    return () => { active = false; };
  }, [id, isOwner]);

  if (status === "checking") {
    return (
      <div className="screen page-pad" style={{ paddingTop: "calc(20px + var(--safe-area-top))" }}>
        <Skeleton h={40} mb={16} />
        <Skeleton h={120} mb={12} />
        <Skeleton h={120} />
      </div>
    );
  }

  if (status === "denied") {
    setContext({ type: "customer", id: null, name: "" });
    showToast("Your access to that business was revoked");
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
}
