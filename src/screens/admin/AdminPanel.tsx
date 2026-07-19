import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { adminService, type AdminReport, type VerificationQueueItem, type PendingLocationChange } from "@/services/core/adminService";
import { profileControlService, type DeletionRequest } from "@/services/core/profileControlService";
import { notificationService } from "@/services/engagement/notificationService";
import { appealService, type AccountAppeal } from "@/services/core/appealService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { Skeleton, ListSkeleton } from "@/components/states";
import { Shield, Check, X, Store, Briefcase, Tag, Flag, Users, TrendingUp, AlertTriangle, KeyRound, LogOut, Eye, ExternalLink, MapPin } from "@/components/Icons";
import MiniMap from "@/components/MiniMap";
import { useApp } from "@/store";

type Tab = "dashboard" | "queue" | "verification" | "location" | "disputes" | "appeals" | "reports" | "bugs" | "profiles" | "account";
type QueueType = "business" | "provider" | "category";

export default function AdminPanel() {
  const nav = useNavigate();
  const { user, showToast, refreshUser } = useApp();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [claiming, setClaiming] = useState(false);

  const isAdmin =
    (user.roles as string[]).includes("admin") ||
    (user.roles as string[]).includes("super_admin");

  async function claimFirstAdmin() {
    setClaiming(true);
    try {
      await adminService.claimFirstAdmin("admin");
      showToast("Admin access granted — welcome!");
      // Re-fetch the profile so the new admin role flows into the store and the
      // panel re-renders in place — no jarring full-page reload.
      await refreshUser();
    } catch (e: any) {
      showToast(e?.message || "Couldn't claim admin access.");
    } finally {
      setClaiming(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="screen">
        <div className="screen-scroll col center page-pad" style={{ paddingTop: 100, textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: "var(--ink-200)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={40} color="var(--red-600)" />
          </div>
          <h1 className="bold h1" style={{ marginTop: 20 }}>Access Denied</h1>
          <p className="muted small" style={{ marginTop: 8 }}>Only verified administrators can access this console.</p>

          <div className="col gap-8" style={{ marginTop: 24, width: "100%", maxWidth: 280 }}>
            <button className="btn btn-primary" onClick={() => nav("/admin/login")}>
              Sign in as admin
            </button>
            <button className="btn btn-outline" disabled={claiming} onClick={claimFirstAdmin}>
              {claiming ? "Claiming…" : "Claim first-admin access (one-time)"}
            </button>
            <p className="tiny muted" style={{ lineHeight: 1.5 }}>
              "Claim first-admin access" only works once, on whichever account uses it first — it's rejected the moment any admin already exists.
            </p>
          </div>

          <button className="btn btn-dark" style={{ marginTop: 16, width: "100%", maxWidth: 200 }} onClick={() => nav("/home")}>Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="Admin Console" subtitle="Moderation & ops" onBack={() => nav("/profile")} />
      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "#fff", overflowX: "auto" }}>
        {([["dashboard", "Overview"], ["queue", "Queue"], ["verification", "Verification"], ["location", "Location changes"], ["disputes", "Disputes"], ["appeals", "Appeals"], ["reports", "Reports"], ["bugs", "Bugs"], ["profiles", "Profiles"], ["account", "Account"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className="semi" style={{ flex: "1 0 auto", padding: "12px 14px", fontSize: 13.5, color: tab === t ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>{label}</button>
        ))}
      </div>
      <div className="screen-scroll">
        {tab === "dashboard" && <AdminDashboard />}
        {tab === "queue" && <AdminQueue />}
        {tab === "verification" && <AdminVerificationQueue />}
        {tab === "location" && <AdminLocationChanges />}
        {tab === "disputes" && <AdminDisputes />}
        {tab === "appeals" && <AdminAppeals />}
        {tab === "reports" && <AdminReports />}
        {tab === "bugs" && <AdminBugs />}
        {tab === "profiles" && <AdminProfiles />}
        {tab === "account" && <AdminAccount />}
      </div>
    </div>
  );
}

function AdminAccount() {
  const nav = useNavigate();
  const { showToast, signOut } = useApp();
  const [newId, setNewId] = useState("");
  const [savingId, setSavingId] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveId() {
    if (!newId.trim()) return;
    setSavingId(true);
    try {
      await adminService.setAdminLoginId(newId.trim());
      showToast("Admin ID updated");
      setNewId("");
    } catch (e: any) {
      showToast(e?.message || "Couldn't update admin ID.");
    } finally {
      setSavingId(false);
    }
  }

  async function savePassword() {
    if (newPassword.length < 6) { showToast("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { showToast("Passwords don't match."); return; }
    setSavingPassword(true);
    try {
      await adminService.changeAdminPassword(newPassword);
      showToast("Password updated");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      showToast(e?.message || "Couldn't update password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="page-pad col gap-16">
      <div className="card">
        <div className="row gap-8 center-v" style={{ marginBottom: 4 }}>
          <KeyRound size={16} color="var(--brand-700)" />
          <span className="semi small">Change admin ID</span>
        </div>
        <p className="tiny muted" style={{ marginBottom: 10 }}>This is the ID typed on the admin sign-in screen — not visible to customers.</p>
        <div className="row gap-8">
          <input className="input grow" placeholder="New admin ID" value={newId} onChange={(e) => setNewId(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={!newId.trim() || savingId} onClick={saveId}>
            {savingId ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row gap-8 center-v" style={{ marginBottom: 4 }}>
          <KeyRound size={16} color="var(--brand-700)" />
          <span className="semi small">Change password</span>
        </div>
        <p className="tiny muted" style={{ marginBottom: 10 }}>Minimum 6 characters.</p>
        <div className="col gap-8">
          <input type="password" className="input" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <input type="password" className="input" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          <button className="btn btn-primary btn-sm btn-block" disabled={!newPassword || savingPassword} onClick={savePassword}>
            {savingPassword ? "Saving…" : "Update password"}
          </button>
        </div>
      </div>

      <button
        className="btn btn-outline btn-block row gap-8 center"
        style={{ color: "var(--red-600)", borderColor: "var(--red-100)" }}
        onClick={() => { signOut(); nav("/admin/login"); }}
      >
        <LogOut size={16} /> Sign out of admin
      </button>
    </div>
  );
}

function AdminDashboard() {
  const { data, loading } = useQuery(() => adminService.overview(), []);
  if (loading) return <div className="page-pad"><Skeleton h={120} /></div>;
  const d = data!;
  const cards = [
    { label: "Businesses", value: d.businesses, icon: Store, color: "var(--orange-500)" },
    { label: "Providers", value: d.providers, icon: Briefcase, color: "var(--green-500)" },
    { label: "Open requests", value: d.openRequests, icon: Users, color: "var(--brand-700)" },
    { label: "Pending review", value: d.pendingReview, icon: Flag, color: "var(--red-500)" },
  ];
  return (
    <div className="page-pad col gap-14">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="card col" style={{ padding: 14, gap: 6 }}>
              <Icon size={20} color={c.color} />
              <span className="bold" style={{ fontSize: 24 }}>{c.value}</span>
              <span className="tiny muted">{c.label}</span>
            </div>
          );
        })}
      </div>
      <div className="card row" style={{ padding: 14 }}>
        <Stat label="DAU" value={typeof d.dau === "number" ? d.dau.toLocaleString() : d.dau} />
        <Sep />
        <Stat label="MAU" value={typeof d.mau === "number" ? d.mau.toLocaleString() : d.mau} />
        <Sep />
        <Stat label="Push delivery" value={typeof d.pushDelivery === "number" ? `${d.pushDelivery}%` : d.pushDelivery} />
      </div>
      <div className="card row gap-10" style={{ padding: 14 }}>
        <TrendingUp size={18} color="var(--green-500)" />
        <span className="small semi grow">New today</span>
        <span className="bold">{d.newToday}</span>
      </div>
    </div>
  );
}

function AdminQueue() {
  const [type, setType] = useState<QueueType>("business");
  const queueTable = type === "business" ? "businesses" : type === "provider" ? "providers" : "categories";
  const { data, loading, refetch } = useQueryWithRealtime<any[]>(() => adminService.queue(type) as any, queueTable, [type], "status=eq.PENDING");
  const { showToast } = useApp();
  const [done, setDone] = useState<string[]>([]);

  const tabs: [QueueType, string][] = [["business", "Shops"], ["provider", "Providers"], ["category", "Categories"]];

  async function act(item: any, approve: boolean) {
    if (approve) await adminService.approve(item.kind, item.id);
    else await adminService.reject(item.kind, item.id, "Did not meet guidelines");
    setDone((d) => [...d, item.id]);
    showToast(approve ? "Approved ✓" : "Rejected");
  }

  return (
    <>
      <div className="hscroll" style={{ paddingTop: 12 }}>
        {tabs.map(([t, label]) => <button key={t} className={`chip ${type === t ? "active" : ""}`} onClick={() => setType(t)}>{label}</button>)}
      </div>
      {loading && <ListSkeleton count={3} />}
      {data && (
        <div className="page-pad col gap-12">
          {data.filter((i) => !done.includes(i.id)).length === 0 && <EmptyState emoji="✅" title="Queue clear" text="Nothing pending review." />}
          {data.filter((i) => !done.includes(i.id)).map((item) => {
            const Icon = type === "business" ? Store : type === "provider" ? Briefcase : Tag;
            return (
              <div key={item.id} className="card">
                <div className="row gap-12">
                  {item.image ? <img src={item.image} className="thumb" style={{ width: 48, height: 48, borderRadius: 12 }} /> : <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={20} color="var(--brand-600)" /></div>}
                  <div className="grow"><div className="semi small">{item.name}</div><div className="tiny muted">{item.sub}</div></div>
                </div>
                <div className="row gap-8" style={{ marginTop: 12 }}>
                  <button className="btn btn-outline grow btn-sm" onClick={() => act(item, false)}><X size={15} /> Reject</button>
                  <button className="btn btn-green grow btn-sm" onClick={() => act(item, true)}><Check size={15} /> Approve</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// Manual STRYT Verified review queue. Approve/reject/suspend all go through
// adminService.reviewVerification -> the verification-review Edge Function —
// no code path here can grant the badge directly; a DB trigger blocks any
// write that isn't from that service, so this UI only ever *requests* a
// decision, it never makes one client-side.
function AdminVerificationQueue() {
  const { showToast } = useApp();
  const { data, loading, refetch } = useQuery(() => adminService.verificationQueue(), []);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [docsById, setDocsById] = useState<Record<string, string[]>>({});
  const [loadingDocsKey, setLoadingDocsKey] = useState<string | null>(null);
  const [actingKey, setActingKey] = useState<string | null>(null);

  function keyOf(item: VerificationQueueItem) {
    return `${item.targetType}:${item.targetId}`;
  }

  async function loadDocs(item: VerificationQueueItem) {
    const key = keyOf(item);
    if (docsById[key]) return;
    setLoadingDocsKey(key);
    try {
      const urls = await adminService.viewVerificationDocs(item.targetType, item.targetId);
      setDocsById((m) => ({ ...m, [key]: urls }));
    } catch (e: any) {
      showToast(e?.message || "Couldn't load documents");
    } finally {
      setLoadingDocsKey(null);
    }
  }

  async function decide(item: VerificationQueueItem, decision: "APPROVE" | "REJECT" | "SUSPEND") {
    const key = keyOf(item);
    const reason = (reasonById[key] ?? "").trim();
    if (decision !== "APPROVE" && !reason) {
      showToast("Add a reason before rejecting or suspending");
      return;
    }
    setActingKey(key);
    try {
      await adminService.reviewVerification(item.targetType, item.targetId, decision, reason || undefined);
      showToast(decision === "APPROVE" ? "Approved ✓" : decision === "REJECT" ? "Rejected" : "Suspended");
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't submit decision");
    } finally {
      setActingKey(null);
    }
  }

  if (loading) return <div className="page-pad"><ListSkeleton count={3} /></div>;
  const items = data ?? [];

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
      {items.length === 0 && <EmptyState emoji="🛡️" title="Nothing pending" text="No businesses or providers are waiting on manual verification." />}
      {items.map((item) => {
        const key = keyOf(item);
        const docs = docsById[key];
        const busy = actingKey === key;
        return (
          <div key={key} className="card">
            <div className="row between" style={{ marginBottom: 6 }}>
              <span className="badge badge-purple">
                {item.targetType === "BUSINESS" ? <Store size={11} /> : <Briefcase size={11} />} {item.targetType}
              </span>
              <span className="tiny muted">{new Date(item.submittedAt).toLocaleDateString()}</span>
            </div>
            <div className="semi small">{item.name}</div>
            <div className="tiny muted" style={{ marginBottom: 10 }}>
              Owner: {item.ownerName} • {item.documentCount} document{item.documentCount === 1 ? "" : "s"}
            </div>

            {docs ? (
              <div className="row wrap gap-8" style={{ marginBottom: 10 }}>
                {docs.length === 0 && <span className="tiny muted">No documents found.</span>}
                {docs.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="chip">
                    <ExternalLink size={12} /> Document {i + 1}
                  </a>
                ))}
              </div>
            ) : (
              <button className="btn btn-outline btn-sm" style={{ marginBottom: 10 }} disabled={loadingDocsKey === key} onClick={() => loadDocs(item)}>
                <Eye size={14} /> {loadingDocsKey === key ? "Loading..." : "View documents"}
              </button>
            )}

            <input
              className="input"
              placeholder="Reason (required to reject/suspend)"
              style={{ fontSize: 12.5, marginBottom: 8 }}
              value={reasonById[key] ?? ""}
              onChange={(e) => setReasonById((m) => ({ ...m, [key]: e.target.value }))}
            />
            <div className="row gap-8">
              <button className="btn btn-outline grow btn-sm" style={{ color: "var(--red-600)" }} disabled={busy} onClick={() => decide(item, "REJECT")}>
                <X size={14} /> Reject
              </button>
              <button className="btn btn-sm grow" style={{ background: "var(--red-700)", color: "#fff" }} disabled={busy} onClick={() => decide(item, "SUSPEND")}>
                <AlertTriangle size={14} /> Suspend
              </button>
              <button className="btn btn-green grow btn-sm" disabled={busy} onClick={() => decide(item, "APPROVE")}>
                <Check size={14} /> Approve
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fmtCoord(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "—";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// Business location change review. Owners can only *request* a move
// (businessService.requestLocationChange writes staging columns); the live
// location and the geom discovery reads never change until an admin approves
// here — approveLocationChange promotes the staged coords onto the live
// lat/lng (geom auto-syncs), rejectLocationChange discards them.
function AdminLocationChanges() {
  const { showToast } = useApp();
  const { data, loading, refetch } = useQuery(() => adminService.pendingLocationChanges(), []);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);

  async function decide(item: PendingLocationChange, approve: boolean) {
    setActingId(item.id);
    try {
      if (approve) {
        await adminService.approveLocationChange(item.id);
        showToast("Location approved — now live ✓");
      } else {
        await adminService.rejectLocationChange(item.id, (reasonById[item.id] ?? "").trim() || undefined);
        showToast("Location change rejected");
      }
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't update the location change.");
    } finally {
      setActingId(null);
    }
  }

  if (loading) return <div className="page-pad"><ListSkeleton count={3} /></div>;
  const items = data ?? [];

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
      {items.length === 0 && <EmptyState emoji="📍" title="No location changes" text="No businesses are waiting on a location review." />}
      {items.map((item) => {
        const busy = actingId === item.id;
        return (
          <div key={item.id} className="card">
            <div className="row gap-12" style={{ marginBottom: 10 }}>
              {item.coverImage
                ? <img src={item.coverImage} className="thumb" style={{ width: 44, height: 44, borderRadius: 10 }} />
                : <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center" }}><Store size={18} color="var(--brand-600)" /></div>}
              <div className="grow">
                <div className="semi small">{item.name}</div>
                <div className="tiny muted row gap-4" style={{ alignItems: "center" }}><MapPin size={11} /> Location change requested</div>
              </div>
            </div>

            <div className="row gap-10" style={{ marginBottom: 10 }}>
              <div className="grow col gap-4">
                <span className="tiny semi muted">CURRENT</span>
                {item.lat != null && item.lng != null
                  ? <MiniMap lat={item.lat} lng={item.lng} pinColor="var(--ink-400)" height={120} />
                  : <div className="tiny muted" style={{ padding: "8px 0" }}>Not set</div>}
                <span className="tiny muted">{fmtCoord(item.lat, item.lng)}</span>
              </div>
              <div className="grow col gap-4">
                <span className="tiny semi" style={{ color: "var(--orange-500)" }}>REQUESTED</span>
                {item.pendingLat != null && item.pendingLng != null
                  ? <MiniMap lat={item.pendingLat} lng={item.pendingLng} pinColor="var(--orange-500)" height={120} />
                  : <div className="tiny muted" style={{ padding: "8px 0" }}>Not set</div>}
                <span className="tiny muted">{fmtCoord(item.pendingLat, item.pendingLng)}</span>
              </div>
            </div>

            <input
              className="input"
              placeholder="Reason (optional, shown to owner if rejected)"
              style={{ fontSize: 12.5, marginBottom: 8 }}
              value={reasonById[item.id] ?? ""}
              onChange={(e) => setReasonById((m) => ({ ...m, [item.id]: e.target.value }))}
            />
            <div className="row gap-8">
              <button className="btn btn-outline grow btn-sm" style={{ color: "var(--red-600)" }} disabled={busy} onClick={() => decide(item, false)}>
                <X size={14} /> Reject
              </button>
              <button className="btn btn-green grow btn-sm" disabled={busy} onClick={() => decide(item, true)}>
                <Check size={14} /> Approve
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdminReports() {
  const { data, loading } = useQueryWithRealtime<AdminReport[]>(() => adminService.reports() as any, "reports", []);
  const { showToast } = useApp();
  const [resolved, setResolved] = useState<Record<string, string>>({});

  async function resolve(id: string, status: string) {
    await adminService.resolveReport(id, status);
    setResolved((r) => ({ ...r, [id]: status }));
    showToast(status === "ACTION_TAKEN" ? "Action taken" : "Dismissed");
  }

  return (
    <>
      {loading && <ListSkeleton count={3} />}
      {data && (
        <div className="page-pad col gap-12">
          {data.map((r) => {
            const status = resolved[r.id] ?? r.status;
            return (
              <div key={r.id} className="card">
                <div className="row between">
                  <span className="badge badge-red"><Flag size={11} /> {r.reason}</span>
                  <span className="tiny muted">{r.time}</span>
                </div>
                <div className="semi small" style={{ marginTop: 8 }}>{r.targetName}</div>
                <div className="tiny muted">{r.targetType} • reported by {r.reporter}</div>
                {status === "OPEN" || status === "REVIEWING" ? (
                  <div className="row gap-8" style={{ marginTop: 12 }}>
                    <button className="btn btn-outline grow btn-sm" onClick={() => resolve(r.id, "DISMISSED")}>Dismiss</button>
                    <button className="btn btn-sm grow" style={{ background: "var(--red-500)", color: "#fff" }} onClick={() => resolve(r.id, "ACTION_TAKEN")}>Take action</button>
                  </div>
                ) : (
                  <span className={`badge ${status === "ACTION_TAKEN" ? "badge-red" : "badge-gray"}`} style={{ marginTop: 10 }}>{status === "ACTION_TAKEN" ? "Action taken" : "Dismissed"}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const BUG_ROLE_META: Record<string, { label: string; color: string }> = {
  CUSTOMER: { label: "Customer", color: "var(--brand-600)" },
  BUSINESS: { label: "Business", color: "var(--orange-500)" },
  PROVIDER: { label: "Provider", color: "var(--green-500)" },
};

function AdminBugs() {
  const { data, loading, refetch } = useQueryWithRealtime(() => adminService.bugReports(), "bug_reports", []);
  const { showToast } = useApp();
  const [roleFilter, setRoleFilter] = useState<"ALL" | "CUSTOMER" | "BUSINESS" | "PROVIDER">("ALL");

  async function resolve(id: string, status: "RESOLVED" | "DISMISSED") {
    await adminService.resolveBugReport(id, status);
    showToast(status === "RESOLVED" ? "Marked resolved" : "Dismissed");
    refetch();
  }

  const items = (data ?? []).filter((b) => roleFilter === "ALL" || b.reporterRole === roleFilter);
  const counts = {
    ALL: data?.length ?? 0,
    CUSTOMER: (data ?? []).filter((b) => b.reporterRole === "CUSTOMER").length,
    BUSINESS: (data ?? []).filter((b) => b.reporterRole === "BUSINESS").length,
    PROVIDER: (data ?? []).filter((b) => b.reporterRole === "PROVIDER").length,
  };

  return (
    <div className="page-pad col gap-12">
      <div className="row gap-8" style={{ overflowX: "auto", paddingBottom: 2 }}>
        {(["ALL", "CUSTOMER", "BUSINESS", "PROVIDER"] as const).map((r) => (
          <button key={r} className={`chip ${roleFilter === r ? "active" : ""}`} onClick={() => setRoleFilter(r)}>
            {r === "ALL" ? "All" : BUG_ROLE_META[r].label} ({counts[r]})
          </button>
        ))}
      </div>

      {loading && <ListSkeleton count={3} />}
      {!loading && items.length === 0 && <EmptyState emoji="🐞" title="No bug reports" text="Nothing reported in this category yet." />}
      {items.map((b) => {
        const roleMeta = BUG_ROLE_META[b.reporterRole];
        return (
          <div key={b.id} className="card">
            <div className="row between">
              <span className="badge" style={{ background: `${roleMeta.color}1a`, color: roleMeta.color }}>{roleMeta.label}</span>
              <span className="tiny muted">{b.time}</span>
            </div>
            <p className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>{b.description}</p>
            <div className="tiny muted" style={{ marginTop: 6 }}>Reported by {b.reporterName}</div>
            {b.status === "OPEN" || b.status === "REVIEWING" ? (
              <div className="row gap-8" style={{ marginTop: 12 }}>
                <button className="btn btn-outline grow btn-sm" onClick={() => resolve(b.id, "DISMISSED")}>Dismiss</button>
                <button className="btn btn-sm grow" style={{ background: "var(--green-500)", color: "#fff" }} onClick={() => resolve(b.id, "RESOLVED")}>Mark resolved</button>
              </div>
            ) : (
              <span className={`badge ${b.status === "RESOLVED" ? "badge-green" : "badge-gray"}`} style={{ marginTop: 10 }}>
                {b.status === "RESOLVED" ? "Resolved" : "Dismissed"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AdminDisputes() {
  const { showToast } = useApp();
  const { data, loading, refetch } = useQueryWithRealtime<any[]>(async () => {
    const sb = (await import("@/lib/supabaseClient")).getSupabase();
    const { data, error } = await sb
      .from("agreements")
      .select("id, request_title, status, dispute_reason, created_at, requester:users!requester_user_id(name), responder:users!responder_user_id(name)")
      .eq("status", "DISPUTED")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }, "agreements", [], "status=eq.DISPUTED");

  async function resolve(agreementId: string, newStatus: "COMPLETED" | "CANCELLED") {
    try {
      await adminService.resolveAgreementDispute(agreementId, newStatus);
      showToast(newStatus === "COMPLETED"
        ? "Resolved — marked complete, escrow released"
        : "Resolved — cancelled, escrow refunded");
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't resolve the dispute.");
    }
  }

  if (loading) return <div className="page-pad"><ListSkeleton count={3} /></div>;
  const items = data ?? [];

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
      {items.length === 0 && <EmptyState emoji="⚖️" title="No active disputes" text="All disputes have been resolved." />}
      {items.map((ag: any) => (
        <div key={ag.id} className="card" style={{ border: "1px solid var(--red-100)" }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="badge" style={{ background: "var(--red-100)", color: "var(--red-600)" }}>
              <Flag size={11} /> Disputed
            </span>
            <span className="tiny muted">{new Date(ag.created_at).toLocaleDateString()}</span>
          </div>
          <div className="semi small" style={{ marginBottom: 4 }}>{ag.request_title ?? "Agreement"}</div>
          <div className="tiny muted" style={{ marginBottom: 6 }}>
            {ag.requester?.name ?? "?"} ↔ {ag.responder?.name ?? "?"}
          </div>
          {ag.dispute_reason && (
            <div className="tiny" style={{ color: "var(--orange-500)", marginBottom: 10, lineHeight: 1.4, background: "var(--red-50)", padding: "6px 8px", borderRadius: 6 }}>
              "{ag.dispute_reason}"
            </div>
          )}
          <div className="row gap-8">
            <button className="btn btn-outline grow btn-sm" style={{ color: "var(--red-600)" }}
              onClick={() => resolve(ag.id, "CANCELLED")}>
              <X size={14} /> Cancel job
            </button>
            <button className="btn btn-green grow btn-sm"
              onClick={() => resolve(ag.id, "COMPLETED")}>
              <Check size={14} /> Mark complete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminAppeals() {
  const { showToast } = useApp();
  const { data, loading, refetch } = useQuery(() => appealService.pending(), []);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function resolve(appeal: AccountAppeal, approve: boolean) {
    setResolvingId(appeal.id);
    try {
      await appealService.resolve(appeal, approve, noteById[appeal.id] ?? "");
      showToast(approve ? "Appeal approved — account reactivated" : "Appeal rejected");
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't resolve appeal.");
    } finally {
      setResolvingId(null);
    }
  }

  if (loading) return <div className="page-pad"><ListSkeleton count={3} /></div>;
  const items = data ?? [];

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
      {items.length === 0 && <EmptyState emoji="📮" title="No pending appeals" text="Suspended businesses/providers can raise a review request from their dashboard." />}
      {items.map((a) => (
        <div key={a.id} className="card" style={{ border: "1px solid var(--red-100)" }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="badge" style={{ background: "var(--red-100)", color: "var(--red-600)" }}>
              {a.entityType === "BUSINESS" ? <Store size={11} /> : <Briefcase size={11} />} {a.entityType}
            </span>
            <span className="tiny muted">{new Date(a.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="tiny" style={{ marginBottom: 10, lineHeight: 1.4, background: "var(--red-50)", padding: "6px 8px", borderRadius: 6, color: "var(--red-600)" }}>
            "{a.reason}"
          </div>
          <input
            className="input"
            placeholder="Admin note (optional)"
            style={{ fontSize: 12.5, marginBottom: 8 }}
            value={noteById[a.id] ?? ""}
            onChange={(e) => setNoteById((m) => ({ ...m, [a.id]: e.target.value }))}
          />
          <div className="row gap-8">
            <button
              className="btn btn-outline grow btn-sm"
              style={{ color: "var(--red-600)" }}
              disabled={resolvingId === a.id}
              onClick={() => resolve(a, false)}
            >
              <X size={14} /> Reject
            </button>
            <button
              className="btn btn-green grow btn-sm"
              disabled={resolvingId === a.id}
              onClick={() => resolve(a, true)}
            >
              <Check size={14} /> Approve & reactivate
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="grow col center" style={{ gap: 2 }}><span className="bold">{value}</span><span className="tiny muted">{label}</span></div>;
}
function Sep() { return <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />; }

function AdminProfiles() {
  const { showToast, user: currentAdmin } = useApp();
  const [subTab, setSubTab] = useState<"directory" | "requests">("directory");
  const [searchType, setSearchType] = useState<"CUSTOMER" | "BUSINESS" | "PROVIDER">("CUSTOMER");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  // Deletion Queue
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Deletion Modal
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [profileType, setProfileType] = useState<"CUSTOMER" | "BUSINESS" | "PROVIDER">("CUSTOMER");
  const [deleteReason, setDeleteReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const isSuperAdmin = (currentAdmin.roles as string[]).includes("super_admin");

  useEffect(() => {
    if (subTab === "requests") {
      void loadRequests();
    } else if (subTab === "directory" && !searchQuery.trim()) {
      void loadRecent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, searchType]);

  // Directory defaults to the most recent signups so an admin can browse and
  // spot someone (e.g. a Google sign-in with no phone on file) without
  // already knowing a search term that matches them.
  async function loadRecent() {
    setLoading(true);
    try {
      const sb = (await import("@/lib/supabaseClient")).getSupabase();
      if (searchType === "CUSTOMER") {
        // admin_recent_users() is a SECURITY DEFINER RPC that checks the
        // caller is actually an admin internally — customer PII columns
        // aren't selectable via a plain query anymore (ISS-009).
        const { data, error } = await sb.rpc("admin_recent_users");
        if (error) throw error;
        setResults(data || []);
      } else if (searchType === "BUSINESS") {
        const { data, error } = await sb.from("businesses").select("*").order("created_at", { ascending: false }).limit(30);
        if (error) throw error;
        setResults(data || []);
      } else if (searchType === "PROVIDER") {
        const { data, error } = await sb.from("providers").select("*").order("created_at", { ascending: false }).limit(30);
        if (error) throw error;
        setResults(data || []);
      }
    } catch (e: any) {
      showToast("Couldn't load recent signups: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRequests() {
    setLoadingRequests(true);
    try {
      const data = await profileControlService.getDeletionRequests();
      setRequests(data);
    } catch (e: any) {
      showToast("Failed to load requests: " + e.message);
    } finally {
      setLoadingRequests(false);
    }
  }

  async function runSearch() {
    if (!searchQuery.trim()) {
      void loadRecent();
      return;
    }
    setLoading(true);
    try {
      const sb = (await import("@/lib/supabaseClient")).getSupabase();
      const term = `%${searchQuery.trim()}%`;
      if (searchType === "CUSTOMER") {
        // admin_search_users() is a SECURITY DEFINER RPC — checks the caller
        // is actually an admin internally, and matches name/phone/email so
        // Google sign-ins (no phone on file) are findable (ISS-009 / ISS-F14).
        const { data, error } = await sb.rpc("admin_search_users", { term: searchQuery.trim() });
        if (error) throw error;
        setResults(data || []);
      } else if (searchType === "BUSINESS") {
        const { data, error } = await sb.from("businesses").select("*").ilike("name", term).limit(20);
        if (error) throw error;
        setResults(data || []);
      } else if (searchType === "PROVIDER") {
        const { data, error } = await sb.from("providers").select("*").ilike("display_name", term).limit(20);
        if (error) throw error;
        setResults(data || []);
      }
    } catch (e: any) {
      showToast("Search failed: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleSuspension(item: any, isSuspended: boolean) {
    try {
      const sb = (await import("@/lib/supabaseClient")).getSupabase();
      const newStatus = isSuspended ? "SUSPENDED" : "ACTIVE";
      const table = searchType === "BUSINESS" ? "businesses" : "providers";
      const { error } = await sb.from(table).update({ status: newStatus }).eq("id", item.id);
      if (error) throw error;
      showToast(isSuspended ? "Profile suspended" : "Profile activated");

      const ownerId = item.owner_user_id as string | undefined;
      const entityName = item.name || item.display_name || "Your listing";
      if (ownerId) {
        const manageLink = searchType === "BUSINESS" ? `/business/${item.id}/manage` : `/provider/${item.id}/manage`;
        void notificationService.send(
          ownerId,
          isSuspended ? "Account suspended" : "Account reactivated",
          isSuspended
            ? `${entityName} has been suspended by STRYT admin. You can raise a review request from your dashboard.`
            : `${entityName} is active again — you're back on STRYT.`,
          manageLink,
          "SYSTEM"
        );
      }
      void runSearch();
    } catch (e: any) {
      showToast("Failed to update status: " + e.message);
    }
  }

  async function handleDelete() {
    if (!selectedProfile) return;
    if (!deleteReason.trim()) {
      showToast("Please provide a reason");
      return;
    }
    const name = selectedProfile.name || selectedProfile.display_name || "User";
    const expected = `DELETE ${name}`;
    if (confirmText !== expected) {
      showToast(`Confirmation text must match: "${expected}"`);
      return;
    }

    setDeleting(true);
    try {
      await profileControlService.adminDeleteProfile(
        profileType,
        selectedProfile.id,
        deleteReason,
        confirmText
      );
      showToast("Profile permanently deleted");
      setSelectedProfile(null);
      setDeleteReason("");
      setConfirmText("");
      void runSearch();
      if (subTab === "requests") void loadRequests();
    } catch (err: any) {
      showToast(err.message || "Deletion failed");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRejectRequest(requestId: string) {
    try {
      await profileControlService.updateRequestStatus(requestId, "REJECTED");
      showToast("Request rejected");
      void loadRequests();
    } catch (e: any) {
      showToast("Failed to reject: " + e.message);
    }
  }

  return (
    <div className="col gap-12" style={{ paddingTop: 12 }}>
      {/* Sub tabs */}
      <div className="row gap-8 page-pad" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
        <button
          className={`chip ${subTab === "directory" ? "active" : ""}`}
          onClick={() => setSubTab("directory")}
        >
          Directory Search
        </button>
        <button
          className={`chip ${subTab === "requests" ? "active" : ""}`}
          onClick={() => setSubTab("requests")}
        >
          Deletion Queue
        </button>
      </div>

      {subTab === "directory" && (
        <div className="page-pad col gap-12">
          {/* Controls */}
          <div className="card col gap-10" style={{ padding: 12 }}>
            <div className="row gap-8">
              <select
                className="input"
                value={searchType}
                onChange={(e) => setSearchType(e.target.value as any)}
                style={{ width: 110, fontSize: 13 }}
              >
                <option value="CUSTOMER">Customer</option>
                <option value="BUSINESS">Business</option>
                <option value="PROVIDER">Provider</option>
              </select>
              <input
                className="input grow"
                placeholder={searchType === "CUSTOMER" ? "Name, phone, or email... (blank = recent)" : "Search by name..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void runSearch()}
                style={{ fontSize: 13 }}
              />
              <button className="btn btn-dark btn-sm" onClick={runSearch}>Search</button>
            </div>
          </div>

          {loading ? (
            <ListSkeleton count={2} />
          ) : results.length === 0 ? (
            <EmptyState emoji="🔍" title="No profiles found" text="Try a different name, phone number, or email." />
          ) : (
            <div className="col gap-10">
              {results.map((item) => {
                const name = item.name || item.display_name || "Unknown";
                const isSuspended = item.status === "SUSPENDED";
                const isDeleted = item.deleted_at || item.customer_deleted_at;
                const isEnabled = item.customer_enabled !== false && item.owner_enabled !== false;
                
                return (
                  <div key={item.id} className="card col gap-10" style={{ padding: 12, opacity: isDeleted ? 0.6 : 1 }}>
                    <div className="row between align-start">
                      <div>
                        <div className="semi small row gap-6 align-center">
                          {name}
                          {isDeleted && <span className="badge badge-red">Deleted</span>}
                          {isSuspended && <span className="badge badge-purple">Suspended</span>}
                          {!isEnabled && !isDeleted && <span className="badge badge-gray">Hidden</span>}
                        </div>
                        <div className="tiny muted" style={{ marginTop: 2 }}>ID: {item.id}</div>
                        {searchType === "CUSTOMER" && (
                          <div className="tiny muted" style={{ marginTop: 2 }}>
                            {item.phone || "No phone (Google sign-in)"}{item.email ? ` · ${item.email}` : ""}
                          </div>
                        )}
                      </div>
                      
                      <div className="row gap-6">
                        {(searchType === "BUSINESS" || searchType === "PROVIDER") && !isDeleted && (
                          <button
                            className={`btn btn-sm ${isSuspended ? "btn-outline" : "btn-outline-danger"}`}
                            onClick={() => handleToggleSuspension(item, !isSuspended)}
                            style={{ fontSize: 11, padding: "4px 8px" }}
                          >
                            {isSuspended ? "Activate" : "Suspend"}
                          </button>
                        )}
                        <button
                          className="btn btn-red btn-sm"
                          onClick={() => {
                            setProfileType(searchType);
                            setSelectedProfile(item);
                          }}
                          disabled={searchType === "CUSTOMER" && !isSuperAdmin}
                          style={{ fontSize: 11, padding: "4px 8px" }}
                          title={searchType === "CUSTOMER" && !isSuperAdmin ? "Requires Super Admin" : ""}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === "requests" && (
        <div className="page-pad col gap-12">
          {loadingRequests ? (
            <ListSkeleton count={2} />
          ) : requests.length === 0 ? (
            <EmptyState emoji="✅" title="Queue clear" text="No active deletion requests." />
          ) : (
            <div className="col gap-10">
              {requests.map((req) => {
                const reqDate = new Date(req.createdAt);
                const purgeDate = new Date(reqDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                const daysLeft = Math.max(0, Math.ceil((purgeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                const isReadyToPurge = daysLeft <= 0;

                return (
                  <div key={req.id} className="card col gap-8" style={{ padding: 12 }}>
                    <div className="row between align-start">
                      <div>
                        <div className="semi small">{req.user?.name || "Unknown User"}</div>
                        <div className="tiny muted">Target: {req.targetType} {req.targetId ? `(${req.targetId})` : ""}</div>
                        <div className="tiny muted">Submitted: {reqDate.toLocaleDateString()}</div>
                      </div>
                      <div className="col align-end gap-4">
                        <span className={`badge ${req.status === "PENDING" ? "badge-gray" : req.status === "COMPLETED" ? "badge-green" : "badge-red"}`}>
                          {req.status}
                        </span>
                        {req.status === "PENDING" && (
                          isReadyToPurge ? (
                            <span style={{ background: "var(--red-100)", color: "var(--red-600)", padding: "2px 6px", borderRadius: 6, fontWeight: 700, fontSize: 10.5 }}>
                              Ready to Purge
                            </span>
                          ) : (
                            <span style={{ background: "var(--amber-100)", color: "var(--amber-700)", padding: "2px 6px", borderRadius: 6, fontWeight: 700, fontSize: 10.5 }}>
                              Grace Period: {daysLeft}d left
                            </span>
                          )
                        )}
                      </div>
                    </div>
                    {req.reason && (
                      <div className="tiny muted" style={{ background: "var(--ink-100)", padding: 6, borderRadius: 6 }}>
                        "{req.reason}"
                      </div>
                    )}
                    {req.status === "PENDING" && (
                      <div className="row gap-8" style={{ marginTop: 4 }}>
                        <button className="btn btn-outline grow btn-sm" onClick={() => handleRejectRequest(req.id)}>
                          Reject
                        </button>
                        <button
                          className="btn btn-red grow btn-sm"
                          onClick={() => {
                            setProfileType(req.targetType);
                            setSelectedProfile({ id: req.targetId || req.userId, name: req.user?.name || "User" });
                          }}
                          disabled={req.targetType === "CUSTOMER" && !isSuperAdmin}
                          title={req.targetType === "CUSTOMER" && !isSuperAdmin ? "Requires Super Admin" : ""}
                        >
                          Review & Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {selectedProfile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div className="card col gap-12" style={{ maxWidth: 450, width: "100%", padding: 16, background: "var(--ink-50)", boxShadow: "var(--shadow-lg)" }}>
            <div className="row gap-8 text-danger align-center">
              <AlertTriangle size={24} color="var(--red-600)" />
              <h3 className="bold h2" style={{ color: "var(--red-600)" }}>Confirm Deletion</h3>
            </div>
            
            <p className="small muted">
              You are about to permanently delete <strong>{selectedProfile.name || selectedProfile.display_name || "this profile"}</strong> ({profileType}).
            </p>

            <div className="col gap-6" style={{ background: "var(--red-50)", border: "1px solid var(--red-100)", padding: 10, borderRadius: 8 }}>
              <span className="tiny bold" style={{ color: "var(--red-600)" }}>IMPACT PREVIEW:</span>
              <ul className="tiny col gap-4" style={{ listStyleType: "disc", paddingLeft: 16, color: "var(--red-600)", lineHeight: 1.4 }}>
                {profileType === "BUSINESS" && (
                  <>
                    <li>Deletes all Catalog Items associated with the business.</li>
                    <li>Deletes all Offers and Promotion codes.</li>
                    <li>Deletes all posted Business Stories.</li>
                    <li>Suspends and disables the business profile.</li>
                  </>
                )}
                {profileType === "PROVIDER" && (
                  <>
                    <li>Deletes all Portfolio Items and photos.</li>
                    <li>Deletes all Provider Packages.</li>
                    <li>Deletes KYC Documents from Storage bucket.</li>
                    <li>Suspends and disables the provider profile.</li>
                  </>
                )}
                {profileType === "CUSTOMER" && (
                  <>
                    <li>Deletes all owned Businesses and Providers first.</li>
                    <li>Anonymizes user personal details (name, phone, avatar).</li>
                    <li>Deletes all files under user storage directory.</li>
                    <li>Removes Supabase Auth identity from project completely.</li>
                  </>
                )}
              </ul>
            </div>

            <textarea
              className="input"
              placeholder="Reason for deletion (written to audit log)..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              style={{ minHeight: 60, width: "100%", padding: 8, borderRadius: 8, fontSize: 13, border: "1px solid var(--line)", background: "transparent", color: "inherit" }}
            />

            <div className="col gap-4">
              <label className="tiny muted">To confirm, type <strong>DELETE {selectedProfile.name || selectedProfile.display_name || "User"}</strong> below:</label>
              <input
                className="input"
                placeholder={`DELETE ${selectedProfile.name || selectedProfile.display_name || "User"}`}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                style={{ fontSize: 13 }}
              />
            </div>

            <div className="row gap-10" style={{ marginTop: 10 }}>
              <button className="btn btn-outline btn-sm grow" onClick={() => { setSelectedProfile(null); setConfirmText(""); setDeleteReason(""); }} disabled={deleting}>
                Cancel
              </button>
              <button
                className="btn btn-red btn-sm grow"
                onClick={handleDelete}
                disabled={deleting || !deleteReason.trim() || confirmText !== `DELETE ${selectedProfile.name || selectedProfile.display_name || "User"}`}
              >
                {deleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
