import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { BadgeCheck, Bell, Power, Camera, Clock } from "lucide-react";
import { useApp } from "@/store";
import { providerService, profileControlService } from "@/services";
import { ErrorView } from "@/components/states";
import ProviderManageNav from "./ProviderManageNav";
import { kycService } from "@/services/core/kycService";
import type { ProviderVerification } from "@/types";

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
  const [verifications, setVerifications] = useState<ProviderVerification[]>([]);
  const [ownerEnabled, setOwnerEnabled] = useState(true);

  const reloadVerifications = async () => {
    if (!id) return;
    try {
      const list = await kycService.getVerifications(id);
      setVerifications(list);
    } catch {
      showToast("Failed to refresh verifications");
    }
  };

  useEffect(() => {
    if (!id) return;
    Promise.all([
      providerService.get(id),
      kycService.getVerifications(id)
    ])
      .then(([prov, kycList]) => {
        if (prov) {
          setOwnerEnabled(prov.ownerEnabled !== false);
        }
        if (kycList) {
          setVerifications(kycList);
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

  const panVerification = verifications.find((v) => v.type === "PAN");
  const aadhaarVerification = verifications.find((v) => v.type === "AADHAAR");

  function VerificationSection({
    type,
    verification,
    reload
  }: {
    type: "PAN" | "AADHAAR";
    verification?: ProviderVerification;
    reload: () => void;
  }) {
    const status = verification?.status || "NONE";
    const verifiedName = verification?.verifiedName;

    return (
      <div className="card col gap-10" style={{ padding: 14 }}>
        <div className="row between align-center">
          <div className="col gap-4">
            <span className="semi small">{type === "PAN" ? "PAN Card" : "Aadhaar Card"}</span>
            {status === "VERIFIED" && (
              <span className="tiny semi" style={{ color: "var(--green-500)" }}>
                ✓ Verified {verifiedName ? `— ${verifiedName}` : ""}
              </span>
            )}
            {status === "PENDING" && (
              <span className="tiny muted">
                Under review
              </span>
            )}
            {status === "REJECTED" && (
              <span className="tiny" style={{ color: "var(--red-600)" }}>
                Rejected (please retry)
              </span>
            )}
            {status === "NONE" && (
              <span className="tiny muted">Not verified</span>
            )}
          </div>
          <div className="row gap-8 align-center">
            {status === "PENDING" && (
              <span className="badge" style={{ background: "#fef9c3", color: "#a16207", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Clock size={12} /> PENDING
              </span>
            )}
            {status === "VERIFIED" && (
              <span className="badge" style={{ background: "#dcfce7", color: "#15803d", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <BadgeCheck size={12} /> VERIFIED
              </span>
            )}
            {status === "REJECTED" && (
              <span className="badge" style={{ background: "#fee2e2", color: "#b91c1c" }}>REJECTED</span>
            )}
          </div>
        </div>

        {status !== "VERIFIED" && status !== "PENDING" && (
          <div style={{ marginTop: 4 }}>
            {type === "PAN" ? (
              <PanForm providerId={id} onDone={reload} />
            ) : (
              <AadhaarForm providerId={id} onDone={reload} />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Provider settings" />

      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 20 }}>
        {/* Verification Section */}
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><Camera size={14} /> KYC Verification</div>
          <div className="col gap-10">
            <VerificationSection
              type="PAN"
              verification={panVerification}
              reload={reloadVerifications}
            />
            <VerificationSection
              type="AADHAAR"
              verification={aadhaarVerification}
              reload={reloadVerifications}
            />
          </div>
        </div>

        {/* Notifications */}
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><Bell size={14} /> Notifications</div>
          <div className="card">
            <Toggle label="New leads" on={leads} set={setLeads} />
            <Toggle label="Requests matching my skills" on={matched} set={setMatched} last />
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

function PanForm({ providerId, onDone }: { providerId: string; onDone: () => void }) {
  const [pan, setPan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { showToast } = useApp();

  async function verify() {
    setLoading(true); setError("");
    try {
      const { name } = await kycService.verifyPAN(providerId, pan.toUpperCase().trim());
      showToast(`PAN verified — ${name}`);
      onDone();
    } catch (e: any) {
      setError(e.message || "Verification failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="col gap-8">
      <input className="input" placeholder="PAN number (e.g. ABCDE1234F)" maxLength={10}
        value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())}
        style={{ letterSpacing: 2, textTransform: "uppercase" }} />
      {error && <div className="tiny" style={{ color: "var(--red-600)" }}>{error}</div>}
      <button className="btn btn-outline btn-sm btn-block"
        disabled={pan.length < 10 || loading} onClick={verify}>
        {loading ? "Verifying…" : "Verify PAN instantly →"}
      </button>
    </div>
  );
}

function AadhaarForm({ providerId, onDone }: { providerId: string; onDone: () => void }) {
  const [aadhaar, setAadhaar] = useState("");
  const [clientId, setClientId] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"input" | "otp">("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { showToast } = useApp();

  async function sendOtp() {
    setLoading(true); setError("");
    try {
      const { clientId: cid } = await kycService.aadhaarSendOtp(providerId, aadhaar.replace(/\s/g, ""));
      setClientId(cid); setStep("otp");
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function verifyOtp() {
    setLoading(true); setError("");
    try {
      const { name } = await kycService.aadhaarVerifyOtp(providerId, clientId, otp);
      showToast(`Aadhaar verified — ${name}`);
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="col gap-8">
      {step === "input" ? (
        <>
          <input className="input" placeholder="12-digit Aadhaar number" inputMode="numeric" maxLength={12}
            value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ""))} />
          {error && <div className="tiny" style={{ color: "var(--red-600)" }}>{error}</div>}
          <button className="btn btn-outline btn-sm btn-block"
            disabled={aadhaar.length < 12 || loading} onClick={sendOtp}>
            {loading ? "Sending OTP…" : "Send OTP →"}
          </button>
        </>
      ) : (
        <>
          <div className="tiny muted">OTP sent to Aadhaar-linked mobile number</div>
          <input className="input" placeholder="6-digit OTP" inputMode="numeric" maxLength={6}
            value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} autoFocus />
          {error && <div className="tiny" style={{ color: "var(--red-600)" }}>{error}</div>}
          <div className="row gap-8">
            <button className="btn btn-outline btn-sm grow"
              onClick={() => { setStep("input"); setError(""); }}>Back</button>
            <button className="btn btn-green btn-sm grow"
              disabled={otp.length < 6 || loading} onClick={verifyOtp}>
              {loading ? "Verifying…" : "Verify →"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({ label, on, set, last }: { label: string; on: boolean; set: (v: boolean) => void; last?: boolean }) {
  return (
    <div className="row between" style={{ padding: "13px 14px", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <span className="semi small">{label}</span>
      <button onClick={() => set(!on)} style={{ width: 44, height: 26, borderRadius: 999, background: on ? "var(--green-500)" : "var(--ink-200)", position: "relative" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
      </button>
    </div>
  );
}
