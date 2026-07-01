import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { appointmentService, businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import { Calendar, Check, X as XIcon, Image as ImageIcon } from "lucide-react";
import type { AppointmentRecord } from "@/types";
import ManageNav from "./ManageNav";

export default function BusinessAppointments() {
  const { id = "b1" } = useParams();
  const { showToast } = useApp();
  const { data: b } = useQuery(() => businessService.get(id), [id]);
  const { data, loading, error, refetch } = useQuery<AppointmentRecord[]>(
    () => appointmentService.listForTarget(id),
    [id]
  );

  const [activeApt, setActiveApt] = useState<AppointmentRecord | null>(null);
  const [actionType, setActionType] = useState<"ACCEPT" | "REJECT" | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const appointments = data ?? [];

  async function handleUpdateStatus() {
    if (!activeApt || !actionType) return;
    try {
      const newStatus = actionType === "ACCEPT" ? "ACCEPTED" : "REJECTED";
      await appointmentService.updateStatus(activeApt.id, newStatus, responseNote.trim() || undefined);
      showToast(actionType === "ACCEPT" ? "Appointment accepted 📅" : "Appointment declined with note.");
      setActiveApt(null);
      setActionType(null);
      setResponseNote("");
      refetch();
    } catch {
      showToast("Couldn't update appointment");
    }
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Appointments" subtitle={`Bookings for ${b?.name ?? "your shop"}`} />

      <div className="screen-scroll">
        <div className="page-pad" style={{ paddingBottom: 0 }}>
          <div className="card row gap-10" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
            <span style={{ fontSize: 20 }}>📅</span>
            <span className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.4 }}>
              Customer bookings for your working-hour slots. Accept to confirm — the customer sees your reply instantly.
            </span>
          </div>
        </div>

        {loading && <ListSkeleton count={3} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {data && (
          <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
            {appointments.length === 0 ? (
              <EmptyState emoji="📅" title="No booked appointments" text="Customer appointment bookings will appear here." />
            ) : (
              appointments.map((apt) => (
                <div key={apt.id} className="card col gap-10" style={{ padding: 14 }}>
                  <div className="row between center-v">
                    <div className="row gap-10 center-v">
                      <SafeImg src={apt.customerAvatar} variant="avatar" style={{ width: 42, height: 42 }} />
                      <div>
                        <div className="bold small">{apt.customerName}</div>
                        <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                          <Calendar size={12} color="var(--brand-600)" /> {apt.dateLabel} at {apt.timeLabel}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`badge ${
                        apt.status === "ACCEPTED" ? "badge-green" : apt.status === "REJECTED" ? "badge-gray" : "badge-purple"
                      }`}
                      style={{ fontSize: 10, padding: "2px 8px" }}
                    >
                      {apt.status}
                    </span>
                  </div>

                  {apt.packageName && (
                    <div className="tiny semi" style={{ color: "var(--brand-700)" }}>
                      📦 {apt.packageName}{apt.packagePrice ? ` • ₹${apt.packagePrice}` : ""}
                    </div>
                  )}

                  {apt.notes && (
                    <div className="tiny" style={{ background: "var(--ink-50)", padding: 8, borderRadius: 8, color: "var(--ink-700)" }}>
                      💬 <strong>Note:</strong> {apt.notes}
                    </div>
                  )}

                  {apt.photoUrl && (
                    <div className="row gap-8 center-v" style={{ marginTop: 2 }}>
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto(apt.photoUrl!)}
                        className="row gap-6 center-v"
                        style={{ background: "none", border: "none", color: "var(--brand-700)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}
                      >
                        <ImageIcon size={14} /> View attached photo reference
                      </button>
                    </div>
                  )}

                  {apt.responseNote && (
                    <div className="tiny" style={{ color: apt.status === "REJECTED" ? "#b45309" : "#15803d", fontStyle: "italic" }}>
                      Your reply: "{apt.responseNote}"
                    </div>
                  )}

                  {apt.status === "PENDING" && (
                    <div className="row gap-8" style={{ marginTop: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                      <button
                        type="button"
                        className="btn btn-green grow btn-sm row gap-4 center"
                        onClick={() => { setActiveApt(apt); setActionType("ACCEPT"); setResponseNote(""); }}
                      >
                        <Check size={14} /> Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline grow btn-sm row gap-4 center"
                        style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                        onClick={() => { setActiveApt(apt); setActionType("REJECT"); setResponseNote(""); }}
                      >
                        <XIcon size={14} /> Decline
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
        <div style={{ height: 16 }} />
      </div>

      {/* Response Note Modal */}
      {activeApt && actionType && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div className="card col gap-14" style={{ width: "100%", maxWidth: 400, padding: 20, background: "#fff" }}>
            <div className="bold large" style={{ fontSize: 16 }}>
              {actionType === "ACCEPT" ? "Accept Appointment" : "Decline Appointment"}
            </div>
            <div className="tiny muted">
              Add an optional note to send back to {activeApt.customerName} (e.g. confirmation instructions or a reason).
            </div>
            <textarea
              className="input"
              rows={3}
              placeholder={actionType === "ACCEPT" ? "e.g. See you then! Please arrive 5 min early." : "e.g. Sorry, we're fully booked that day."}
              value={responseNote}
              onChange={(e) => setResponseNote(e.target.value)}
              style={{ fontSize: 13, padding: 10 }}
            />
            <div className="row gap-8 end">
              <button className="btn btn-ghost btn-sm" onClick={() => { setActiveApt(null); setActionType(null); }}>Cancel</button>
              <button className={`btn btn-sm ${actionType === "ACCEPT" ? "btn-green" : "btn-primary"}`} onClick={handleUpdateStatus}>
                Confirm {actionType === "ACCEPT" ? "Acceptance" : "Decline"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Fullscreen Preview */}
      {previewPhoto && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setPreviewPhoto(null)}>
          <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
            <img src={previewPhoto} alt="Attachment Preview" style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 12, objectFit: "contain" }} />
            <button className="icon-btn" style={{ position: "absolute", top: -12, right: -12, background: "#fff", color: "#000" }} onClick={() => setPreviewPhoto(null)}><XIcon size={18} /></button>
          </div>
        </div>
      )}

      <ManageNav bizId={id} />
    </div>
  );
}
