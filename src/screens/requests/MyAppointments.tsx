import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { appointmentService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { useApp } from "@/store";
import type { AppointmentRecord } from "@/types";
import { Calendar, Clock, Image as ImageIcon, X as XIcon, AlertCircle, CheckCircle2 } from "lucide-react";

export default function MyAppointments() {
  const nav = useNavigate();
  const { user } = useApp();
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "ACCEPTED" | "REJECTED">("ALL");
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery<AppointmentRecord[]>(
    () => appointmentService.listForCustomer(user.id),
    [user.id]
  );

  const list = (data ?? []).filter((a) => (filter === "ALL" ? true : a.status === filter));

  return (
    <div className="screen">
      <AppBar title="My Scheduled Appointments" subtitle="Track your working-hour bookings" />

      {/* Filter Chips */}
      <div className="hscroll" style={{ paddingTop: 12, paddingBottom: 6 }}>
        <button className={`chip ${filter === "ALL" ? "active" : ""}`} onClick={() => setFilter("ALL")}>All</button>
        <button className={`chip ${filter === "PENDING" ? "active" : ""}`} onClick={() => setFilter("PENDING")}>⏳ Pending</button>
        <button className={`chip ${filter === "ACCEPTED" ? "active" : ""}`} onClick={() => setFilter("ACCEPTED")}>✅ Accepted</button>
        <button className={`chip ${filter === "REJECTED" ? "active" : ""}`} onClick={() => setFilter("REJECTED")}>❌ Cancelled / Declined</button>
      </div>

      <div className="screen-scroll">
        {loading && <ListSkeleton count={3} />}
        {data && (
          <div className="page-pad col gap-12" style={{ paddingTop: 8 }}>
            {list.length === 0 ? (
              <EmptyState emoji="📅" title="No appointments scheduled" text="Your scheduled service appointments will appear here." />
            ) : (
              list.map((apt) => (
                <div key={apt.id} className="card col gap-10" style={{ padding: 14 }}>
                  <div className="row between center-v">
                    <div>
                      <div className="bold small" style={{ color: "var(--ink-900)" }}>{apt.targetName}</div>
                      <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                        <Calendar size={12} color="var(--brand-600)" /> {apt.dateLabel} at {apt.timeLabel}
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
                      style={{ fontSize: 10, padding: "3px 9px" }}
                    >
                      {apt.status}
                    </span>
                  </div>

                  {/* Customer Notes */}
                  {apt.notes && (
                    <div className="tiny" style={{ background: "var(--ink-50)", padding: 8, borderRadius: 8, color: "var(--ink-700)" }}>
                      📝 <strong>Your note:</strong> {apt.notes}
                    </div>
                  )}

                  {/* Customer Photo Attachment */}
                  {apt.photoUrl && (
                    <div className="row gap-8 center-v">
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto(apt.photoUrl!)}
                        className="row gap-6 center-v"
                        style={{ background: "none", border: "none", color: "var(--brand-700)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}
                      >
                        <ImageIcon size={14} /> View your attached reference photo
                      </button>
                    </div>
                  )}

                  {/* Cancellation Note Warning Banner */}
                  {apt.status === "REJECTED" && (
                    <div className="card row gap-10 center-v" style={{ padding: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>
                      <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0 }} />
                      <div>
                        <div className="bold tiny" style={{ color: "#991b1b" }}>Appointment Declined by {apt.targetName}</div>
                        {apt.responseNote ? (
                          <div className="tiny" style={{ color: "#7f1d1d", marginTop: 1, fontStyle: "italic" }}>
                            Reason: "{apt.responseNote}"
                          </div>
                        ) : (
                          <div className="tiny" style={{ color: "#7f1d1d", marginTop: 1 }}>
                            No specific cancellation note was provided.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Provider Acceptance Note */}
                  {apt.status === "ACCEPTED" && apt.responseNote && (
                    <div className="card row gap-10 center-v" style={{ padding: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10 }}>
                      <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0 }} />
                      <div>
                        <div className="bold tiny" style={{ color: "#166534" }}>Confirmed by Provider</div>
                        <div className="tiny" style={{ color: "#14532d", marginTop: 1, fontStyle: "italic" }}>
                          Message: "{apt.responseNote}"
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="row end" style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 12 }}
                      onClick={() => nav(`/${apt.targetType.toLowerCase()}/${apt.targetId}`)}
                    >
                      View {apt.targetType === "BUSINESS" ? "Shop Profile" : "Provider Profile"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div style={{ height: 20 }} />
      </div>

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setPreviewPhoto(null)}>
          <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
            <img src={previewPhoto} alt="Attachment Preview" style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 12, objectFit: "contain" }} />
            <button className="icon-btn" style={{ position: "absolute", top: -12, right: -12, background: "#fff", color: "#000" }} onClick={() => setPreviewPhoto(null)}><XIcon size={18} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
