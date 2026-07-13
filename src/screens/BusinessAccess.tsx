import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { Store, Key, ChevronRight, UserPlus } from "@/components/Icons";
import { businessService, businessAccessService } from "@/services";
import type { Business } from "@/types";
import type { AccessSession } from "@/services/marketplace/businessAccessService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { useApp } from "@/store";

export default function BusinessAccess() {
  const nav = useNavigate();
  const { user, activeContext, setContext, showToast } = useApp();

  const { data: myBiz, loading: bizLoading } = useQuery(() => businessService.mine(), []);
  const { data: mySessions, refetch: refetchMySessions } = useQueryWithRealtime(
    () => businessAccessService.mySessions(),
    "business_access_sessions",
    [user.id],
    `grantee_user_id=eq.${user.id}`,
  );
  const [manage, setManage] = useState<Business | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);

  const activeGrants = (mySessions ?? []).filter((s) => s.status === "ACTIVE");

  function openDelegated(s: AccessSession) {
    setContext({ type: "business", id: s.businessId, name: s.businessName || "Business" });
    nav(`/business/${s.businessId}/manage`);
  }

  // Grantee revokes their own access. If they're currently "wearing" this
  // business, drop back to the customer context immediately instead of
  // leaving activeContext pointed at a business they can no longer manage.
  async function leaveAccess(s: AccessSession) {
    setLeaving(s.id);
    try {
      await businessAccessService.revoke(s.id);
      if (activeContext.type === "business" && activeContext.id === s.businessId) {
        setContext({ type: "customer", id: null, name: user.name });
      }
      showToast("Access removed");
      refetchMySessions();
    } catch (e: any) {
      showToast(e?.message || "Couldn't remove access");
    } finally {
      setLeaving(null);
    }
  }

  return (
    <div className="screen screen-boxed">
      <AppBar title="Business access" subtitle="Grant staff access & manage sessions" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingTop: 14, paddingBottom: 30 }}>

        {/* ── Businesses granted to me ── */}
        {activeGrants.length > 0 && (
          <div className="col gap-6">
            <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Businesses you can access</span>
            <div className="col gap-8">
              {activeGrants.map((s) => (
                <div key={s.id} className="card row gap-12 center-v" style={{ padding: 12 }}>
                  <button className="row gap-12 center-v grow" style={{ textAlign: "left" }} onClick={() => openDelegated(s)}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--orange-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Store size={20} color="var(--orange-500)" /></div>
                    <div className="grow">
                      <div className="semi small">{s.businessName}</div>
                      <div className="tiny" style={{ color: "var(--green-600)" }}>You can manage this business</div>
                    </div>
                    <ChevronRight size={18} color="var(--ink-300)" />
                  </button>
                  <button
                    className="tiny semi"
                    style={{ color: "var(--red-600)", flexShrink: 0, padding: "4px 6px" }}
                    disabled={leaving === s.id}
                    onClick={() => leaveAccess(s)}
                  >
                    {leaving === s.id ? "…" : "Remove"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── My businesses — grant access to others ── */}
        <div className="col gap-6">
          <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Your businesses</span>
          {bizLoading ? <ListSkeleton count={2} /> : (myBiz ?? []).length === 0 ? (
            <EmptyState emoji="🏪" title="No businesses yet" text="List a business to give staff access to it." />
          ) : (
            <div className="col gap-8">
              {(myBiz ?? []).map((b) => (
                <button key={b.id} className="card row gap-12 center-v" style={{ padding: 12, textAlign: "left" }} onClick={() => setManage(b)}>
                  <SafeImg src={b.coverImage} className="thumb" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
                  <div className="grow">
                    <div className="semi small">{b.name}</div>
                    <div className="tiny muted">Grant or revoke staff access</div>
                  </div>
                  <Key size={17} color="var(--ink-400)" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {manage && <ManageSheet business={manage} onClose={() => setManage(null)} />}
    </div>
  );
}

function ManageSheet({ business, onClose }: { business: Business; onClose: () => void }) {
  const { showToast } = useApp();
  const { data: sessions, refetch: refetchSessions } = useQueryWithRealtime(
    () => businessAccessService.ownerSessions(business.id),
    "business_access_sessions",
    [business.id],
    `business_id=eq.${business.id}`,
  );

  const [identifier, setIdentifier] = useState("");
  const [adding, setAdding] = useState(false);

  const active = (sessions ?? []).filter((s) => s.status === "ACTIVE");
  const history = (sessions ?? []).filter((s) => ["REVOKED", "EXPIRED", "DENIED"].includes(s.status)).slice(0, 30);

  async function addGrant() {
    if (!identifier.trim()) { showToast("Enter a mobile number or email"); return; }
    setAdding(true);
    try {
      const res = await businessAccessService.grantByIdentifier(business.id, identifier.trim());
      showToast(`Access granted to ${res.name}`);
      setIdentifier("");
      refetchSessions();
    } catch (e: any) {
      showToast(e?.message || "Couldn't grant access");
    } finally {
      setAdding(false);
    }
  }

  async function revoke(id: string) {
    try { await businessAccessService.revoke(id); refetchSessions(); showToast("Access revoked"); }
    catch (e: any) { showToast(e?.message || "Couldn't revoke"); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3 className="bold h2" style={{ marginBottom: 4 }}>{business.name} — access</h3>
        <p className="small muted" style={{ marginBottom: 14 }}>Add a customer by their STRYT mobile number, email, or username to let them manage this business from their own account.</p>

        {/* Grant form */}
        <div className="field">
          <label>Customer's mobile number, email, or username</label>
          <div className="row gap-8">
            <input
              className="input grow"
              value={identifier}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="e.g. 98765 43210, name@email.com, or @username"
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addGrant(); }}
            />
            <button className="btn btn-primary" disabled={adding || !identifier.trim()} onClick={addGrant}>
              <UserPlus size={16} /> {adding ? "…" : "Add"}
            </button>
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>They must already have a STRYT account. Access lasts until you revoke it.</div>
        </div>

        {/* People with access */}
        {active.length > 0 && (
          <div className="col gap-8" style={{ marginTop: 18 }}>
            <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>People with access</span>
            {active.map((s) => (
              <div key={s.id} className="card row gap-10 center-v" style={{ padding: 10 }}>
                <SafeImg src={s.granteeAvatar} variant="avatar" style={{ width: 34, height: 34 }} />
                <div className="grow">
                  <div className="semi small">{s.granteeName}</div>
                  <div className="tiny" style={{ color: "var(--green-600)" }}>Can manage this business</div>
                </div>
                <button className="tiny semi" style={{ color: "var(--red-600)" }} onClick={() => revoke(s.id)}>Revoke</button>
              </div>
            ))}
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="col gap-8" style={{ marginTop: 18 }}>
            <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Access history</span>
            {history.map((s) => {
              const label = s.status === "DENIED" ? "Denied" : s.status === "REVOKED" ? "Revoked" : "Expired";
              const when = new Date(s.requestedAt).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
              return (
                <div key={s.id} className="card row gap-10 center-v" style={{ padding: 10, opacity: 0.7 }}>
                  <SafeImg src={s.granteeAvatar} variant="avatar" style={{ width: 32, height: 32 }} />
                  <div className="grow">
                    <div className="semi small">{s.granteeName}</div>
                    <div className="tiny muted">{label} · {when}</div>
                  </div>
                  <span className="tiny semi" style={{ color: s.status === "DENIED" ? "var(--red-600)" : "var(--ink-400)" }}>{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
