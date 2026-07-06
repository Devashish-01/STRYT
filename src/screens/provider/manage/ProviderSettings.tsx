import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Bell, QrCode, X, Image as ImageIcon } from "@/components/Icons";
import { useApp } from "@/store";
import { providerService, profileControlService, uploadService } from "@/services";
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
  // Persist notification prefs to localStorage so they stick across reloads,
  // consistent with the customer Settings screen.
  const [leads, setLeads] = useState(() => localStorage.getItem("prov_notif_leads") !== "false");
  const [matched, setMatched] = useState(() => localStorage.getItem("prov_notif_matched") !== "false");
  useEffect(() => { localStorage.setItem("prov_notif_leads", String(leads)); }, [leads]);
  useEffect(() => { localStorage.setItem("prov_notif_matched", String(matched)); }, [matched]);
  const [loading, setLoading] = useState(true);
  const [ownerEnabled, setOwnerEnabled] = useState(true);
  const [upiId, setUpiId] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [savingUpi, setSavingUpi] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [locPublic, setLocPublic] = useState(false);
  const [customQrUrl, setCustomQrUrl] = useState("");
  const [uploadingQr, setUploadingQr] = useState(false);
  const [paymentTiming, setPaymentTiming] = useState<"AT_BOOKING" | "AT_APPOINTMENT">("AT_APPOINTMENT");
  const [savingTiming, setSavingTiming] = useState(false);

  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQr(true);
    try {
      const url = await uploadService.upload(file, "verification");
      localStorage.setItem("stryt_upi_qr_" + id, url);
      setCustomQrUrl(url);
      showToast("Custom QR code uploaded!");
    } catch {
      showToast("Failed to upload QR code.");
    } finally {
      setUploadingQr(false);
    }
  }

  function clearCustomQr() {
    localStorage.removeItem("stryt_upi_qr_" + id);
    setCustomQrUrl("");
    showToast("Reverted to generated UPI QR");
  }

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
    setCustomQrUrl(localStorage.getItem("stryt_upi_qr_" + id) || "");
    providerService.get(id)
      .then((prov) => {
        if (prov) {
          setOwnerEnabled(prov.ownerEnabled !== false);
          setUpiId(prov.upiId ?? "");
          setEmail(prov.email ?? "");
          setDisplayName(prov.displayName ?? "");
          setShowPhone(prov.showPhonePublicly !== false);
          setShowEmail(prov.showEmailPublicly === true);
          setLocPublic(prov.locationPublic === true);
          setPaymentTiming(prov.paymentTiming === "AT_BOOKING" ? "AT_BOOKING" : "AT_APPOINTMENT");
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [id]);

  async function savePaymentTiming(v: "AT_BOOKING" | "AT_APPOINTMENT") {
    const prev = paymentTiming;
    setPaymentTiming(v);
    setSavingTiming(true);
    try {
      await providerService.update(id, { paymentTiming: v } as any);
    } catch {
      setPaymentTiming(prev);
      showToast("Couldn't save — try again");
    } finally {
      setSavingTiming(false);
    }
  }

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
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><QrCode size={14} /> Payment</div>
          <div className="card col gap-12" style={{ padding: 14 }}>
            {/* UPI ID */}
            <div>
              <div className="tiny semi" style={{ marginBottom: 4 }}>UPI ID (VPA)</div>
              <div className="tiny muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>Customers pay you via UPI. Enter your handle (e.g. yourname@okaxis) — a QR is generated automatically.</div>
              <div className="row gap-8">
                <input className="input grow" placeholder="e.g. yourname@okaxis" value={upiId} onChange={(e) => setUpiId(e.target.value)} style={{ fontSize: 14 }} />
                <button className="btn btn-outline btn-sm" disabled={savingUpi} onClick={saveUpi}>{savingUpi ? "…" : "Save"}</button>
              </div>
            </div>

            <div className="divider" style={{ margin: "2px 0" }} />

            {/* Custom QR upload */}
            <div>
              <div className="tiny semi" style={{ marginBottom: 4 }}>Custom Payment QR (optional)</div>
              <div className="tiny muted" style={{ marginBottom: 10, lineHeight: 1.5 }}>Upload your own QR image (bank app screenshot, GPay/PhonePe QR, etc.). This overrides the auto-generated UPI QR on your share card.</div>

              {customQrUrl ? (
                <div className="col gap-8" style={{ alignItems: "center" }}>
                  <img src={customQrUrl} alt="Custom Payment QR" style={{ width: 140, height: 140, objectFit: "contain", borderRadius: 8, border: "1px solid var(--line)", background: "#fff", padding: 6 }} />
                  <div className="row gap-8">
                    <label className="btn btn-outline btn-sm row gap-6" style={{ cursor: "pointer" }}>
                      <ImageIcon size={13} /> Change
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleQrUpload} />
                    </label>
                    <button className="btn btn-outline btn-sm row gap-6" onClick={clearCustomQr}><X size={13} /> Remove</button>
                  </div>
                </div>
              ) : (
                <label className="btn btn-outline btn-sm row gap-6" style={{ cursor: "pointer", alignSelf: "flex-start" }}>
                  {uploadingQr ? "Uploading…" : <><ImageIcon size={13} /> Upload QR Image</>}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleQrUpload} disabled={uploadingQr} />
                </label>
              )}
            </div>

            <div className="divider" style={{ margin: "2px 0" }} />

            {/* Appointment payment timing */}
            <div>
              <div className="tiny semi" style={{ marginBottom: 4 }}>When to collect appointment payment</div>
              <div className="tiny muted" style={{ marginBottom: 10, lineHeight: 1.5 }}>
                "At booking" requires the customer to pay before you can accept their appointment. "At appointment" (default) lets you accept first — payment happens around the service, whenever suits you.
              </div>
              <div className="row gap-8">
                {(["AT_APPOINTMENT", "AT_BOOKING"] as const).map((t) => (
                  <button
                    key={t}
                    className="grow"
                    disabled={savingTiming}
                    style={{
                      padding: "10px 0",
                      borderRadius: 12,
                      border: paymentTiming === t ? "2px solid var(--green-500)" : "1.5px solid var(--ink-200)",
                      background: paymentTiming === t ? "#f0fdf4" : "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                      color: paymentTiming === t ? "#15803d" : "var(--ink-500)",
                    }}
                    onClick={() => savePaymentTiming(t)}
                  >
                    {t === "AT_BOOKING" ? "At booking" : "At appointment"}
                  </button>
                ))}
              </div>
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
