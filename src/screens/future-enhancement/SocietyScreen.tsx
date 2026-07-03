import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, SafeImg, EmptyState } from "@/components/common";
import { Users, Key, Shield, Plus, ClipboardCheck, QrCode, Clock, CheckCircle2, X } from "lucide-react";
import { societyService, type Society, type SocietyMember, type GatePass } from "@/services/engagement/societyService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { useApp } from "@/store";
import { ListSkeleton, Skeleton } from "@/components/states";

type Tab = "home" | "members" | "passes" | "pending";

export default function SocietyScreen() {
  const nav = useNavigate();
  const { user, showToast } = useApp();
  const { data, loading, refetch } = useQuery(() => societyService.getMySociety(), []);
  const [tab, setTab] = useState<Tab>("home");

  if (loading) {
    return (
      <div className="screen">
        <AppBar title="My Society" />
        <div className="page-pad"><Skeleton h={140} /></div>
      </div>
    );
  }

  if (!data) {
    return <SocietyJoin onDone={refetch} />;
  }

  const { society, member } = data;
  const isAdmin = member.role === "ADMIN" || member.role === "SECRETARY";

  return (
    <div className="screen">
      <div style={{ background: "linear-gradient(135deg,var(--brand-500),var(--brand-700))", color: "#fff", padding: "16px 16px 0" }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="bold" style={{ fontSize: 16 }}>{society.name}</span>
          {society.verified && <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>✓ Verified</span>}
        </div>
        <div className="tiny" style={{ opacity: 0.85, marginBottom: 4 }}>{society.address}</div>
        <div className="tiny" style={{ opacity: 0.7, marginBottom: 12 }}>Unit {member.unitNumber} • {member.role} • Code: {society.joinCode}</div>
        <div className="row" style={{ borderBottom: "none" }}>
          {([["home", "Overview"], ["members", "Members"], ["passes", "Gate Passes"], ...(isAdmin ? [["pending", "Pending"]] as const : [])] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: tab === t ? 700 : 400, color: "#fff", opacity: tab === t ? 1 : 0.6, borderBottom: tab === t ? "2.5px solid #fff" : "2.5px solid transparent" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="screen-scroll">
        {tab === "home" && <SocietyHome society={society} isAdmin={isAdmin} showToast={showToast} />}
        {tab === "members" && <MembersList societyId={society.id} />}
        {tab === "passes" && <GatePasses societyId={society.id} isAdmin={isAdmin} showToast={showToast} />}
        {tab === "pending" && isAdmin && <PendingMembers societyId={society.id} showToast={showToast} />}
      </div>
    </div>
  );
}

function SocietyHome({ society, isAdmin, showToast }: { society: Society; isAdmin: boolean; showToast: (m: string) => void }) {
  function copyCode() {
    navigator.clipboard.writeText(society.joinCode).catch(() => {});
    showToast(`Join code copied: ${society.joinCode}`);
  }

  return (
    <div className="page-pad col gap-14" style={{ paddingTop: 16 }}>
      <div className="row gap-10">
        <div className="card grow col center" style={{ padding: 16, gap: 6 }}>
          <Users size={22} color="var(--brand-700)" />
          <span className="bold" style={{ fontSize: 22 }}>{society.unitCount}</span>
          <span className="tiny muted">Total units</span>
        </div>
        <div className="card grow col center" style={{ padding: 16, gap: 6 }}>
          <Shield size={22} color="var(--green-500)" />
          <span className="bold" style={{ fontSize: 22 }}>{society.verified ? "Yes" : "No"}</span>
          <span className="tiny muted">Verified</span>
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div className="semi small" style={{ marginBottom: 10 }}>Society join code</div>
        <div className="row gap-12 center">
          <span style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 800, letterSpacing: 6, color: "var(--brand-700)" }}>{society.joinCode}</span>
          <button className="btn btn-outline btn-sm" onClick={copyCode}>Copy</button>
        </div>
        <div className="tiny muted" style={{ marginTop: 8, textAlign: "center" }}>Share this with neighbours to let them join</div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div className="semi small" style={{ marginBottom: 10 }}>Quick actions</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <QuickTile icon={<Key size={20} color="var(--brand-700)" />} label="Issue Gate Pass" />
          <QuickTile icon={<ClipboardCheck size={20} color="var(--green-500)" />} label="Notice Board" />
          <QuickTile icon={<QrCode size={20} color="var(--orange-500)" />} label="Provider Directory" />
          <QuickTile icon={<Users size={20} color="#0ea5e9" />} label="Maintenance Staff" />
        </div>
      </div>

      {isAdmin && (
        <div className="card row gap-10" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-200)" }}>
          <Shield size={18} color="var(--brand-700)" style={{ flexShrink: 0 }} />
          <div>
            <div className="semi small" style={{ color: "var(--brand-700)" }}>Admin tools</div>
            <div className="tiny muted">Approve members, issue gate passes, manage the directory</div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="card col center" style={{ padding: 14, gap: 8 }}>
      {icon}
      <span className="tiny semi" style={{ textAlign: "center" }}>{label}</span>
    </button>
  );
}

function MembersList({ societyId }: { societyId: string }) {
  const { data, loading } = useQuery(() => societyService.getMembers(societyId), [societyId]);
  if (loading) return <div className="page-pad"><ListSkeleton count={4} /></div>;
  const members = data ?? [];
  return (
    <div className="page-pad col gap-10" style={{ paddingTop: 16 }}>
      {members.length === 0 && <EmptyState emoji="👥" title="No members yet" text="Share the join code with neighbours." />}
      {members.map((m) => (
        <div key={m.id} className="card row gap-12" style={{ padding: 12 }}>
          <SafeImg src={m.userAvatar} variant="avatar" style={{ width: 44, height: 44, borderRadius: "50%" }} />
          <div className="grow">
            <div className="semi small">{m.userName}</div>
            <div className="tiny muted">Unit {m.unitNumber}</div>
          </div>
          <span className="badge" style={{ background: m.role === "ADMIN" ? "var(--brand-50)" : "#f0fdf4", color: m.role === "ADMIN" ? "var(--brand-700)" : "#15803d" }}>
            {m.role}
          </span>
        </div>
      ))}
    </div>
  );
}

function GatePasses({ societyId, isAdmin, showToast }: { societyId: string; isAdmin: boolean; showToast: (m: string) => void }) {
  const { data, loading, refetch } = useQueryWithRealtime(() => societyService.getGatePasses(societyId), "gate_passes", [societyId], `society_id=eq.${societyId}`);
  const [showForm, setShowForm] = useState(false);
  const [providerPhone, setProviderPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);

  async function issue() {
    setBusy(true);
    try {
      // In production, resolve providerPhone to userId. For now use placeholder.
      await societyService.issueGatePass({ societyId, providerUserId: providerPhone, purpose, validHours: 8 });
      showToast("Gate pass issued ✓");
      setShowForm(false);
      refetch();
    } catch (e: any) {
      showToast(e.message || "Failed to issue pass");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="page-pad"><ListSkeleton count={3} /></div>;
  const passes = data ?? [];

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 16 }}>
      {isAdmin && !showForm && (
        <button className="btn btn-primary btn-block row center gap-8" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Issue new gate pass
        </button>
      )}
      {showForm && (
        <div className="card col gap-10" style={{ padding: 14 }}>
          <div className="semi small">New gate pass</div>
          <input className="input" placeholder="Provider's registered phone / user ID" value={providerPhone} onChange={(e) => setProviderPhone(e.target.value)} />
          <input className="input" placeholder="Purpose (e.g. Plumber, delivery)" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          <div className="row gap-8">
            <button className="btn btn-outline grow" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-green grow" disabled={busy || !purpose.trim()} onClick={issue}>Issue (8hrs)</button>
          </div>
        </div>
      )}
      {passes.length === 0 && <EmptyState emoji="🔑" title="No active passes" text="Issue a gate pass for an approved provider." />}
      {passes.map((p) => (
        <GatePassCard key={p.id} pass={p} />
      ))}
    </div>
  );
}

function GatePassCard({ pass }: { pass: GatePass }) {
  const expiry = new Date(pass.validUntil);
  const isExpired = expiry < new Date();
  return (
    <div className="card" style={{ padding: 14, opacity: isExpired ? 0.6 : 1 }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="semi small">{pass.providerName || "Provider"}</span>
        <span className="badge" style={{ background: isExpired ? "#f3f4f6" : "#dcfce7", color: isExpired ? "#6b7280" : "#15803d" }}>
          {isExpired ? "Expired" : "Active"}
        </span>
      </div>
      <div className="tiny muted">{pass.purpose}</div>
      <div className="tiny muted" style={{ marginTop: 4 }}>Valid until {expiry.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
    </div>
  );
}

function PendingMembers({ societyId, showToast }: { societyId: string; showToast: (m: string) => void }) {
  const { data, loading, refetch } = useQueryWithRealtime(() => societyService.getPendingMembers(societyId), "society_members", [societyId], `society_id=eq.${societyId}`);
  if (loading) return <div className="page-pad"><ListSkeleton count={3} /></div>;
  const pending = data ?? [];

  async function approve(id: string) {
    await societyService.approveMember(id);
    showToast("Member approved ✓");
    refetch();
  }
  async function reject(id: string) {
    await societyService.rejectMember(id);
    showToast("Request declined");
    refetch();
  }

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 16 }}>
      {pending.length === 0 && <EmptyState emoji="✅" title="All clear" text="No pending membership requests." />}
      {pending.map((m) => (
        <div key={m.id} className="card" style={{ padding: 14 }}>
          <div className="row gap-12" style={{ marginBottom: 10 }}>
            <SafeImg src={m.userAvatar} variant="avatar" style={{ width: 42, height: 42, borderRadius: "50%" }} />
            <div className="grow">
              <div className="semi small">{m.userName}</div>
              <div className="tiny muted">Requesting unit {m.unitNumber}</div>
            </div>
          </div>
          <div className="row gap-8">
            <button className="btn btn-outline grow btn-sm" onClick={() => reject(m.id)}><X size={14} /> Decline</button>
            <button className="btn btn-green grow btn-sm" onClick={() => approve(m.id)}><CheckCircle2 size={14} /> Approve</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SocietyJoin({ onDone }: { onDone: () => void }) {
  const { showToast } = useApp();
  const [mode, setMode] = useState<"choose" | "join" | "create">("choose");
  const [code, setCode] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", city: "", pincode: "", unitCount: "" });

  async function join() {
    setBusy(true);
    try {
      await societyService.joinByCode(code, unit);
      showToast("Join request sent — waiting for admin approval");
      onDone();
    } catch (e: any) {
      showToast(e.message || "Invalid code");
    } finally { setBusy(false); }
  }

  async function create() {
    setBusy(true);
    try {
      await societyService.create({ ...form, unitCount: Number(form.unitCount) || 0 });
      showToast("Society created ✓");
      onDone();
    } catch (e: any) {
      showToast(e.message || "Failed to create");
    } finally { setBusy(false); }
  }

  if (mode === "choose") {
    return (
      <div className="screen">
        <AppBar title="My Society" />
        <div className="screen-scroll page-pad col center" style={{ paddingTop: 60, gap: 16, textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>🏘️</div>
          <div className="bold" style={{ fontSize: 20 }}>Connect with your society</div>
          <div className="muted small" style={{ maxWidth: 280, lineHeight: 1.5 }}>Join your apartment complex or gated community to access resident-only features</div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={() => setMode("join")}>Join with a code</button>
          <button className="btn btn-outline btn-block" onClick={() => setMode("create")}>Register my society</button>
        </div>
      </div>
    );
  }

  if (mode === "join") {
    return (
      <div className="screen">
        <AppBar title="Join Society" onBack={() => setMode("choose")} />
        <div className="page-pad col gap-14" style={{ paddingTop: 24 }}>
          <div className="field">
            <label className="tiny semi muted">Society join code</label>
            <input className="input" placeholder="6-character code (e.g. AB1C2D)" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: 4, textTransform: "uppercase", marginTop: 4, fontSize: 18, fontWeight: 700 }} />
          </div>
          <div className="field">
            <label className="tiny semi muted">Your unit / flat number</label>
            <input className="input" placeholder="e.g. B-204, 3rd Floor" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <button className="btn btn-primary btn-block" disabled={code.length < 6 || !unit.trim() || busy} onClick={join}>
            {busy ? "Sending request…" : "Request to join"}
          </button>
          <div className="tiny muted" style={{ textAlign: "center" }}>Your society admin will approve your request</div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="Register Society" onBack={() => setMode("choose")} />
      <div className="page-pad col gap-12" style={{ paddingTop: 16 }}>
        <div className="tiny muted" style={{ lineHeight: 1.5 }}>Register your society once — neighbours can join with the code you'll receive.</div>
        {[
          { key: "name",     label: "Society / complex name",  ph: "e.g. Lodha Belmondo" },
          { key: "address",  label: "Address",                 ph: "Street address" },
          { key: "city",     label: "City",                    ph: "e.g. Pune" },
          { key: "pincode",  label: "Pincode",                 ph: "411001" },
          { key: "unitCount",label: "Number of units/flats",   ph: "e.g. 240" },
        ].map(({ key, label, ph }) => (
          <div className="field" key={key}>
            <label className="tiny semi muted">{label}</label>
            <input className="input" placeholder={ph} value={(form as any)[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} style={{ marginTop: 4 }} />
          </div>
        ))}
        <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={!form.name.trim() || !form.city.trim() || busy} onClick={create}>
          {busy ? "Creating…" : "Register society"}
        </button>
      </div>
    </div>
  );
}
