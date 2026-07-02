import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { adminService, type AdminReport } from "@/services/adminService";
import { profileControlService, type DeletionRequest } from "@/services/profileControlService";
import { useQuery } from "@/hooks/useApi";
import { Skeleton, ListSkeleton } from "@/components/states";
import { Shield, Check, X, Store, Briefcase, Tag, Flag, Users, TrendingUp, AlertTriangle } from "lucide-react";
import { useApp } from "@/store";
import { kycService } from "@/services/kycService";

type Tab = "dashboard" | "queue" | "kyc" | "disputes" | "reports" | "profiles";
type QueueType = "business" | "provider" | "category";

export default function AdminPanel() {
  const nav = useNavigate();
  const { user, showToast } = useApp();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [bypassToken, setBypassToken] = useState("");
  const envBypassToken = (import.meta as any).env.VITE_ADMIN_BYPASS_TOKEN;
  const isBypassAuthorized = !!envBypassToken && (
    user.phone === envBypassToken ||
    localStorage.getItem("admin_bypass_token") === envBypassToken
  );

  const isAdmin = 
    (user.roles as string[]).includes("admin") || 
    (user.roles as string[]).includes("super_admin") || 
    isBypassAuthorized;

  if (!isAdmin) {
    return (
      <div className="screen">
        <div className="screen-scroll col center page-pad" style={{ paddingTop: 100, textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: "var(--ink-200)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={40} color="var(--red-600)" />
          </div>
          <h1 className="bold" style={{ fontSize: 24, marginTop: 20 }}>Access Denied</h1>
          <p className="muted small" style={{ marginTop: 8 }}>Only verified administrators can access this console.</p>
          
          {envBypassToken && (
            <div className="col gap-8" style={{ marginTop: 24, width: "100%", maxWidth: 260 }}>
              <input
                type="password"
                placeholder="Enter Admin Bypass Token"
                className="input"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  border: "1.5px solid var(--ink-200)",
                  borderRadius: 10,
                  textAlign: "center"
                }}
                value={bypassToken}
                onChange={(e) => setBypassToken(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (bypassToken === envBypassToken) {
                    localStorage.setItem("admin_bypass_token", bypassToken);
                    showToast("Access granted via bypass token!");
                    window.location.reload();
                  } else {
                    showToast("Invalid admin token");
                  }
                }}
              >
                Submit Token
              </button>
            </div>
          )}

          <button className="btn btn-dark" style={{ marginTop: 16, width: "100%", maxWidth: 200 }} onClick={() => nav("/home")}>Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="Admin Console" subtitle="Moderation & ops" onBack={() => nav("/profile")} />
      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "#fff", overflowX: "auto" }}>
        {([["dashboard", "Overview"], ["queue", "Queue"], ["kyc", "KYC"], ["disputes", "Disputes"], ["reports", "Reports"], ["profiles", "Profiles"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className="semi" style={{ flex: "1 0 auto", padding: "12px 14px", fontSize: 13.5, color: tab === t ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>{label}</button>
        ))}
      </div>
      <div className="screen-scroll">
        {tab === "dashboard" && <AdminDashboard />}
        {tab === "queue" && <AdminQueue />}
        {tab === "kyc" && <AdminKYC />}
        {tab === "disputes" && <AdminDisputes />}
        {tab === "reports" && <AdminReports />}
        {tab === "profiles" && <AdminProfiles />}
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { data, loading } = useQuery(() => adminService.overview(), []);
  if (loading) return <div className="page-pad"><Skeleton h={120} /></div>;
  const d = data!;
  const cards = [
    { label: "Businesses", value: d.businesses, icon: Store, color: "#f26a00" },
    { label: "Providers", value: d.providers, icon: Briefcase, color: "#16a34a" },
    { label: "Open requests", value: d.openRequests, icon: Users, color: "var(--brand-700)" },
    { label: "Pending review", value: d.pendingReview, icon: Flag, color: "#ef4444" },
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
        <Stat label="DAU" value={d.dau.toLocaleString()} />
        <Sep />
        <Stat label="MAU" value={d.mau.toLocaleString()} />
        <Sep />
        <Stat label="Push delivery" value={`${d.pushDelivery}%`} />
      </div>
      <div className="card row gap-10" style={{ padding: 14 }}>
        <TrendingUp size={18} color="#16a34a" />
        <span className="small semi grow">New today</span>
        <span className="bold">{d.newToday}</span>
      </div>
    </div>
  );
}

function AdminQueue() {
  const [type, setType] = useState<QueueType>("business");
  const { data, loading, refetch } = useQuery<any[]>(() => adminService.queue(type) as any, [type]);
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
              <div key={item.id} className="card" style={{ padding: 14 }}>
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

function AdminReports() {
  const { data, loading } = useQuery<AdminReport[]>(() => adminService.reports() as any, []);
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
              <div key={r.id} className="card" style={{ padding: 14 }}>
                <div className="row between">
                  <span className="badge badge-red"><Flag size={11} /> {r.reason}</span>
                  <span className="tiny muted">{r.time}</span>
                </div>
                <div className="semi small" style={{ marginTop: 8 }}>{r.targetName}</div>
                <div className="tiny muted">{r.targetType} • reported by {r.reporter}</div>
                {status === "OPEN" || status === "REVIEWING" ? (
                  <div className="row gap-8" style={{ marginTop: 12 }}>
                    <button className="btn btn-outline grow btn-sm" onClick={() => resolve(r.id, "DISMISSED")}>Dismiss</button>
                    <button className="btn btn-sm grow" style={{ background: "#ef4444", color: "#fff" }} onClick={() => resolve(r.id, "ACTION_TAKEN")}>Take action</button>
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

function AdminKYC() {
  const { showToast } = useApp();
  const { data, loading, refetch } = useQuery(() => kycService.adminGetPending(), []);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState("PAN_VERIFIED");

  if (loading) return <div className="page-pad"><ListSkeleton count={3} /></div>;
  const items = data ?? [];

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
      {items.length === 0 && <EmptyState emoji="✅" title="KYC queue clear" text="No documents pending review." />}
      {items.map((item: any) => (
        <div key={item.id} className="card" style={{ padding: 14 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <div>
              <div className="semi small">{item.provider?.display_name ?? "Provider"}</div>
              <div className="tiny muted">{item.type} • submitted {new Date(item.created_at).toLocaleDateString()}</div>
            </div>
            <a href={item.doc_url} target="_blank" rel="noopener noreferrer"
              className="btn btn-outline btn-sm" style={{ fontSize: 12 }}>
              View doc
            </a>
          </div>
          {approvingId === item.id ? (
            <div className="col gap-8">
              <select className="input" value={selectedTier} onChange={(e) => setSelectedTier(e.target.value)} style={{ fontSize: 13 }}>
                <option value="PAN_VERIFIED">PAN Verified</option>
                <option value="AADHAAR_VERIFIED">Aadhaar Verified</option>
                <option value="VERIFIED_PLUS">Verified+</option>
              </select>
              <div className="row gap-8">
                <button className="btn btn-outline grow btn-sm" onClick={() => setApprovingId(null)}>Cancel</button>
                <button className="btn btn-green grow btn-sm" onClick={async () => {
                  await kycService.adminApprove(item.id, item.provider_id, selectedTier as any);
                  showToast("Approved ✓"); setApprovingId(null); refetch();
                }}>Confirm</button>
              </div>
            </div>
          ) : (
            <div className="row gap-8">
              <button className="btn btn-outline grow btn-sm" style={{ color: "#dc2626" }} onClick={async () => {
                await kycService.adminReject(item.id);
                showToast("Rejected"); refetch();
              }}><X size={14} /> Reject</button>
              <button className="btn btn-green grow btn-sm" onClick={() => setApprovingId(item.id)}>
                <Check size={14} /> Approve
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AdminDisputes() {
  const { showToast } = useApp();
  const { data, loading, refetch } = useQuery<any[]>(async () => {
    const sb = (await import("@/lib/supabaseClient")).getSupabase();
    const { data, error } = await sb
      .from("agreements")
      .select("id, request_title, status, dispute_reason, created_at, requester:users!requester_user_id(name), responder:users!responder_user_id(name)")
      .eq("status", "DISPUTED")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }, []);

  async function resolve(agreementId: string, newStatus: "COMPLETED" | "CANCELLED") {
    const sb = (await import("@/lib/supabaseClient")).getSupabase();
    await sb.from("agreements").update({ status: newStatus }).eq("id", agreementId);
    // Transition escrow: complete → RELEASED, cancel → REFUNDED
    const escrowStatus = newStatus === "COMPLETED" ? "RELEASED" : "REFUNDED";
    await sb.from("payments").update({ escrow_status: escrowStatus })
      .eq("agreement_id", agreementId).eq("escrow_status", "HELD");
    showToast(newStatus === "COMPLETED" ? "Resolved — marked complete, escrow released" : "Resolved — cancelled, escrow refunded");
    refetch();
  }

  if (loading) return <div className="page-pad"><ListSkeleton count={3} /></div>;
  const items = data ?? [];

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
      {items.length === 0 && <EmptyState emoji="⚖️" title="No active disputes" text="All disputes have been resolved." />}
      {items.map((ag: any) => (
        <div key={ag.id} className="card" style={{ padding: 14, border: "1px solid #fca5a5" }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="badge" style={{ background: "#fee2e2", color: "#991b1b" }}>
              <Flag size={11} /> Disputed
            </span>
            <span className="tiny muted">{new Date(ag.created_at).toLocaleDateString()}</span>
          </div>
          <div className="semi small" style={{ marginBottom: 4 }}>{ag.request_title ?? "Agreement"}</div>
          <div className="tiny muted" style={{ marginBottom: 6 }}>
            {ag.requester?.name ?? "?"} ↔ {ag.responder?.name ?? "?"}
          </div>
          {ag.dispute_reason && (
            <div className="tiny" style={{ color: "#c2410c", marginBottom: 10, lineHeight: 1.4, background: "#fff5f5", padding: "6px 8px", borderRadius: 6 }}>
              "{ag.dispute_reason}"
            </div>
          )}
          <div className="row gap-8">
            <button className="btn btn-outline grow btn-sm" style={{ color: "#dc2626" }}
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
    }
  }, [subTab]);

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
    setLoading(true);
    try {
      const sb = (await import("@/lib/supabaseClient")).getSupabase();
      const term = `%${searchQuery.trim()}%`;
      if (searchType === "CUSTOMER") {
        const { data, error } = await sb.from("users").select("*").ilike("name", term).limit(20);
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
                placeholder="Search by name..."
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
            <EmptyState emoji="🔍" title="No profiles found" text="Enter a name and hit search." />
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
                            <span style={{ background: "#fee2e2", color: "#dc2626", padding: "2px 6px", borderRadius: 6, fontWeight: 700, fontSize: 10.5 }}>
                              Ready to Purge
                            </span>
                          ) : (
                            <span style={{ background: "#fef3c7", color: "#d97706", padding: "2px 6px", borderRadius: 6, fontWeight: 700, fontSize: 10.5 }}>
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
              <AlertTriangle size={24} color="#dc2626" />
              <h3 className="bold" style={{ fontSize: 18, color: "#dc2626" }}>Confirm Deletion</h3>
            </div>
            
            <p className="small muted">
              You are about to permanently delete <strong>{selectedProfile.name || selectedProfile.display_name || "this profile"}</strong> ({profileType}).
            </p>

            <div className="col gap-6" style={{ background: "#fef2f2", border: "1px solid #fca5a5", padding: 10, borderRadius: 8 }}>
              <span className="tiny bold" style={{ color: "#991b1b" }}>IMPACT PREVIEW:</span>
              <ul className="tiny col gap-4" style={{ listStyleType: "disc", paddingLeft: 16, color: "#7f1d1d", lineHeight: 1.4 }}>
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
