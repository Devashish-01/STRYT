import { useState, useEffect } from "react";
import { X, Calendar as CalendarIcon, Clock, Check, Camera, Image as ImageIcon, Trash2 } from "lucide-react";
import { useApp } from "@/store";
import { generateWorkingSlots, type AppointmentSlot } from "@/utils/availability";
import { uploadService } from "@/services/uploadService";
import { appointmentService } from "@/services/appointmentService";
import type { AppointmentRecord } from "@/types";
import { Skeleton } from "@/components/states";

export interface BookingPackage {
  id: string;
  name: string;
  price: number;
  duration?: string;
}

interface AppointmentSheetProps {
  targetId: string;
  targetName: string;
  targetType: "PROVIDER" | "BUSINESS";
  availabilityNote?: string;
  packages?: BookingPackage[];
  availableNow?: boolean;
  initialPackage?: BookingPackage | null;
  onClose: () => void;
  /** Fired after a booking is successfully created (before the sheet closes). */
  onBooked?: () => void;
}

export function AppointmentSheet({
  targetId,
  targetName,
  targetType,
  availabilityNote,
  packages = [],
  availableNow = false,
  initialPackage,
  onClose,
  onBooked,
}: AppointmentSheetProps) {
  const { user, showToast } = useApp();
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<BookingPackage | null>(initialPackage ?? null);
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [existingAppointments, setExistingAppointments] = useState<AppointmentRecord[]>([]);
  const [loadingApts, setLoadingApts] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadApts() {
      try {
        const list = await appointmentService.listForTarget(targetId);
        if (active) {
          setExistingAppointments(list);
        }
      } catch (err) {
        console.error("Failed to load appointments", err);
      } finally {
        if (active) {
          setLoadingApts(false);
        }
      }
    }
    loadApts();
    return () => {
      active = false;
    };
  }, [targetId]);

  // Generate 7 upcoming day choices
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  const selectedDate = dates[dayOffset] || new Date();
  const slots = generateWorkingSlots(availabilityNote, selectedDate, existingAppointments);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("Photo must be under 10MB");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
  }

  async function handleConfirm() {
    if (!selectedSlot) {
      showToast("Please select a time slot");
      return;
    }
    setSubmitting(true);
    let uploadedUrl: string | undefined = undefined;
    try {
      if (photoFile) {
        setUploading(true);
        uploadedUrl = await uploadService.upload(photoFile, "appointment");
        setUploading(false);
      }

      await appointmentService.create({
        targetId,
        targetName,
        targetType,
        customerId: user.id || "guest",
        customerName: user.name || "Customer",
        customerAvatar: user.avatar,
        scheduledForISO: selectedSlot.isoTimestamp,
        dateLabel: selectedSlot.dateLabel,
        timeLabel: selectedSlot.timeLabel,
        notes: notes.trim() || undefined,
        photoUrl: uploadedUrl,
        packageId: selectedPkg?.id,
        packageName: selectedPkg?.name,
        packagePrice: selectedPkg?.price,
      });

      showToast(`Appointment scheduled for ${selectedSlot.dateLabel} at ${selectedSlot.timeLabel} 📅`);
      onBooked?.();
      onClose();
    } catch (err: any) {
      showToast(err?.message || "Couldn't schedule appointment. Try again.");
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "flex-end",
        animation: "fadeIn .2s",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          margin: "0 auto",
          background: "#fff",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 20,
          maxHeight: "90vh",
          overflowY: "auto",
          animation: "slideUp .25s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="row between center-v" style={{ marginBottom: 16 }}>
          <div>
            <div className="bold large" style={{ fontSize: 18, color: "var(--ink-900)" }}>
              📅 Schedule Appointment
            </div>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              Book a slot with <strong style={{ color: "var(--brand-700)" }}>{targetName}</strong>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Availability info card */}
        {availableNow ? (
          <div className="card" style={{ padding: 12, background: "#e8f7ee", border: "1px solid #bbf7d0", marginBottom: 16 }}>
            <div className="row gap-8 center-v">
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 0 3px rgba(22,163,74,0.18)" }} />
              <div>
                <div className="bold small" style={{ color: "#15803d" }}>Available now</div>
                <div className="tiny" style={{ color: "#166534", marginTop: 1 }}>Pick the earliest slot below — they can take you right away.</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)", marginBottom: 16 }}>
            <div className="row gap-8 center-v">
              <Clock size={16} color="var(--brand-700)" />
              <div>
                <div className="tiny semi muted">Working Hours Schedule</div>
                <div className="bold small" style={{ color: "var(--brand-800)", marginTop: 1 }}>
                  {availabilityNote || "Mon–Sat from 09:00 AM to 07:00 PM"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Package selector */}
        {packages.length > 0 && (
          <div className="field" style={{ marginBottom: 16 }}>
            <label className="tiny semi muted" style={{ display: "block", marginBottom: 8 }}>
              Choose a package / service
            </label>
            <div className="col gap-8">
              {packages.map((pk) => {
                const on = selectedPkg?.id === pk.id;
                return (
                  <button
                    key={pk.id}
                    type="button"
                    onClick={() => setSelectedPkg(on ? null : pk)}
                    className="row gap-10"
                    style={{
                      padding: 12, borderRadius: 12, textAlign: "left",
                      border: on ? "2px solid var(--brand-600)" : "1px solid var(--ink-200)",
                      background: on ? "var(--brand-50)" : "#fff",
                    }}
                  >
                    <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, border: on ? "6px solid var(--brand-600)" : "2px solid var(--ink-300)" }} />
                    <div className="grow">
                      <div className="semi small">{pk.name}</div>
                      {pk.duration && <div className="tiny muted">{pk.duration}</div>}
                    </div>
                    <div className="bold small" style={{ color: "var(--brand-700)" }}>₹{pk.price}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Date Selector Chips */}
        <div className="field" style={{ marginBottom: 16 }}>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 8 }}>
            Select Date
          </label>
          <div className="row gap-8" style={{ overflowX: "auto", paddingBottom: 4 }}>
            {dates.map((d, idx) => {
              const isToday = idx === 0;
              const isTomorrow = idx === 1;
              const label = isToday
                ? "Today"
                : isTomorrow
                ? "Tomorrow"
                : d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
              const isSelected = dayOffset === idx;
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => {
                    setDayOffset(idx);
                    setSelectedSlot(null);
                  }}
                  className={`chip ${isSelected ? "active" : ""}`}
                  style={{
                    flexShrink: 0,
                    padding: "8px 14px",
                    borderRadius: 16,
                    fontSize: 13,
                    fontWeight: isSelected ? 700 : 500,
                  }}
                >
                  <CalendarIcon size={13} style={{ marginRight: 4 }} /> {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Available Time Slots Grid */}
        <div className="field" style={{ marginBottom: 16 }}>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 8 }}>
            Available Working Hours Slots ({slots.filter((s) => s.isAvailable).length} slots)
          </label>
          {loadingApts ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
              }}
            >
              <Skeleton h={38} r={12} />
              <Skeleton h={38} r={12} />
              <Skeleton h={38} r={12} />
            </div>
          ) : slots.length === 0 ? (
            <div className="card col center" style={{ padding: 20, textAlign: "center", background: "var(--ink-50)" }}>
              <span style={{ fontSize: 24, marginBottom: 4 }}>😴</span>
              <span className="semi small">Closed on this date</span>
              <span className="tiny muted">Please pick another working day above</span>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
                maxHeight: 180,
                overflowY: "auto",
                paddingRight: 2,
              }}
            >
              {slots.map((s) => {
                const isSelected = selectedSlot?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!s.isAvailable}
                    onClick={() => setSelectedSlot(s)}
                    style={{
                      padding: "10px 8px",
                      borderRadius: 12,
                      border: isSelected ? "2px solid var(--brand-600)" : "1px solid var(--ink-200)",
                      background: isSelected
                        ? "var(--brand-50)"
                        : !s.isAvailable
                        ? "var(--ink-100)"
                        : "#fff",
                      color: isSelected
                        ? "var(--brand-800)"
                        : !s.isAvailable
                        ? "var(--ink-400)"
                        : "var(--ink-900)",
                      fontSize: 12.5,
                      fontWeight: isSelected ? 700 : 500,
                      cursor: s.isAvailable ? "pointer" : "not-allowed",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    {isSelected && <Check size={13} color="var(--brand-600)" />}
                    {s.timeLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Special Instructions / Notes */}
        <div className="field" style={{ marginBottom: 14 }}>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>
            Service Notes / Instructions (Optional)
          </label>
          <textarea
            className="input"
            rows={2}
            placeholder="Describe your requirement or service details..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ fontSize: 13, padding: 10, resize: "none" }}
          />
        </div>

        {/* Attach Photograph */}
        <div className="field" style={{ marginBottom: 20 }}>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>
            Attach Reference Photograph (Optional)
          </label>
          {photoPreview ? (
            <div style={{ position: "relative", width: 100, height: 100, borderRadius: 12, overflow: "hidden", border: "1px solid var(--ink-200)" }}>
              <img src={photoPreview} alt="Appointment Reference" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button
                type="button"
                onClick={removePhoto}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "50%",
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ) : (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderRadius: 12,
                border: "1.5px dashed var(--ink-300)",
                background: "var(--ink-50)",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ink-700)",
              }}
            >
              <Camera size={18} color="var(--brand-600)" />
              <span>Attach photo (item / haircut / reference)</span>
              <input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: "none" }} />
            </label>
          )}
        </div>

        {/* Confirm Action Button */}
        <button
          type="button"
          className="btn btn-green btn-block btn-lg"
          disabled={!selectedSlot || submitting || uploading}
          onClick={handleConfirm}
          style={{ height: 48, fontSize: 15, fontWeight: 700 }}
        >
          {submitting || uploading
            ? "Booking & Uploading..."
            : selectedSlot
            ? `Confirm Booking for ${selectedSlot.timeLabel}`
            : "Select a Time Slot"}
        </button>
      </div>
    </div>
  );
}
