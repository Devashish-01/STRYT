import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { Store, Key, ChevronRight, UserPlus, Pencil, Clock, Check, X, Copy } from "@/components/Icons";
import { businessService, businessAccessService } from "@/services";
import type { Business } from "@/types";
import type { AccessSession, Scope, BusinessLoginConfig } from "@/services/marketplace/businessAccessService";
import { SCOPE_LABELS } from "@/services/marketplace/businessAccessService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";
import Toggle from "@/components/Toggle";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";

const SCOPE_META: Record<Scope, { label: string; text: string }> = {
  appointments: { label: SCOPE_LABELS.appointments, text: "View and manage booking requests" },
  queue: { label: SCOPE_LABELS.queue, text: "Call, serve and manage the walk-in queue" },
  catalog: { label: SCOPE_LABELS.catalog, text: "Products, inventory, portfolio and hours" },
  leads: { label: SCOPE_LABELS.leads, text: "Respond to leads, send quotes, answer questions" },
  delivery: { label: SCOPE_LABELS.delivery, text: "Pick up and deliver orders assigned to them" },
};
// Management scopes drive the "Full access" preset. Delivery is a distinct
// role (its own hat/console), so it's a separate opt-in toggle rather than part
// of "full". It only appears while the delivery feature is enabled.
const MANAGEMENT_SCOPES: Scope[] = ["appointments", "queue", "catalog", "leads"];
const ALL_SCOPES: Scope[] = DELIVERY_AGENT_ENABLED ? [...MANAGEMENT_SCOPES, "delivery"] : MANAGEMENT_SCOPES;

type Preset = "front_desk" | "store_manager" | "delivery_rider" | "full" | "custom";
const PRESETS: { id: Exclude<Preset, "custom">; label: string; scopes: Scope[] }[] = [
  { id: "front_desk", label: "Front desk", scopes: ["appointments", "queue"] },
  { id: "store_manager", label: "Store manager", scopes: ["catalog", "leads"] },
  ...(DELIVERY_AGENT_ENABLED ? [{ id: "delivery_rider" as const, label: "Delivery rider", scopes: ["delivery"] as Scope[] }] : []),
  { id: "full", label: "Full access", scopes: MANAGEMENT_SCOPES },
];

function presetForScopes(scopes: Scope[]): Preset {
  const match = PRESETS.find((p) => p.scopes.length === scopes.length && p.scopes.every((s) => scopes.includes(s)));
  return match?.id ?? "custom";
}

/** #5 — expiresAt was fetched, mapped, and never rendered, so a login session
 *  that ends tonight looked identical to a permanent named grant. Null means it
 *  genuinely doesn't expire, which is worth saying out loud rather than leaving
 *  blank. */
function expiryLabel(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return "Expired";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `Ends in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Ends in ${hrs} hr`;
  return `Ends ${new Date(expiresAt).toLocaleDateString([], { day: "numeric", month: "short" })}`;
}

function scopeSummary(s: Pick<AccessSession, "accessLevel" | "scopes">): string {
  if (s.accessLevel === "FULL") return "Full access";
  if (s.scopes.length === 0) return "No access";
  return s.scopes.map((sc) => SCOPE_META[sc].label).join(", ");
}

