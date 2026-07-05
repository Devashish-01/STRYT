import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { businessService, profileControlService, uploadService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ErrorView } from "@/components/states";
import { Crown, Power, Bell, QrCode, UserPlus, X, Image as ImageIcon } from "@/components/Icons";
import { useApp } from "@/store";
import type { TeamMember } from "@/types";
import ManageNav from "./ManageNav";

export default function BusinessSettings() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast, setContext } = useApp();
  const { data: team, refetch: refetchTeam } = useQueryWithRealtime<TeamMember[]>(() => businessService.team(id) as any, "business_team_members", [id], `business_id=eq.${id}`);
  const [addingMember, setAddingMember] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberRole, setMemberRole] = useState<"MANAGER" | "STAFF">("STAFF");
  const [savingMember, setSavingMember] = useState(false);

  async function addMember() {
    if (!memberName.trim() || !memberPhone.trim()) return;
    setSavingMember(true);
    try {
      await businessService.addTeamMember(id, { name: memberName.trim(), phone: memberPhone.trim(), role: memberRole });
      setMemberName("");
      setMemberPhone("");
      setMemberRole("STAFF");
      setAddingMember(false);
      refetchTeam();
      showToast("Team member added");
    } catch {
      showToast("Couldn't add team member");
    } finally {
      setSavingMember(false);
    }
  }

  async function removeMember(memberId: string) {
    try {
      await businessService.removeTeamMember(memberId);
      refetchTeam();
      showToast("Removed");
    } catch {
      showToast("Couldn't remove — try again");
    }
  }
  const { data: business, refetch: refetchBiz } = useQuery(() => businessService.get(id), [id]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Settings" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }
  const [ownerEnabled, setOwnerEnabled] = useState(true);
  // Persist notification prefs to localStorage so they stick across reloads,
  // consistent with the customer Settings screen.
  const [leads, setLeads] = useState(() => localStorage.getItem("biz_notif_leads") !== "false");
  const [reviewsN, setReviewsN] = useState(() => localStorage.getItem("biz_notif_reviews") !== "false");
  const [requests, setRequests] = useState(() => localStorage.getItem("biz_notif_requests") !== "false");
  useEffect(() => { localStorage.setItem("biz_notif_leads", String(leads)); }, [leads]);
  useEffect(() => { localStorage.setItem("biz_notif_reviews", String(reviewsN)); }, [reviewsN]);
  useEffect(() => { localStorage.setItem("biz_notif_requests", String(requests)); }, [requests]);
  const [upiId, setUpiId] = useState("");
  const [savingUpi, setSavingUpi] = useState(false);
  const [email, setEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [locPublic, setLocPublic] = useState(false);
  const [customQrUrl, setCustomQrUrl] = useState(() => localStorage.getItem("stryt_upi_qr_" + id) || "");
  const [uploadingQr, setUploadingQr] = useState(false);

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

  useEffect(() => {
    if (business) {
      setOwnerEnabled(business.ownerEnabled !== false);
      setUpiId(business.upiId ?? "");
      setEmail(business.email ?? "");
      setShowPhone(business.showPhonePublicly !== false);
      setShowEmail(business.showEmailPublicly === true);
      setLocPublic(business.locationPublic === true);
    }
  }, [business]);

  function persist(patch: Record<string, unknown>) {
    void businessService.update(id, patch as any).catch(() => showToast("Couldn't save — try again"));
  }
  async function saveEmail() {
    setSavingEmail(true);
    try {
      await businessService.update(id, { email: email.trim() || null } as any);
      showToast("Email saved");
      void refetchBiz();
    } catch {
      showToast("Couldn't save email. Try again.");
    } finally {
      setSavingEmail(false);
    }
  }

  async function saveUpiId() {
    setSavingUpi(true);
    try {
      await businessService.update(id, { upiId: upiId.trim() || null } as any);
      showToast("UPI ID saved");
      void refetchBiz();
    } catch {
      showToast("Couldn't save UPI ID. Try again.");
    } finally {
      setSavingUpi(false);
    }
  }

  async function handleToggleVisibility(v: boolean) {
    setOwnerEnabled(v);
    try {
      await profileControlService.setEnabled("BUSINESS", id, v);
      showToast(v ? "Business is now visible publicly" : "Business is hidden from discovery");
      void refetchBiz();
    } catch (err: any) {
      setOwnerEnabled(!v);
      showToast(err.message || "Failed to update visibility");
    }
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Business settings" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 20 }}>
        {/* Visibility */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Visibility</div>
          <div className="card">
            <Toggle label="Show business publicly" on={ownerEnabled} set={handleToggleVisibility} last />
          </div>
        </div>

        {/* Notifications */}
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><Bell size={14} /> Notifications</div>
          <div className="card">
            <Toggle label="New leads" on={leads} set={setLeads} />
            <Toggle label="New reviews" on={reviewsN} set={setReviewsN} />
            <Toggle label="Matching requests" on={requests} set={setRequests} last />
          </div>
        </div>

        {/* Payment */}
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><QrCode size={14} /> Payment</div>
          <div className="card col gap-12" style={{ padding: 14 }}>
            {/* UPI ID */}
            <div>
              <div className="tiny semi" style={{ marginBottom: 4 }}>UPI ID (VPA)</div>
              <div className="tiny muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>Customers pay you via UPI. Enter your UPI handle (e.g. myshop@okaxis) — a QR code is generated automatically.</div>
              <div className="row gap-8">
                <input
                  className="input grow"
                  placeholder="e.g. yourname@okaxis"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  style={{ fontSize: 14 }}
                />
                <button className="btn btn-outline btn-sm" disabled={savingUpi} onClick={saveUpiId}>
                  {savingUpi ? "…" : "Save"}
                </button>
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
          </div>
        </div>

        {/* Contact & privacy — control what customers can see */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Contact & privacy</div>
          <div className="card col gap-10" style={{ padding: 14 }}>
            <div>
              <div className="tiny semi" style={{ marginBottom: 6 }}>Business email</div>
              <div className="row gap-8">
                <input
                  className="input grow"
                  placeholder="e.g. hello@yourshop.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ fontSize: 14 }}
                />
                <button className="btn btn-outline btn-sm" disabled={savingEmail} onClick={saveEmail}>
                  {savingEmail ? "…" : "Save"}
                </button>
              </div>
            </div>
            <div className="divider" style={{ margin: "2px 0" }} />
            <Toggle label="Show phone publicly" on={showPhone} set={(v) => { setShowPhone(v); persist({ showPhonePublicly: v }); }} />
            <Toggle label="Show email publicly" on={showEmail} set={(v) => { setShowEmail(v); persist({ showEmailPublicly: v }); }} />
            <Toggle label="Exact location public" hint="OFF = customers must request & you approve" on={locPublic} set={(v) => { setLocPublic(v); persist({ locationPublic: v }); }} last />
          </div>
        </div>

        {/* Team */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Team</div>
          {(team ?? []).length > 0 && (
            <div className="card" style={{ marginBottom: 10 }}>
              {(team ?? []).map((m, i) => (
                <div key={m.id} className="row gap-12" style={{ padding: "12px 14px", borderBottom: i < (team!.length - 1) ? "1px solid var(--line)" : "none" }}>
                  <SafeImg src={m.avatar} variant="avatar" className="avatar" style={{ width: 40, height: 40 }} />
                  <div className="grow"><div className="semi small">{m.name}</div><div className="tiny muted">{m.phone}</div></div>
                  <span className={`badge ${m.role === "OWNER" ? "badge-purple" : "badge-gray"}`}>{m.role === "OWNER" && <Crown size={10} />} {m.role}</span>
                  {m.role !== "OWNER" && (
                    <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => removeMember(m.id)} aria-label={`Remove ${m.name}`}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {addingMember ? (
            <div className="card col gap-10" style={{ padding: 14 }}>
              <input className="input" placeholder="Name" value={memberName} onChange={(e) => setMemberName(e.target.value)} />
              <input className="input" placeholder="Phone" inputMode="tel" value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)} />
              <div className="row gap-8">
                {(["STAFF", "MANAGER"] as const).map((r) => (
                  <button key={r} className="chip" style={{ background: memberRole === r ? "var(--brand-800)" : "#fff", color: memberRole === r ? "#fff" : "var(--ink-700)", borderColor: memberRole === r ? "var(--brand-800)" : "var(--ink-200)" }} onClick={() => setMemberRole(r)}>
                    {r === "STAFF" ? "Staff" : "Manager"}
                  </button>
                ))}
              </div>
              <div className="row gap-8">
                <button className="btn btn-outline grow" onClick={() => { setAddingMember(false); setMemberName(""); setMemberPhone(""); }}>Cancel</button>
                <button className="btn btn-primary grow" disabled={savingMember || !memberName.trim() || !memberPhone.trim()} onClick={addMember}>
                  {savingMember ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost btn-block btn-sm" onClick={() => setAddingMember(true)}>
              <UserPlus size={16} /> Add team member
            </button>
          )}
        </div>

        {/* Danger */}
        <div className="card">
          <button
            className="row gap-10 semi small"
            style={{ color: "var(--red-600)" }}
            onClick={async () => {
              try {
                await businessService.update(id, { isOpenNow: false });
                showToast("Shop marked closed — update your hours to reopen");
              } catch { showToast("Couldn't update. Try again."); }
            }}
          >
            <Power size={18} /> Temporarily close shop
          </button>
        </div>

        <button className="btn btn-ghost btn-block" onClick={() => { setContext({ type: "customer", id: null, name: "Personal" }); nav("/home"); }}>
          Exit business mode
        </button>
      </div>
      <ManageNav bizId={id} />
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
      <button onClick={() => set(!on)} style={{ width: 44, height: 26, borderRadius: 999, background: on ? "var(--brand-600)" : "var(--ink-200)", position: "relative", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
      </button>
    </div>
  );
}
