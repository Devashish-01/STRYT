import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Bell } from "lucide-react";
import { useApp } from "@/store";
import { providerService, profileControlService } from "@/services";
import { ErrorView } from "@/components/states";
import ProviderManageNav from "./ProviderManageNav";

export default function ProviderSettings() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast, setContext } = useApp();

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Settings" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }
  const [leads, setLeads] = useState(true);
  const [matched, setMatched] = useState(true);
  const [loading, setLoading] = useState(true);
  const [ownerEnabled, setOwnerEnabled] = useState(true);
  const [upiId, setUpiId] = useState("");
  const [email, setEmail] = useState("");
  const [savingUpi, setSavingUpi] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [locPublic, setLocPublic] = useState(false);

  function persist(patch: Record<string, unknown>) {
    void providerService.update(id, patch as any).catch(() => showToast("Couldn't save — try again"));
  }
  async function saveUpi() {
    setSavingUpi(true);
    try { await providerService.update(id, { upiId: upiId.trim() || null } as any); showToast("UPI ID saved"); }
    catch { showToast("Couldn't save UPI ID"); }
    finally { setSavingUpi(false); }
  }
  async function saveEmail() {
    setSavingEmail(true);
    try { await providerService.update(id, { email: email.trim() || null } as any); showToast("Email saved"); }
    catch { showToast("Couldn't save email"); }
    finally { setSavingEmail(false); }
  }

  useEffect(() => {
    if (!id) return;
    providerService.get(id)
      .then((prov) => {
        if (prov) {
          setOwnerEnabled(prov.ownerEnabled !== false);
          setUpiId(prov.upiId ?? "");
          setEmail(prov.email ?? "");
          setShowPhone(prov.showPhonePublicly !== false);
          setShowEmail(prov.showEmailPublicly === true);
          setLocPublic(prov.locationPublic === true);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [id]);

  async function handleToggleVisibility(v: boolean) {
    setOwnerEnabled(v);
    try {
      await profileControlService.setEnabled("PROVIDER", id, v);
      showToast(v ? "Provider profile is now visible" : "Provider profile hidden from discovery");
    } catch (err: any) {
      setOwnerEnabled(!v);
      showToast(err.message || "Failed to update visibility");
    }
  }

  if (loading) {
    return (
      <div className="screen with-nav">
        <AppBar title="Provider settings" />
        <div className="screen-scroll page-pad col center" style={{ paddingTop: 80 }}>
          <div className="muted small">Loading settings...</div>
        </div>
        <ProviderManageNav pid={id} />
      </div>
    );
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Provider settings" />

      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 20 }}>
        {/* Notifications */}
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><Bell size={14} /> Notifications</div>
          <div className="card">
            <Toggle label="New leads" on={leads} set={setLeads} />
            <Toggle label="Requests matching my skills" on={matched} set={setMatched} last />
          </div>
        </div>

        {/* Payment */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Payment</div>
          <div className="card col gap-10" style={{ padding: 14 }}>
            <div className="tiny muted" style={{ lineHeight: 1.5 }}>Customers pay you via UPI. Enter your UPI handle (e.g. yourname@okaxis) — a QR is generated in the deal screen.</div>
            <div className="row gap-8">
              <input className="input grow" placeholder="e.g. yourname@okaxis" value={upiId} onChange={(e) => setUpiId(e.target.value)} style={{ fontSize: 14 }} />
              <button className="btn btn-outline btn-sm" disabled={savingUpi} onClick={saveUpi}>{savingUpi ? "…" : "Save"}</button>
            </div>
          </div>
        </div>

        {/* Contact & privacy */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Contact & privacy</div>
          <div className="card col gap-10" style={{ padding: 14 }}>
            <div>
              <div className="tiny semi" style={{ marginBottom: 6 }}>Email</div>
              <div className="row gap-8">
                <input className="input grow" placeholder="e.g. you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ fontSize: 14 }} />
                <button className="btn btn-outline btn-sm" disabled={savingEmail} onClick={saveEmail}>{savingEmail ? "…" : "Save"}</button>
              </div>
            </div>
            <div className="divider" style={{ margin: "2px 0" }} />
            <Toggle label="Show phone publicly" on={showPhone} set={(v) => { setShowPhone(v); persist({ showPhonePublicly: v }); }} />
            <Toggle label="Show email publicly" on={showEmail} set={(v) => { setShowEmail(v); persist({ showEmailPublicly: v }); }} />
            <Toggle label="Exact location public" hint="OFF = customers must request & you approve" on={locPublic} set={(v) => { setLocPublic(v); persist({ locationPublic: v }); }} last />
          </div>
        </div>

        {/* Visibility */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Visibility</div>
          <div className="card">
            <Toggle label="Show provider profile publicly" on={ownerEnabled} set={handleToggleVisibility} last />
          </div>
        </div>

        <button className="btn btn-ghost btn-block" onClick={() => { setContext({ type: "customer", id: null, name: "Personal" }); nav("/home"); }}>Exit provider mode</button>
      </div>
      <ProviderManageNav pid={id} />
    </div>
  );
}

function Toggle({ label, hint, on, set, last }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void; last?: boolean }) {
  return (
    <div className="row between" style={{ padding: "13px 14px", borderBottom: last ? "none" : "1px solid var(--line)", alignItems: "center" }}>
      <div className="col" style={{ gap: 2, paddingRight: 10 }}>
        <span className="semi small">{label}</span>
        {hint && <span className="tiny muted">{hint}</span>}
      </div>
      <button onClick={() => set(!on)} style={{ width: 44, height: 26, borderRadius: 999, background: on ? "var(--green-500)" : "var(--ink-200)", position: "relative", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
      </button>
    </div>
  );
}
