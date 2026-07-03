import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { businessService, profileControlService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ErrorView } from "@/components/states";
import { Crown, Power, Bell, QrCode } from "lucide-react";
import { useApp } from "@/store";
import type { TeamMember } from "@/types";
import ManageNav from "./ManageNav";

export default function BusinessSettings() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast, setContext } = useApp();
  const { data: team } = useQuery<TeamMember[]>(() => businessService.team(id) as any, [id]);
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
  const [leads, setLeads] = useState(true);
  const [reviewsN, setReviewsN] = useState(true);
  const [requests, setRequests] = useState(true);
  const [upiId, setUpiId] = useState("");
  const [savingUpi, setSavingUpi] = useState(false);

  useEffect(() => {
    if (business) {
      setOwnerEnabled(business.ownerEnabled !== false);
      setUpiId(business.upiId ?? "");
    }
  }, [business]);

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
          <div className="card col gap-10" style={{ padding: 14 }}>
            <div>
              <div className="tiny semi" style={{ marginBottom: 4 }}>UPI ID (VPA)</div>
              <div className="tiny muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>Customers pay you via UPI. Enter your UPI handle (e.g. myshop@okaxis) — a QR code is generated automatically.</div>
              <input
                className="input"
                placeholder="e.g. yourname@okaxis"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                style={{ fontSize: 14 }}
              />
            </div>
            <button
              className="btn btn-primary btn-sm btn-block"
              disabled={savingUpi}
              onClick={saveUpiId}
            >
              {savingUpi ? "Saving…" : "Save UPI ID"}
            </button>
          </div>
        </div>

        {/* Team */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Team</div>
          {(team ?? []).length > 0 ? (
            <div className="card">
              {(team ?? []).map((m, i) => (
                <div key={m.id} className="row gap-12" style={{ padding: "12px 14px", borderBottom: i < (team!.length - 1) ? "1px solid var(--line)" : "none" }}>
                  <SafeImg src={m.avatar} variant="avatar" className="avatar" style={{ width: 40, height: 40 }} />
                  <div className="grow"><div className="semi small">{m.name}</div><div className="tiny muted">{m.phone}</div></div>
                  <span className={`badge ${m.role === "OWNER" ? "badge-purple" : "badge-gray"}`}>{m.role === "OWNER" && <Crown size={10} />} {m.role}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: 14 }}>
              <div className="tiny muted">Multi-staff accounts aren't available yet — you're the sole manager of this listing for now.</div>
            </div>
          )}
        </div>

        {/* Danger */}
        <div className="card" style={{ padding: 14 }}>
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

function Toggle({ label, on, set, last }: { label: string; on: boolean; set: (v: boolean) => void; last?: boolean }) {
  return (
    <div className="row between" style={{ padding: "13px 14px", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <span className="semi small">{label}</span>
      <button onClick={() => set(!on)} style={{ width: 44, height: 26, borderRadius: 999, background: on ? "var(--brand-600)" : "var(--ink-200)", position: "relative" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
      </button>
    </div>
  );
}
