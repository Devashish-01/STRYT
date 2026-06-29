import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { businessService, appointmentService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { Phone, Navigation, MessageCircle, Tag, CalendarCheck, HelpCircle, Check, Calendar, X as XIcon, Image as ImageIcon } from "lucide-react";
import { useApp } from "@/store";
import type { Lead, AppointmentRecord } from "@/types";
import ManageNav from "./ManageNav";

const meta: Record<string, { icon: any; color: string }> = {
  CALL: { icon: Phone, color: "#16a34a" },
  DIRECTIONS: { icon: Navigation, color: "#f26a00" },
  STORY_REPLY: { icon: MessageCircle, color: "#ec4899" },
  OFFER_CLIP: { icon: Tag, color: "#cc4415" },
  RESERVATION: { icon: CalendarCheck, color: "#0ea5e9" },
  QUESTION: { icon: HelpCircle, color: "#6366f1" },
};

export default function LeadsInbox() {
  const { id = "b1" } = useParams();
  const { data, loading, error, refetch } = useQuery<Lead[]>(() => businessService.leads(id) as any, [id]);
  const { data: aptsData, refetch: refetchApts } = useQuery<AppointmentRecord[]>(() => appointmentService.listForTarget(id), [id]);
  const { showToast } = useApp();
  const [handled, setHandled] = useState<string[]>([]);
  const [tab, setTab] = useState<"leads" | "appointments">("leads");

  const [activeApt, setActiveApt] = useState<AppointmentRecord | null>(null);
  const [actionType, setActionType] = useState<"ACCEPT" | "REJECT" | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const list = data ?? [];
  const appointments = aptsData ?? [];

  async function handleUpdateStatus() {
    if (!activeApt || !actionType) return;
    try {
      const newStatus = actionType === "ACCEPT" ? "ACCEPTED" : "REJECTED";
      await appointmentService.updateStatus(activeApt.id, newStatus, responseNote.trim() || undefined);
      showToast(actionType === "ACCEPT" ? "Appointment accepted! 📅" : "Appointment rejected with note.");
      setActiveApt(null);
      setActionType(null);
      setResponseNote("");
      refetchApts();
    } catch {
      showToast("Couldn't update appointment");
    }
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Leads & Appointments" subtitle="Customer reachouts & booking requests" />
      <div className="hscroll" style={{ paddingTop: 12, paddingBottom: 6 }}>
        <button className={`chip ${tab === "leads" ? "active" : ""}`} onClick={() => setTab("leads")}>📥 Customer Reachouts ({list.length})</button>
        <button className={`chip ${tab === "appointments" ? "active" : ""}`} onClick={() => setTab("appointments")}>📅 Booked Slots ({appointments.length})</button>
      </div>

      <div className="screen-scroll">
        {tab === "leads" && (
          <>
            {loading && <ListSkeleton count={4} />}
            {error && <ErrorView error={error} onRetry={refetch} />}
            {data && (
              <div className="page-pad col gap-10">
                {list.length === 0 && <EmptyState emoji="📥" title="No leads here" text="Calls, directions and questions show up here." />}
                {list.map((l) => {
                  const M = meta[l.kind] || meta.CALL;
                  const Icon = M.icon;
                  const done = l.handled || handled.includes(l.id);
                  return (
                    <div key={l.id} className="card row gap-12" style={{ padding: 12, opacity: done ? 0.6 : 1 }}>
                      <div style={{ position: "relative" }}>
                        <SafeImg src={l.avatar} variant="avatar" className="avatar" style={{ width: 42, height: 42 }} />
                        <span style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: M.color, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}><Icon size={9} color="#fff" /></span>
                      </div>
                      <div className="grow">
                        <div className="semi small">{l.name}</div>
                        <div className="tiny muted">{l.text}</div>
                        <div className="tiny" style={{ color: "var(--ink-400)" }}>{l.time}</div>
                      </div>
                      {!done && (
                        <button className="icon-btn" style={{ width: 34, height: 34, color: "#16a34a" }} onClick={async () => { setHandled((h) => [...h, l.id]); await businessService.markLeadHandled(l.id); showToast("Marked handled"); }}><Check size={16} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "appointments" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 8 }}>
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
                        apt.status === "ACCEPTED"
                          ? "badge-green"
                          : apt.status === "REJECTED"
                          ? "badge-gray"
                          : "badge-purple"
                      }`}
                      style={{ fontSize: 10, padding: "2px 8px" }}
                    >
                      {apt.status}
                    </span>
                  </div>

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
                      Response: "{apt.responseNote}"
                    </div>
                  )}

                  {apt.status === "PENDING" && (
                    <div className="row gap-8" style={{ marginTop: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                      <button
                        type="button"
                        className="btn btn-green grow btn-sm row gap-4 center"
                        onClick={() => { setActiveApt(apt); setActionType("ACCEPT"); setResponseNote(""); }}
                      >
                        <Check size={14} /> Accept Slot
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline grow btn-sm row gap-4 center"
                        style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                        onClick={() => { setActiveApt(apt); setActionType("REJECT"); setResponseNote(""); }}
                      >
                        <XIcon size={14} /> Decline Slot
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
              {actionType === "ACCEPT" ? "Accept Appointment" : "Decline / Reject Appointment"}
            </div>
            <div className="tiny muted">
              Add an optional note to send back to {activeApt.customerName} (e.g. confirmation instructions or cancellation reason).
            </div>
            <textarea
              className="input"
              rows={3}
              placeholder={actionType === "ACCEPT" ? "e.g. Confirmed! Please arrive 5 minutes early." : "e.g. Sorry, store closed for private event."}
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

      {/* Photo Fullscreen Preview Modal */}
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
