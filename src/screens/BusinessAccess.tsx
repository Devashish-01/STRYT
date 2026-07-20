import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { Store, Key, ChevronRight, UserPlus, Pencil } from "@/components/Icons";
import { businessService, businessAccessService } from "@/services";
import type { Business } from "@/types";
import type { AccessSession, Scope } from "@/services/marketplace/businessAccessService";
import { SCOPE_LABELS } from "@/services/marketplace/businessAccessService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";
import Toggle from "@/components/Toggle";

const SCOPE_META: Record<Scope, { label: string; text: string }> = {
  appointments: { label: SCOPE_LABELS.appointments, text: "View and manage booking requests" },
  queue: { label: SCOPE_LABELS.queue, text: "Call, serve and manage the walk-in queue" },
  catalog: { label: SCOPE_LABELS.catalog, text: "Products, inventory, portfolio and hours" },
  leads: { label: SCOPE_LABELS.leads, text: "Respond to leads, send quotes, answer questions" },
};
const ALL_SCOPES: Scope[] = ["appointments", "queue", "catalog", "leads"];

type Preset = "front_desk" | "store_manager" | "full" | "custom";
const PRESETS: { id: Exclude<Preset, "custom">; label: string; scopes: Scope[] }[] = [
  { id: "front_desk", label: "Front desk", scopes: ["appointments", "queue"] },
  { id: "store_manager", label: "Store manager", scopes: ["catalog", "leads"] },
  { id: "full", label: "Full access", scopes: ALL_SCOPES },
];

function presetForScopes(scopes: Scope[]): Preset {
  const match = PRESETS.find((p) => p.scopes.length === scopes.length && p.scopes.every((s) => scopes.includes(s)));
  return match?.id ?? "custom";
}

function scopeSummary(s: Pick<AccessSession, "accessLevel" | "scopes">): string {
  if (s.accessLevel === "FULL") return "Full access";
  if (s.scopes.length === 0) return "No access";
  return s.scopes.map((sc) => SCOPE_META[sc].label).join(", ");
}

export default function BusinessAccess() {
  const nav = useNavigate();
  const { user, activeContext, setContext, attemptSwitchContext, showToast } = useApp();

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
                      <div className="tiny" style={{ color: "var(--green-600)" }}>{scopeSummary(s)}</div>
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
  const { showToast } = useApp();
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

  const active = (sessions ?? []).filter((s) => s.status === "ACTIVE");
  const history = (sessions ?? []).filter((s) => ["REVOKED", "EXPIRED", "DENIED"].includes(s.status)).slice(0, 30);

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

  async function revoke(id: string) {
    try { await businessAccessService.revoke(id); refetchSessions(); showToast("Access revoked"); }
    catch (e: any) { showToast(e?.message || "Couldn't revoke"); }
  }

  function startEdit(s: AccessSession) {
    haptics.selection();
    setEditingId(s.id);
    setEditScopes(s.accessLevel === "FULL" ? ALL_SCOPES : s.scopes);
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
                    <div className="tiny" style={{ color: s.accessLevel === "FULL" ? "var(--brand-700)" : "var(--green-600)" }}>{scopeSummary(s)}</div>
                  </div>
                  <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => (editingId === s.id ? setEditingId(null) : startEdit(s))} aria-label="Edit access">
                    <Pencil size={15} color="var(--ink-500)" />
                  </button>
                  <button className="tiny semi" style={{ color: "var(--red-600)" }} onClick={() => revoke(s.id)}>Revoke</button>
                </div>
                {editingId === s.id && (
                  <div style={{ marginTop: 12 }}>
                    <ScopeToggleList
                      scopes={editScopes}
                      onToggle={(sc) => setEditScopes((prev) => (prev.includes(sc) ? prev.filter((x) => x !== sc) : [...prev, sc]))}
                    />
                    <div className="row gap-8" style={{ marginTop: 10 }}>
                      <button className="btn btn-ghost btn-sm grow" onClick={() => setEditingId(null)}>Cancel</button>
                      <button className="btn btn-primary btn-sm grow" disabled={savingEdit || editScopes.length === 0} onClick={saveEdit}>
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
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
