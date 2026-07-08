import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { Store, Key, Check, X, Clock, ChevronRight } from "@/components/Icons";
import { businessService, businessAccessService } from "@/services";
import type { Business } from "@/types";
import type { AccessSession, BusinessLoginConfig } from "@/services/marketplace/businessAccessService";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";

export default function BusinessAccess() {
  const nav = useNavigate();
  const { setContext, showToast, refreshUser } = useApp();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState<Business | null>(null);

  const { data: myBiz, loading: bizLoading } = useQuery(() => businessService.mine(), []);
  const { data: mySessions, refetch: refetchMine } = useQuery(() => businessAccessService.mySessions(), []);

  const activeGrants = (mySessions ?? []).filter((s) => s.status === "ACTIVE");
  const pendingGrants = (mySessions ?? []).filter((s) => s.status === "PENDING");

  async function doLogin() {
    if (!loginId.trim() || !password) return;
    setBusy(true);
    try {
      const res = await businessAccessService.login(loginId.trim(), password);
      setPassword("");
      if (res.status === "ACTIVE") {
        await refreshUser();
        setContext({ type: "business", id: res.businessId, name: res.businessName });
        showToast(`Logged in to ${res.businessName}`);
        nav(`/business/${res.businessId}/manage`);
      } else {
        showToast("Request sent — waiting for the owner to approve.");
        setLoginId("");
        refetchMine();
      }
    } catch (e: any) {
      showToast(e?.message || "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  function openDelegated(s: AccessSession) {
    setContext({ type: "business", id: s.businessId, name: s.businessName || "Business" });
    nav(`/business/${s.businessId}/manage`);
  }

  return (
    <div className="screen screen-boxed">
      <AppBar title="Business access" subtitle="Remote login & session control" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingTop: 14, paddingBottom: 30 }}>

        {/* ── Log into a business ── */}
        <div className="card col gap-10" style={{ padding: 16 }}>
          <div className="row gap-8 center-v"><Key size={18} color="var(--brand-600)" /><span className="semi small">Log in to a business</span></div>
          <p className="tiny muted" style={{ lineHeight: 1.4 }}>Enter the login id & password the owner gave you to manage their business from your account.</p>
          <input className="input" placeholder="Business login id" value={loginId} autoCapitalize="none" autoCorrect="off" onChange={(e) => setLoginId(e.target.value)} />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn-primary btn-block" disabled={busy || !loginId.trim() || !password} onClick={doLogin}>
            {busy ? "Checking…" : "Log in"}
          </button>
        </div>

        {/* ── Businesses I can access ── */}
        {(activeGrants.length > 0 || pendingGrants.length > 0) && (
          <div className="col gap-6">
            <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Businesses you can access</span>
            <div className="col gap-8">
              {activeGrants.map((s) => (
                <button key={s.id} className="card row gap-12 center-v" style={{ padding: 12, textAlign: "left" }} onClick={() => openDelegated(s)}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--orange-50)", display: "flex", alignItems: "center", justifyContent: "center" }}><Store size={20} color="var(--orange-500)" /></div>
                  <div className="grow">
                    <div className="semi small">{s.businessName}</div>
                    <div className="tiny" style={{ color: "var(--green-600)" }}>Active{s.expiresAt ? ` · until ${new Date(s.expiresAt).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}` : ""}</div>
                  </div>
                  <ChevronRight size={18} color="var(--ink-300)" />
                </button>
              ))}
              {pendingGrants.map((s) => (
                <div key={s.id} className="card row gap-12 center-v" style={{ padding: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--amber-50)", display: "flex", alignItems: "center", justifyContent: "center" }}><Clock size={20} color="var(--amber-700)" /></div>
                  <div className="grow">
                    <div className="semi small">{s.businessName}</div>
                    <div className="tiny muted">Waiting for owner approval…</div>
                  </div>
                  <button className="tiny semi" style={{ color: "var(--red-600)" }} onClick={async () => { await businessAccessService.revoke(s.id); refetchMine(); }}>Cancel</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Your businesses' access (owner) ── */}
        <div className="col gap-6">
          <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Your businesses' login</span>
          {bizLoading ? <ListSkeleton count={2} /> : (myBiz ?? []).length === 0 ? (
            <EmptyState emoji="🏪" title="No businesses yet" text="List a business to create a shareable login for it." />
          ) : (
            <div className="col gap-8">
              {(myBiz ?? []).map((b) => (
                <button key={b.id} className="card row gap-12 center-v" style={{ padding: 12, textAlign: "left" }} onClick={() => setManage(b)}>
                  <SafeImg src={b.coverImage} className="thumb" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
                  <div className="grow">
                    <div className="semi small">{b.name}</div>
                    <div className="tiny muted">Set login id, approval & session time</div>
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
  const { data: config, refetch: refetchConfig } = useQuery<BusinessLoginConfig | null>(() => businessAccessService.getConfig(business.id), [business.id]);
  const { data: sessions, refetch: refetchSessions } = useQuery(() => businessAccessService.ownerSessions(business.id), [business.id]);

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [requireApproval, setRequireApproval] = useState(true);
  const [hours, setHours] = useState("8");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Seed the form from the saved config once it loads.
  if (config && !seeded) {
    setLoginId(config.loginId);
    setRequireApproval(config.requireApproval);
    setHours(String(config.sessionHours));
    setEnabled(config.isEnabled);
    setSeeded(true);
  }

  const pending = (sessions ?? []).filter((s) => s.status === "PENDING");
  const active = (sessions ?? []).filter((s) => s.status === "ACTIVE");

  async function save() {
    if (!loginId.trim()) { showToast("Set a login id"); return; }
    if (!config && !password) { showToast("Set a password"); return; }
    setSaving(true);
    try {
      await businessAccessService.setLogin(business.id, {
        loginId: loginId.trim(),
        password,
        requireApproval,
        sessionHours: Math.max(1, Number(hours) || 8),
        enabled,
      });
      setPassword("");
      showToast("Login saved");
      refetchConfig();
    } catch (e: any) {
      showToast(e?.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function decide(id: string, approve: boolean) {
    try { await businessAccessService.decide(id, approve); refetchSessions(); showToast(approve ? "Access approved" : "Request denied"); }
    catch (e: any) { showToast(e?.message || "Couldn't update"); }
  }
  async function revoke(id: string) {
    try { await businessAccessService.revoke(id); refetchSessions(); showToast("Session revoked"); }
    catch (e: any) { showToast(e?.message || "Couldn't revoke"); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3 className="bold h2" style={{ marginBottom: 4 }}>{business.name} — login</h3>
        <p className="small muted" style={{ marginBottom: 14 }}>Share this id & password to let someone manage this business from their own STRYT account.</p>

        <div className="col gap-12">
          <div className="field">
            <label>Login id</label>
            <input className="input" value={loginId} autoCapitalize="none" autoCorrect="off" onChange={(e) => setLoginId(e.target.value)} placeholder="e.g. johns-store" />
          </div>
          <div className="field">
            <label>{config ? "New password (leave blank to keep)" : "Password"}</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="row between center-v">
            <div><div className="semi small">Approve before access</div><div className="tiny muted">You confirm each login before it works</div></div>
            <button className={`chip ${requireApproval ? "active" : ""}`} style={{ minWidth: 56, justifyContent: "center" }} onClick={() => setRequireApproval((v) => !v)}>{requireApproval ? "On" : "Off"}</button>
          </div>
          <div className="field">
            <label>Session length (hours)</label>
            <input className="input" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} placeholder="8" />
          </div>
          <div className="row between center-v">
            <div><div className="semi small">Login enabled</div><div className="tiny muted">Turn off to block all remote logins</div></div>
            <button className={`chip ${enabled ? "active" : ""}`} style={{ minWidth: 56, justifyContent: "center" }} onClick={() => setEnabled((v) => !v)}>{enabled ? "On" : "Off"}</button>
          </div>
          <button className="btn btn-primary btn-block" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save login"}</button>
        </div>

        {/* Pending requests */}
        {pending.length > 0 && (
          <div className="col gap-8" style={{ marginTop: 18 }}>
            <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Access requests</span>
            {pending.map((s) => (
              <div key={s.id} className="card row gap-10 center-v" style={{ padding: 10 }}>
                <SafeImg src={s.granteeAvatar} variant="avatar" style={{ width: 34, height: 34 }} />
                <div className="grow"><div className="semi small">{s.granteeName}</div><div className="tiny muted">wants access</div></div>
                <button className="icon-btn" style={{ width: 34, height: 34, background: "var(--green-100)", color: "var(--green-600)" }} onClick={() => decide(s.id, true)}><Check size={16} /></button>
                <button className="icon-btn" style={{ width: 34, height: 34, background: "var(--red-50)", color: "var(--red-600)" }} onClick={() => decide(s.id, false)}><X size={16} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Active sessions */}
        {active.length > 0 && (
          <div className="col gap-8" style={{ marginTop: 18 }}>
            <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Active sessions</span>
            {active.map((s) => (
              <div key={s.id} className="card row gap-10 center-v" style={{ padding: 10 }}>
                <SafeImg src={s.granteeAvatar} variant="avatar" style={{ width: 34, height: 34 }} />
                <div className="grow">
                  <div className="semi small">{s.granteeName}</div>
                  <div className="tiny muted">{s.expiresAt ? `until ${new Date(s.expiresAt).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}` : "active"}</div>
                </div>
                <button className="tiny semi" style={{ color: "var(--red-600)" }} onClick={() => revoke(s.id)}>Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