export default function BusinessAccess() {
  const nav = useNavigate();
  const { user, activeContext, setContext, attemptSwitchContext, showToast } = useApp();

  const { data: myBiz, loading: bizLoading } = useQuery(() => businessService.mine(), [user.id], `my-businesses:${user.id}`);
  const { data: mySessions, refetch: refetchMySessions } = useQueryWithRealtime(
    () => businessAccessService.mySessions(),
    "business_access_sessions",
    [user.id],
    `grantee_user_id=eq.${user.id}`,
    `business-access:my-sessions:${user.id}`
  );
  const [manage, setManage] = useState<Business | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);

  const activeGrants = (mySessions ?? []).filter((s) => s.status === "ACTIVE");

  function openDelegated(s: AccessSession) {
    const dest = `/business/${s.businessId}/manage`;
    const ready = attemptSwitchContext({ type: "business", id: s.businessId, name: s.businessName || "Business" }, dest);
    if (ready) nav(dest);
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
      <AppBar title="Team & access" subtitle="Add team members & manage sessions" />
      <div className="screen-scroll page-pad col gap-16 scroll-pad-end" style={{ paddingTop: 14 }}>

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
                      <div className="tiny" style={{ color: "var(--green-600)" }}>
                      {scopeSummary(s)}
                      {expiryLabel(s.expiresAt) && <span className="muted"> · {expiryLabel(s.expiresAt)}</span>}
                    </div>
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

        {/* The staff entry point. Placed here rather than buried in Settings
            because this screen is already where "which shops can I open" is
            answered — and until now it only ever answered it for people the
            owner had added BY NAME, with no route in for anyone holding a shop
            login. */}
        <button className="card row gap-12 center-v" style={{ padding: 12, textAlign: "left" }} onClick={() => nav("/business-login")}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Key size={19} color="var(--brand-700)" />
          </div>
          <div className="grow">
            <div className="semi small">Have a shop login?</div>
            <div className="tiny muted">Open a shop you work at using its id and password</div>
          </div>
          <ChevronRight size={18} color="var(--ink-300)" />
        </button>

        {/* ── My businesses — add team members ── */}
        <div className="col gap-6">
          <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Your businesses</span>
          {bizLoading ? <ListSkeleton count={2} /> : (myBiz ?? []).length === 0 ? (
            <EmptyState emoji="🏪" title="No businesses yet" text="List a business to add team members to it." />
          ) : (
            <div className="col gap-8">
              {(myBiz ?? []).map((b) => (
                <button key={b.id} className="card row gap-12 center-v" style={{ padding: 12, textAlign: "left" }} onClick={() => setManage(b)}>
                  <SafeImg src={b.coverImage} className="thumb" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
                  <div className="grow">
                    <div className="semi small">{b.name}</div>
                    <div className="tiny muted">Add team members & manage access</div>
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

/**
 * #1 — the owner half of the shared shop login.
 *
 * Everything behind this existed and was reachable by nothing: a
 * `business_login_credentials` table with a bcrypt hash, `set_business_login`
 * validating the id shape, `business_login_attempt` with a 5-try/15-minute
 * lockout, `session_hours`, and an approval workflow. Four service methods with
 * zero callers.
 *
 * It's a till login, not a second account: staff sign in to STRYT as themselves
 * first, then use this to open the shop. That's what makes the audit trail
 * ("who was on the console") meaningful, and it's why the copy says "on their
 * own phone" rather than presenting this as a shared account.
 */
function ShopLoginSection({ businessId }: { businessId: string }) {
  const { showToast } = useApp();
  const { data: config, loading, refetch } = useQuery(
    () => businessAccessService.getConfig(businessId),
    [businessId],
    `business-login-config:${businessId}`
  );

  const [open, setOpen] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [requireApproval, setRequireApproval] = useState(true);
  const [sessionHours, setSessionHours] = useState(8);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const seeded = useState({ done: false })[0];

  // Seeded from the saved config the first time it lands. Not a plain
  // `useState(config?.…)` — the query resolves after mount, so the initial
  // values would be the empty ones forever.
  useEffect(() => {
    if (!config || seeded.done) return;
    seeded.done = true;
    setLoginId(config.loginId ?? "");
    setRequireApproval(config.requireApproval);
    setSessionHours(config.sessionHours || 8);
    setEnabled(config.isEnabled);
  }, [config, seeded]);

  async function suggest() {
    setSuggesting(true);
    try {
      const s = await businessAccessService.suggestLogin(businessId);
      if (s) setLoginId(s);
      else showToast("Couldn't suggest one — type your own");
    } finally {
      setSuggesting(false);
    }
  }

  async function save() {
    // The RPC keeps the existing hash when the password is blank, which is what
    // makes "change the session length without retyping the password" work. But
    // there is no existing hash the first time, so a blank one then would create
    // a login nobody can ever use.
    if (!config && !password.trim()) {
      showToast("Set a password for the shop login");
      return;
    }
    if (password.trim() && password.trim().length < 6) {
      showToast("Use at least 6 characters");
      return;
    }
    setSaving(true);
    try {
      await businessAccessService.setLogin(businessId, {
        loginId: loginId.trim(),
        password: password.trim(),
        requireApproval,
        sessionHours,
        enabled,
      });
      haptics.success();
      showToast(config ? "Shop login updated" : "Shop login created");
      setPassword("");
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't save the login");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="col gap-8" style={{ marginTop: 20 }}>
      <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Shop login</span>

      <button
        type="button"
        className="card row gap-12 center-v"
        style={{ padding: 12, textAlign: "left", width: "100%" }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Key size={17} color="var(--brand-700)" />
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="semi small">{config ? config.loginId : "Not set up"}</div>
          <div className="tiny muted">
            {loading
              ? "Loading…"
              : config
                ? `${config.isEnabled ? "On" : "Off"} · ${config.requireApproval ? "you approve each sign-in" : "signs in straight away"} · ${config.sessionHours}h`
                : "One id and password your staff use to open this shop"}
          </div>
        </div>
        <ChevronRight size={17} color="var(--ink-400)" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s ease", flexShrink: 0 }} />
      </button>

      {open && (
        <div className="card col gap-14" style={{ padding: 14 }}>
          <p className="tiny muted" style={{ lineHeight: 1.45, margin: 0 }}>
            Staff sign in to STRYT on their own phone, then use this id and password to
            open {"this shop"}. Their access is scoped to what you allow below and ends
            when the session does — you always see who is on the console.
          </p>

          <div className="field" style={{ marginBottom: 0 }}>
            <label className="row between center-v">
              <span>Login id</span>
              <button type="button" className="tiny semi" style={{ color: "var(--brand-700)", background: "none", border: "none", cursor: "pointer" }} disabled={suggesting} onClick={suggest}>
                {suggesting ? "…" : "Suggest one"}
              </button>
            </label>
            <div className="row gap-8 center-v" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 12px", background: "#fff" }}>
              <input
                className="input"
                style={{ border: "none" }}
                value={loginId}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="e.g. spiceroute-kitchen"
                onChange={(e) => setLoginId(e.target.value.toLowerCase().replace(/\s/g, ""))}
              />
              {config?.loginId && (
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 26, height: 26 }}
                  aria-label="Copy login id"
                  onClick={() => {
                    void navigator.clipboard?.writeText(config.loginId).then(
                      () => showToast("Login id copied"),
                      () => showToast("Couldn't copy")
                    );
                  }}
                >
                  <Copy size={13} />
                </button>
              )}
            </div>
            <span className="tiny muted">4–30 letters, numbers, dot, dash or underscore — or your own mobile number.</span>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>{config ? "New password (leave blank to keep the current one)" : "Password"}</label>
            <input
              className="input"
              type="password"
              value={password}
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder={config ? "••••••••" : "At least 6 characters"}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="tiny muted">Share it with your staff the way you'd share a till PIN. Change it when someone leaves.</span>
          </div>

          <button
            type="button"
            className="row between center-v"
            onClick={() => setRequireApproval((v) => !v)}
            aria-pressed={requireApproval}
            style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
          >
            <span className="col" style={{ gap: 2, minWidth: 0 }}>
              <span className="semi small">Approve each sign-in</span>
              <span className="tiny muted">You get a request to accept before they can open the shop</span>
            </span>
            <Toggle on={requireApproval} />
          </button>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Session length</label>
            <div className="row gap-6" style={{ flexWrap: "wrap" }}>
              {[4, 8, 12, 24, 168].map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`chip ${sessionHours === h ? "active" : ""}`}
                  onClick={() => { haptics.selection(); setSessionHours(h); }}
                >
                  {h < 24 ? `${h} hours` : h === 24 ? "1 day" : "1 week"}
                </button>
              ))}
            </div>
            <span className="tiny muted">How long a sign-in lasts before they have to log in again.</span>
          </div>

          <button
            type="button"
            className="row between center-v"
            onClick={() => setEnabled((v) => !v)}
            aria-pressed={enabled}
            style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
          >
            <span className="col" style={{ gap: 2, minWidth: 0 }}>
              <span className="semi small">Shop login is on</span>
              <span className="tiny muted">Turning this off ends every session opened with it</span>
            </span>
            <Toggle on={enabled} />
          </button>

          <button className="btn btn-primary btn-block" disabled={saving || !loginId.trim()} onClick={save}>
            {saving ? "Saving…" : config ? "Save changes" : "Create shop login"}
          </button>
        </div>
      )}
    </div>
  );
}

function ScopeToggleList({ scopes, onToggle }: { scopes: Scope[]; onToggle: (s: Scope) => void }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {ALL_SCOPES.map((s, idx) => (
        <button
          key={s}
          type="button"
          className="row gap-12 center-v"
          style={{ width: "100%", padding: "12px 14px", textAlign: "left", borderTop: idx ? "1px solid var(--line)" : "none" }}
          onClick={() => onToggle(s)}
        >
          <div className="grow">
            <div className="semi small">{SCOPE_META[s].label}</div>
            <div className="tiny muted">{SCOPE_META[s].text}</div>
          </div>
          <Toggle on={scopes.includes(s)} />
        </button>
      ))}
    </div>
  );
}

function PresetChips({ preset, onPick }: { preset: Preset; onPick: (p: Preset) => void }) {
  return (
    <div className="row gap-6" style={{ flexWrap: "wrap", marginBottom: 10 }}>
      {PRESETS.map((p) => (
        <button key={p.id} type="button" className={`chip ${preset === p.id ? "active" : ""}`} onClick={() => onPick(p.id)}>{p.label}</button>
      ))}
      <button type="button" className={`chip ${preset === "custom" ? "active" : ""}`} onClick={() => onPick("custom")}>Custom</button>
    </div>
  );
}

function ManageSheet({ business, onClose }: { business: Business; onClose: () => void }) {
  const nav = useNavigate();
  const { showToast, businessPasswordIsSet } = useApp();
  const { data: sessions, refetch: refetchSessions } = useQueryWithRealtime(
    () => businessAccessService.ownerSessions(business.id),
    "business_access_sessions",
    [business.id],
    `business_id=eq.${business.id}`,
  );

  const [identifier, setIdentifier] = useState("");
  const [preset, setPreset] = useState<Preset>("front_desk");
  const [scopes, setScopes] = useState<Scope[]>(PRESETS[0].scopes);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScopes, setEditScopes] = useState<Scope[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [revoking, setRevoking] = useState<AccessSession | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const active = (sessions ?? []).filter((s) => s.status === "ACTIVE");
  // #2 — PENDING was in neither list, so a request waiting on the owner was
  // invisible as well as unactionable, and sat there until it expired.
  const pending = (sessions ?? []).filter((s) => s.status === "PENDING");
  const history = (sessions ?? []).filter((s) => ["REVOKED", "EXPIRED", "DENIED"].includes(s.status)).slice(0, 30);

  async function decide(sessionId: string, approve: boolean) {
    setDeciding(sessionId);
    try {
      await businessAccessService.decide(sessionId, approve);
      haptics.success();
      showToast(approve ? "Access approved" : "Request denied");
      refetchSessions();
    } catch (e: any) {
      showToast(e?.message || "Couldn't update the request");
    } finally {
      setDeciding(null);
    }
  }

  function pickPreset(p: Preset) {
    haptics.selection();
    setPreset(p);
    if (p !== "custom") setScopes(PRESETS.find((x) => x.id === p)!.scopes);
  }
  function toggleScope(s: Scope) {
    haptics.selection();
    setScopes((prev) => {
      const next = prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s];
      setPreset(presetForScopes(next));
      return next;
    });
  }

  async function addGrant() {
    if (!identifier.trim()) { showToast("Enter a mobile number, email, or username"); return; }
    if (scopes.length === 0) { showToast("Pick at least one section to grant access to"); return; }
    setAdding(true);
    haptics.medium();
    try {
      const res = preset === "full"
        ? await businessAccessService.grantByIdentifier(business.id, identifier.trim())
        : await businessAccessService.grantTeamMember(business.id, identifier.trim(), scopes);
      haptics.success();
      showToast(`Access granted to ${res.name}`);
      setIdentifier("");
      pickPreset("front_desk");
      refetchSessions();
    } catch (e: any) {
      showToast(e?.message || "Couldn't grant access");
    } finally {
      setAdding(false);
    }
  }

  // #6 — this was a single unconfirmed tap sitting beside the edit pencil.
  // Cutting someone off mid-shift shouldn't be a mis-tap, and there's no undo:
  // re-granting creates a new session rather than restoring the old one.
  async function confirmRevoke() {
    const s = revoking;
    if (!s) return;
    try {
      await businessAccessService.revoke(s.id);
      refetchSessions();
      showToast("Access revoked");
      setRevoking(null);
    } catch (e: any) {
      showToast(e?.message || "Couldn't revoke");
    }
  }

  // #3 — this used to pre-fill a FULL grant with ALL_SCOPES, which reads as
  // "everything is already on, nothing to change". But update_team_member_scopes
  // hard-sets access_level = 'SCOPED', so saving demoted them — and every scope
  // ticked is NOT the same as FULL: has_business_scope short-circuits on FULL
  // for any scope including ones that don't exist yet, and has_business_access
  // gates owner-equivalent surfaces no scope grants. A privilege change must
  // never be the accidental outcome of opening a viewer, so a FULL grant now
  // starts the editor EMPTY and says what's being given up.
  function startEdit(s: AccessSession) {
    haptics.selection();
    setEditingId(s.id);
    setEditScopes(s.accessLevel === "FULL" ? [] : s.scopes);
  }

  async function saveEdit() {
    if (!editingId) return;
    if (editScopes.length === 0) { showToast("Pick at least one section to grant access to"); return; }
    setSavingEdit(true);
    try {
      await businessAccessService.updateTeamMemberScopes(editingId, editScopes);
      haptics.success();
      showToast("Access updated");
      setEditingId(null);
      refetchSessions();
    } catch (e: any) {
      showToast(e?.message || "Couldn't update access");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3 className="bold h2" style={{ marginBottom: 4 }}>{business.name} — team & access</h3>
        <p className="small muted" style={{ marginBottom: 14 }}>Add a team member by their STRYT mobile number, email, or username, and choose what they can manage.</p>

        <div className="field">
          <label>Mobile number, email, or username</label>
          <input
            className="input"
            value={identifier}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="e.g. 98765 43210, name@email.com, or @username"
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addGrant(); }}
          />
          <div className="tiny muted" style={{ marginTop: 4 }}>They must already have a STRYT account.</div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Access</label>
          <PresetChips preset={preset} onPick={pickPreset} />
          <ScopeToggleList scopes={scopes} onToggle={toggleScope} />
        </div>

        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={adding || !identifier.trim() || scopes.length === 0} onClick={addGrant}>
          <UserPlus size={16} /> {adding ? "Adding…" : "Add to team"}
        </button>

        {/* Nudge, not a block — a business password is optional, but if there's
            already a team member/delegate on the roster the owner probably
            wants to know anyone with a grant can currently open this business
            without one. */}
        {active.length > 0 && !businessPasswordIsSet && (
          <div className="card row gap-10 center-v" style={{ marginTop: 16, padding: 12, background: "var(--amber-50)", border: "none" }}>
            <div className="grow">
              <div className="tiny semi">No business password set</div>
              <div className="tiny muted">Anyone with access can open this business without one. Set a password in your profile.</div>
            </div>
            <button className="tiny semi" style={{ color: "var(--brand-700)", flexShrink: 0 }} onClick={() => nav("/settings")}>Set up</button>
          </div>
        )}

        {/* #2 — waiting requests, which used to appear nowhere. */}
        {pending.length > 0 && (
          <div className="col gap-8" style={{ marginTop: 20 }}>
            <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>Waiting for your approval</span>
            {pending.map((s) => (
              <div key={s.id} className="card" style={{ padding: 10, border: "1px solid var(--amber-200)", background: "var(--amber-50)" }}>
                <div className="row gap-10 center-v">
                  <SafeImg src={s.granteeAvatar} variant="avatar" style={{ width: 34, height: 34 }} />
                  <div className="grow">
                    <div className="semi small">{s.granteeName}</div>
                    <div className="tiny muted">
                      Signed in with the shop login · {new Date(s.requestedAt).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                    </div>
                  </div>
                </div>
                <div className="row gap-8" style={{ marginTop: 10 }}>
                  <button className="btn btn-ghost btn-sm grow" disabled={deciding === s.id} onClick={() => decide(s.id, false)}>
                    <X size={14} /> Deny
                  </button>
                  <button className="btn btn-primary btn-sm grow" disabled={deciding === s.id} onClick={() => decide(s.id, true)}>
                    <Check size={14} /> {deciding === s.id ? "…" : "Approve"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ShopLoginSection businessId={business.id} />

        {/* People with access */}
        {active.length > 0 && (
          <div className="col gap-8" style={{ marginTop: 20 }}>
            <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>People with access</span>
            {active.map((s) => (
              <div key={s.id} className="card" style={{ padding: 10 }}>
                <div className="row gap-10 center-v">
                  <SafeImg src={s.granteeAvatar} variant="avatar" style={{ width: 34, height: 34 }} />
                  <div className="grow">
                    <div className="semi small">{s.granteeName}</div>
                    <div className="tiny" style={{ color: s.accessLevel === "FULL" ? "var(--brand-700)" : "var(--green-600)" }}>
                      {scopeSummary(s)}
                      {expiryLabel(s.expiresAt) && <span className="muted"> · {expiryLabel(s.expiresAt)}</span>}
                    </div>
                  </div>
                  <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => (editingId === s.id ? setEditingId(null) : startEdit(s))} aria-label="Edit access">
                    <Pencil size={15} color="var(--ink-500)" />
                  </button>
                  <button className="tiny semi" style={{ color: "var(--red-600)" }} onClick={() => setRevoking(s)}>Revoke</button>
                </div>
                {editingId === s.id && (
                  <div style={{ marginTop: 12 }}>
                    {s.accessLevel === "FULL" && (
                      <div className="card" style={{ padding: 10, marginBottom: 10, background: "var(--amber-50)", border: "1px solid var(--amber-200)" }}>
                        <div className="tiny semi" style={{ color: "var(--amber-800)" }}>This will remove their full access</div>
                        <div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.4 }}>
                          They currently have everything the owner has. Picking sections below limits
                          them to only those, including for anything added later. Leave this without
                          saving to keep their full access.
                        </div>
                      </div>
                    )}
                    <ScopeToggleList
                      scopes={editScopes}
                      onToggle={(sc) => setEditScopes((prev) => (prev.includes(sc) ? prev.filter((x) => x !== sc) : [...prev, sc]))}
                    />
                    <div className="row gap-8" style={{ marginTop: 10 }}>
                      <button className="btn btn-ghost btn-sm grow" onClick={() => setEditingId(null)}>Cancel</button>
                      <button className="btn btn-primary btn-sm grow" disabled={savingEdit || editScopes.length === 0} onClick={saveEdit}>
                        {savingEdit ? "Saving…" : s.accessLevel === "FULL" ? "Limit access" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {revoking && (
          <div className="overlay" style={{ zIndex: 1200 }} onClick={() => setRevoking(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grab" />
              <h3 className="bold h2" style={{ marginBottom: 6 }}>Remove {revoking.granteeName}'s access?</h3>
              <p className="small muted" style={{ marginBottom: "var(--space-md)", lineHeight: 1.5 }}>
                They lose access to {business.name} straight away, including anything they have open
                right now. You can add them again later, but this exact session can't be restored.
              </p>
              <div className="col gap-8">
                <button className="btn btn-block" style={{ background: "var(--red-500)", color: "#fff" }} onClick={confirmRevoke}>
                  Yes, remove access
                </button>
                <button className="btn btn-ghost btn-block" onClick={() => setRevoking(null)}>Keep it</button>
              </div>
            </div>
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
