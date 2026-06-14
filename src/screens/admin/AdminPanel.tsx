import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { adminService, type AdminReport } from "@/services/adminService";
import { useQuery } from "@/hooks/useApi";
import { Skeleton, ListSkeleton } from "@/components/states";
import { Shield, Check, X, Store, Briefcase, Tag, Flag, Users, TrendingUp } from "lucide-react";
import { useApp } from "@/store";
import { kycService } from "@/services/kycService";

type Tab = "dashboard" | "queue" | "kyc" | "disputes" | "reports";
type QueueType = "business" | "provider" | "category";

export default function AdminPanel() {
  const nav = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!authed) {
    return (
      <div className="screen">
        <div className="screen-scroll col center page-pad" style={{ paddingTop: 80, textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: "var(--ink-900)", display: "flex", alignItems: "center", justifyContent: "center" }}><Shield size={40} color="#fff" /></div>
          <h1 className="bold" style={{ fontSize: 24, marginTop: 20 }}>Admin Console</h1>
          <p className="muted small" style={{ marginTop: 6 }}>Moderation & operations</p>
          <input className="input" placeholder="Email" style={{ marginTop: 24 }} value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="Password" style={{ marginTop: 10 }} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn-dark btn-block" style={{ marginTop: 16 }} disabled={!email.trim() || !password.trim()} onClick={() => setAuthed(true)}>Log in</button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => nav("/profile")}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="Admin Console" subtitle="Moderation & ops" onBack={() => nav("/profile")} />
      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "#fff" }}>
        {([["dashboard", "Overview"], ["queue", "Queue"], ["kyc", "KYC"], ["disputes", "Disputes"], ["reports", "Reports"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className="semi" style={{ flex: 1, padding: "12px 0", fontSize: 13.5, color: tab === t ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>{label}</button>
        ))}
      </div>
      <div className="screen-scroll">
        {tab === "dashboard" && <AdminDashboard />}
        {tab === "queue" && <AdminQueue />}
        {tab === "kyc" && <AdminKYC />}
        {tab === "disputes" && <AdminDisputes />}
        {tab === "reports" && <AdminReports />}
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
    { label: "Open requests", value: d.openRequests, icon: Users, color: "#6b21cc" },
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
                  {item.image ? <img src={item.image} className="thumb" style={{ width: 48, height: 48, borderRadius: 12 }} /> : <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={20} color="#6b21cc" /></div>}
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
