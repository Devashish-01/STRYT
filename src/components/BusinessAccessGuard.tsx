import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { businessAccessService } from "@/services";
import type { AccessLevel, Scope } from "@/services/marketplace/businessAccessService";
import { useApp } from "@/store";
import { Skeleton } from "@/components/states";

interface BusinessAccessValue {
  isOwner: boolean;
  accessLevel: AccessLevel;
  scopes: Scope[];
  hasScope: (scope: Scope) => boolean;
}

const FULL_ACCESS: BusinessAccessValue = { isOwner: true, accessLevel: "FULL", scopes: [], hasScope: () => true };

const BusinessAccessContext = createContext<BusinessAccessValue>(FULL_ACCESS);

/**
 * What can the current user do in THIS business's manage console — owner,
 * a FULL delegate (both act exactly like the owner), or a SCOPED team member
 * (only the sections in `scopes`). Defaults to full/owner access when read
 * outside a BusinessAccessGuard, so screens that don't care about scope
 * (or aren't behind the guard at all) keep working unchanged.
 */
export function useBusinessAccess() {
  return useContext(BusinessAccessContext);
}

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
 *
 * Also fetches the session's scope (once allow/deny is settled) and
 * publishes it via BusinessAccessContext so BusinessHub/ManageNav/etc. can
 * filter what they show a SCOPED team member without each re-fetching it.
 */
export default function BusinessAccessGuard() {
  const { id = "" } = useParams();
  const { ownedBusinessIds, ownedEntitiesLoaded, setContext, showToast } = useApp();
  const isOwner = ownedBusinessIds.includes(id);

  // Owners never need the network round trip — they always have access.
  const [status, setStatus] = useState<"checking" | "allowed" | "denied" | "retry">(isOwner ? "allowed" : "checking");
  const [attempt, setAttempt] = useState(0);
  const [waitedEnough, setWaitedEnough] = useState(false);
  const [scope, setScope] = useState<{ accessLevel: AccessLevel; scopes: Scope[] }>({ accessLevel: "FULL", scopes: [] });

  // Give ownedBusinessIds up to 2.5s to hydrate (skips an unnecessary network
  // round trip for the common case: an owner reopening the app). Bounded so
  // access is never stuck waiting forever if hydration never completes —
  // after the wait, fall through to the server-authoritative RPC regardless,
  // same as a non-owner/delegate always has.
  useEffect(() => {
    if (ownedEntitiesLoaded) return;
    const timer = window.setTimeout(() => setWaitedEnough(true), 2500);
    return () => window.clearTimeout(timer);
  }, [ownedEntitiesLoaded]);

  useEffect(() => {
    if (isOwner) {
      setStatus("allowed");
      return;
    }
    if (!ownedEntitiesLoaded && !waitedEnough) return;
    let active = true;
    setStatus("checking");
    businessAccessService.checkAccess(id).then((result) => {
      if (!active) return;
      if (result === "ERROR") { setStatus("retry"); return; }
      if (result === "DENIED") { setStatus("denied"); return; }
      businessAccessService.myScope(id).then((s) => {
        if (!active) return;
        setScope(s);
        setStatus("allowed");
      });
    });
    return () => { active = false; };
  }, [id, isOwner, ownedEntitiesLoaded, waitedEnough, attempt]);

  if (status === "checking") {
    return (
      <div className="screen page-pad" style={{ paddingTop: "calc(20px + var(--safe-area-top))" }}>
        <Skeleton h={40} mb={16} />
        <Skeleton h={120} mb={12} />
        <Skeleton h={120} />
      </div>
    );
  }

  if (status === "retry") {
    return (
      <div className="screen page-pad center-v center-h col gap-12" style={{ paddingTop: "calc(20px + var(--safe-area-top))", minHeight: "60vh", textAlign: "center" }}>
        <div className="semi">Couldn't verify your access</div>
        <div className="small muted">Check your connection and try again — nothing about your access has changed.</div>
        <button className="btn btn-primary" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
      </div>
    );
  }

  if (status === "denied") {
    setContext({ type: "customer", id: null, name: "" });
    showToast("Your access to that business was revoked");
    return <Navigate to="/home" replace />;
  }

  const value: BusinessAccessValue = isOwner
    ? FULL_ACCESS
    : {
        isOwner: false,
        accessLevel: scope.accessLevel,
        scopes: scope.scopes,
        hasScope: (s) => scope.accessLevel === "FULL" || scope.scopes.includes(s),
      };

  return (
    <BusinessAccessContext.Provider value={value}>
      <Outlet />
    </BusinessAccessContext.Provider>
  );
}
