import { useState, useEffect } from "react";
import { X, Calendar as CalendarIcon, Clock, Check, Camera, Image as ImageIcon, Trash2, Store, Package } from "@/components/Icons";
import { useApp } from "@/store";
import { generateWorkingSlots, isWorkingDay, type AppointmentSlot, DEFAULT_WORKING_HOURS, formatHoursForDisplay } from "@/utils/availability";
import { uploadService } from "@/services/core/uploadService";
import { appointmentService, type BookedSlotUsage } from "@/services/engagement/appointmentService";
import { slotBlockService } from "@/services/engagement/slotBlockService";
import type { AppointmentRecord, BlockedSlot } from "@/types";
import { displayName as safeName } from "@/lib/publicName";
import { haptics } from "@/lib/haptics";
import { Skeleton } from "@/components/states";
import { PaymentSheet } from "@/components/PaymentSheet";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import LocationPicker from "@/components/LocationPicker";
import { BUSINESS_PACKAGES, type BizVocabulary } from "@/lib/businessPackages";

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
  /** Pre-fills the notes field (e.g. an itemized cart list on checkout) — still editable. */
  initialNotes?: string;
  /** Structured cart line items for a multi-item checkout — drives real per-item stock
   *  reservation server-side. Omit for a plain single-package booking (the server
   *  synthesizes one implicit item from packageId/packageName/packagePrice instead). */
  items?: AppointmentRecord["items"];
  /** When the seller collects payment. AT_BOOKING prompts payment immediately after booking, before the seller can accept. */
  paymentTiming?: "AT_BOOKING" | "AT_APPOINTMENT";
  /** Seller's UPI ID, passed through to the post-booking payment step when paymentTiming is AT_BOOKING. */
  payeeUpiId?: string | null;
  /** Upfront deposit percentage (1–99), passed through to the AT_BOOKING payment step so only a deposit is collected now. */
  depositPercent?: number;
  /** Id of the appointment being replaced, when this sheet is opened from the reschedule flow. */
  rescheduledFromId?: string;
  /** Date/time label of the booking being replaced — shown as an on-screen reference so the
   *  reschedule flow doesn't look identical to booking a brand-new appointment. */
  rescheduledFromLabel?: { dateLabel: string; timeLabel: string };
  /** When true, the viewer is outside this listing's service area — blocks booking. */
  outOfRange?: boolean;
  /** Whether THIS business offers home delivery (Business → Settings). Businesses only;
   *  the DELIVERY option is hidden unless the shop opted in. Also enforced server-side. */
  deliveryEnabled?: boolean;
  /** The shop's typical delivery time, shown as a guide next to the delivery option. */
  deliveryTime?: string | null;
  /** The target's package wording ("reservation", "class", "order"…) in place of "appointment". Defaults to the generic package's (today's exact wording) when the caller has no theme in scope. */
  vocabulary?: BizVocabulary;
  /** The target's resolved package key, stamped onto the created booking as a
   *  booking-time snapshot so My Appointments can render this row with the
   *  same wording later, even if the target's package changes afterward. */
  targetPackageKey?: string | null;
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
  initialNotes,
  items,
  paymentTiming = "AT_APPOINTMENT",
  payeeUpiId,
  depositPercent,
  rescheduledFromId,
  rescheduledFromLabel,
  outOfRange,
  deliveryEnabled = false,
  deliveryTime,
  vocabulary = BUSINESS_PACKAGES.generic.vocabulary,
  targetPackageKey,
  onClose,
  onBooked,
}: AppointmentSheetProps) {
  const { user, showToast } = useApp();
  const isReschedule = !!rescheduledFromId;
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<BookingPackage | null>(initialPackage ?? null);
  const [notes, setNotes] = useState(initialNotes ?? "");
  // Home delivery is a business-only choice — a provider visit doesn't have a
  // "product to deliver" in the same sense, so this stays IN_STORE for providers.
  // Gated on the shop's own opt-in, not just the global flag: a business that
  // hasn't turned delivery on can't fulfil it, and appointment_create rejects
  // DELIVERY for such a shop anyway (DELIVERY_NOT_OFFERED).
  const canOfferDelivery = DELIVERY_AGENT_ENABLED && targetType === "BUSINESS" && deliveryEnabled;
  const [fulfillmentType, setFulfillmentType] = useState<"IN_STORE" | "DELIVERY">("IN_STORE");
  const [deliveryAddressLine, setDeliveryAddressLine] = useState("");
  const [requestedWindow, setRequestedWindow] = useState("");
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [existingAppointments, setExistingAppointments] = useState<AppointmentRecord[]>([]);
  // Occupied timestamps for the target from the privacy-safe booked_slots RPC —
  // other customers' rows are hidden by RLS, so this is how their taken slots
  // still show as unavailable (closing the double-booking hole).
  const [bookedTimes, setBookedTimes] = useState<BookedSlotUsage[]>([]);
  /** package_id → { capacity, maxPartySize }, resolved server-side against the
   *  business default. Empty for providers (always capacity 1). */
  const [capacities, setCapacities] = useState<Record<string, { capacity: number; maxPartySize: number }>>({});
  const [partySize, setPartySize] = useState(1);
  const [customerAppointments, setCustomerAppointments] = useState<AppointmentRecord[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [loadingApts, setLoadingApts] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [bookedAppointment, setBookedAppointment] = useState<AppointmentRecord | null>(null);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  useEffect(() => {
    let active = true;
    async function loadApts() {
      try {
        const [targetList, customerList, blocked, booked, caps] = await Promise.all([
          appointmentService.listForTarget(targetId),
          appointmentService.listForCustomer(user?.id || "guest"),
          slotBlockService.list(targetId).catch(() => []),
          appointmentService.bookedSlots(targetId).catch(() => []),
          // Providers have no capacity concept — skip the round trip entirely.
          targetType === "BUSINESS"
            ? appointmentService.slotCapacities(targetId).catch(() => ({}))
            : Promise.resolve({}),
        ]);
        if (active) {
          setExistingAppointments(targetList);
          setCustomerAppointments(customerList);
          setBlockedSlots(blocked);
          setBookedTimes(booked);
          setCapacities(caps);
        }
      } catch (err) {
        console.error("Failed to load appointments", err);
        if (active) {
          setLoadError(true);
          showToast("Couldn't load current availability — slots shown may be inaccurate.");
        }
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
  }, [targetId, user?.id, targetType]);

  /** Reload just the live usage — after a SLOT_FULL race, so the grid reflects
   *  reality in place instead of stranding the user on a stale view. */
  async function refreshSlotUsage() {
    const booked = await appointmentService.bookedSlots(targetId).catch(() => []);
    setBookedTimes(booked);
  }

  // Generate 7 upcoming day choices
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  const selectedDate = dates[dayOffset] || new Date();

  // Capacity is per-service, so availability depends on which service is
  // selected. Falls back to 1 (classic one-per-slot) for providers, for a
  // cart/no-service booking, or if the lookup failed.
  const activeCapacity = selectedPkg ? capacities[selectedPkg.id] : undefined;
  const slotCapacity = Math.max(1, activeCapacity?.capacity ?? 1);
  const maxPartySize = Math.min(slotCapacity, Math.max(1, activeCapacity?.maxPartySize ?? 1));

  // Server-side usage for the selected service only — bookings for a DIFFERENT
  // service don't consume this service's capacity (the overall ceiling, when
  // set, is enforced server-side at confirm time).
  const usedByIso: Record<string, number> = {};
  for (const b of bookedTimes) {
    if ((b.packageId ?? null) !== (selectedPkg?.id ?? null)) continue;
    usedByIso[b.scheduledForISO] = (usedByIso[b.scheduledForISO] ?? 0) + b.usedSpots;
  }

  // Local rows must be filtered to the SAME service, or a customer's booking
  // for a different service would wrongly consume this one's capacity (the two
  // have independent limits). The server RPC already counts these same rows,
  // and generateWorkingSlots takes max(server, local), so there's no double
  // count — the local pass only adds off-grid overlap coverage.
  const occupiedForSlots: AppointmentRecord[] = existingAppointments.filter(
    (a) => (a.packageId ?? null) === (selectedPkg?.id ?? null),
  );
  const slots = generateWorkingSlots(availabilityNote, selectedDate, occupiedForSlots, blockedSlots, {
    capacity: slotCapacity,
    usedByIso,
  });

  // Spots the customer may take right now: capped by the service's max party
  // size and by what's actually left in the chosen slot.
  const partyCeiling = Math.max(1, Math.min(maxPartySize, selectedSlot ? selectedSlot.remaining : maxPartySize));
  const canPickParty = maxPartySize > 1;

  // Switching service changes both capacity and party limits, so a slot or
  // party size chosen under the old service may no longer be valid. Clamp the
  // party size and drop a selection that no longer fits rather than letting
  // the customer submit something the server will reject.
  useEffect(() => {
    setPartySize((n) => Math.max(1, Math.min(n, maxPartySize)));
  }, [maxPartySize]);

  useEffect(() => {
    if (!selectedSlot) return;
    const fresh = slots.find((s) => s.id === selectedSlot.id);
    if (!fresh || !fresh.isAvailable || fresh.remaining < partySize) {
      setSelectedSlot(fresh && fresh.isAvailable ? fresh : null);
      if (fresh && fresh.isAvailable && fresh.remaining < partySize) {
        setPartySize(Math.max(1, fresh.remaining));
      }
    } else if (fresh.remaining !== selectedSlot.remaining) {
      setSelectedSlot(fresh); // keep the live remaining count in sync
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPkg?.id, bookedTimes, slotCapacity]);

  // Default to the first working day rather than always "Today" when today is closed.
  useEffect(() => {
    if (dayOffset !== 0) return;
    if (isWorkingDay(availabilityNote, dates[0])) return;
    const firstOpen = dates.findIndex((d) => isWorkingDay(availabilityNote, d));
    if (firstOpen > 0) setDayOffset(firstOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityNote]);

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const DAILY_APPOINTMENT_LIMIT = 5;
  const aptsTodayCount = customerAppointments.filter(
    (apt) =>
      apt.status !== "CANCELLED" &&
      apt.status !== "REJECTED" &&
      // A reschedule replaces the original booking, so the very booking being
      // moved must not count against the daily limit and block its own move.
      apt.id !== rescheduledFromId &&
      isSameDay(new Date(apt.scheduledForISO), selectedDate)
  ).length;
  const hasAptToday = aptsTodayCount >= DAILY_APPOINTMENT_LIMIT;

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
    setPhotoPreview(null);
  }

  const deliveryAddressReady = fulfillmentType !== "DELIVERY" || (deliveryAddressLine.trim().length > 2 && deliveryLat !== null && deliveryLng !== null);

  async function handleConfirm() {
    if (!selectedSlot) {
      showToast("Please select a time slot");
      return;
    }
    if (!deliveryAddressReady) {
      showToast("Add your delivery address to continue");
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

      const created = await appointmentService.create({
        targetId,
        targetName,
        targetType,
        customerId: user.id || "guest",
        customerName: safeName(user.name, "Customer"),
        customerAvatar: user.avatar,
        scheduledForISO: selectedSlot.isoTimestamp,
        dateLabel: selectedSlot.dateLabel,
        timeLabel: selectedSlot.timeLabel,
        notes: notes.trim() || undefined,
        photoUrl: uploadedUrl,
        packageId: selectedPkg?.id,
        packageName: selectedPkg?.name,
        packagePrice: selectedPkg?.price,
        items,
        rescheduledFrom: rescheduledFromId ?? null,
        fulfillmentType: canOfferDelivery ? fulfillmentType : "IN_STORE",
        deliveryAddressLine: canOfferDelivery && fulfillmentType === "DELIVERY" ? deliveryAddressLine.trim() : undefined,
        deliveryLat: canOfferDelivery && fulfillmentType === "DELIVERY" ? deliveryLat ?? undefined : undefined,
        deliveryLng: canOfferDelivery && fulfillmentType === "DELIVERY" ? deliveryLng ?? undefined : undefined,
        requestedDeliveryWindow:
          canOfferDelivery && fulfillmentType === "DELIVERY" && requestedWindow.trim()
            ? requestedWindow.trim()
            : undefined,
        partySize: canPickParty ? partySize : undefined,
        targetPackageKey,
      });

      showToast(
        isReschedule
          ? `Rescheduled to ${selectedSlot.dateLabel} at ${selectedSlot.timeLabel} 🔄`
          : `${vocabulary.bookedVerb} for ${selectedSlot.dateLabel} at ${selectedSlot.timeLabel} 📅`
      );

      if (paymentTiming === "AT_BOOKING") {
        // Pay now, before the seller can accept — sheet hands off to PaymentSheet below.
        setBookedAppointment(created);
      } else {
        onBooked?.();
        onClose();
      }
    } catch (err: any) {
      const msg: string = err?.message || `Couldn't complete your ${vocabulary.noun}. Try again.`;
      showToast(msg);
      // Someone took the last spots between load and confirm. Refresh usage in
      // place so the grid tells the truth and the customer can pick again,
      // rather than leaving them staring at a slot that looks free.
      if (/just went|fully booked|just taken|spots/i.test(msg)) {
        await refreshSlotUsage();
        setSelectedSlot(null);
      }
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  }

  if (bookedAppointment) {
    return (
      <PaymentSheet
        appointment={bookedAppointment}
        businessUpiId={payeeUpiId}
        businessName={targetName}
        depositPercent={depositPercent}
        vocabulary={vocabulary}
        onPaid={() => {
          onBooked?.();
          onClose();
        }}
        onClose={() => {
          onBooked?.();
          onClose();
        }}
      />
    );
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
          padding: "20px 20px calc(20px + var(--safe-area-bottom))",
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
              {isReschedule ? `🔄 ${vocabulary.sheetTitleReschedule}` : `📅 ${vocabulary.sheetTitleNew}`}
            </div>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              {isReschedule ? "Pick a new slot with " : "Book a slot with "}
              <strong style={{ color: "var(--brand-700)" }}>{targetName}</strong>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Reschedule mode — reference card showing what's being replaced. */}
        {isReschedule && rescheduledFromLabel && (
          <div className="card card-condensed" style={{ background: "var(--ink-50)", border: "1px solid var(--ink-200)", marginBottom: 16 }}>
            <div className="row gap-8 center-v">
              <CalendarIcon size={16} color="var(--ink-500)" />
              <div>
                <div className="tiny semi muted">Currently booked</div>
                <div className="bold small" style={{ color: "var(--ink-700)", marginTop: 1 }}>
                  {rescheduledFromLabel.dateLabel} at {rescheduledFromLabel.timeLabel}
                </div>
              </div>
            </div>
          </div>
        )}

        {outOfRange && (
          <div className="card card-condensed" style={{ background: "var(--red-50)", border: "1px solid var(--red-100)", marginBottom: 16 }}>
            <div className="row gap-8" style={{ alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, lineHeight: 1.2 }}>⚠️</span>
              <div>
                <div className="bold small" style={{ color: "var(--red-600)" }}>Outside service area</div>
                <div className="tiny" style={{ color: "var(--red-600)", marginTop: 1, lineHeight: 1.5 }}>
                  You&apos;re outside this {targetType === "BUSINESS" ? "business" : "provider"}&apos;s service area, so booking here isn&apos;t available. Move closer, or contact them directly.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Slot data failed to load — the grid below may be missing occupied slots. */}
        {loadError && (
          <div className="card card-condensed" style={{ background: "var(--red-50)", border: "1px solid var(--red-100)", marginBottom: 16 }}>
            <div className="row gap-8" style={{ alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, lineHeight: 1.2 }}>⚠️</span>
              <div>
                <div className="bold small" style={{ color: "var(--red-600)" }}>Couldn't load current availability</div>
                <div className="tiny" style={{ color: "var(--red-600)", marginTop: 1, lineHeight: 1.5 }}>
                  Some slots shown as open may already be taken. Close and reopen to try again, or book carefully.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Availability info card */}
        {availableNow ? (
          <div className="card card-condensed" style={{ background: "var(--green-100)", border: "1px solid var(--green-500)", marginBottom: 16 }}>
            <div className="row gap-8 center-v">
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--green-500)", boxShadow: "0 0 0 3px rgba(22,163,74,0.18)" }} />
              <div>
                <div className="bold small" style={{ color: "var(--green-600)" }}>Available now</div>
                <div className="tiny" style={{ color: "var(--green-700)", marginTop: 1 }}>Pick the earliest slot below — they can take you right away.</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card card-condensed" style={{ background: "var(--brand-50)", border: "1px solid var(--brand-100)", marginBottom: 16 }}>
            <div className="row gap-8 center-v">
              <Clock size={16} color="var(--brand-700)" />
              <div>
                <div className="tiny semi muted">Working Hours Schedule</div>
                <div className="bold small" style={{ color: "var(--brand-800)", marginTop: 1 }}>
                  {formatHoursForDisplay(availabilityNote || DEFAULT_WORKING_HOURS)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fulfillment — visit the store, or have it delivered home */}
        {canOfferDelivery && (
          <div className="field" style={{ marginBottom: 16 }}>
            <label className="tiny semi muted" style={{ display: "block", marginBottom: 8 }}>
              How would you like this?
            </label>
            <div className="row gap-8">
              <button
                type="button"
                onClick={() => setFulfillmentType("IN_STORE")}
                className="row gap-8 center grow"
                style={{
                  padding: "12px 10px", borderRadius: 12,
                  border: fulfillmentType === "IN_STORE" ? "2px solid var(--brand-600)" : "1px solid var(--ink-200)",
                  background: fulfillmentType === "IN_STORE" ? "var(--brand-50)" : "#fff",
                  color: fulfillmentType === "IN_STORE" ? "var(--brand-800)" : "var(--ink-700)",
                  fontWeight: 600, fontSize: 13,
                }}
              >
                <Store size={16} /> Visit the store
              </button>
              <button
                type="button"
                onClick={() => setFulfillmentType("DELIVERY")}
                className="row gap-8 center grow"
                style={{
                  padding: "12px 10px", borderRadius: 12,
                  border: fulfillmentType === "DELIVERY" ? "2px solid var(--delivery-600)" : "1px solid var(--ink-200)",
                  background: fulfillmentType === "DELIVERY" ? "var(--delivery-50)" : "#fff",
                  color: fulfillmentType === "DELIVERY" ? "var(--delivery-600)" : "var(--ink-700)",
                  fontWeight: 600, fontSize: 13,
                }}
              >
                <Package size={16} /> Home delivery
              </button>
            </div>

            {fulfillmentType === "DELIVERY" && (
              <div className="col gap-8" style={{ marginTop: 12 }}>
                {deliveryTime && (
                  <div className="tiny" style={{ color: "var(--delivery-600)" }}>
                    Usually delivered in {deliveryTime}.
                  </div>
                )}
                <input
                  className="input"
                  placeholder="Flat / house no., street, landmark"
                  value={deliveryAddressLine}
                  onChange={(e) => setDeliveryAddressLine(e.target.value)}
                  style={{ fontSize: 13 }}
                />
                <LocationPicker lat={deliveryLat} lng={deliveryLng} onChange={(lat, lng) => { setDeliveryLat(lat); setDeliveryLng(lng); }} height={140} pinColor="var(--delivery-600)" />
                <span className="tiny muted">Tap the map or drag the pin to mark exactly where the agent should come.</span>
                {/* Optional: the customer's half of the two-way ETA. The shop
                    confirms (or overrides) this with a real ETA on acceptance. */}
                <input
                  className="input"
                  placeholder="Preferred time, e.g. before 6pm (optional)"
                  value={requestedWindow}
                  maxLength={60}
                  onChange={(e) => setRequestedWindow(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>
            )}
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
                      padding: "var(--space-sm)", borderRadius: 12, textAlign: "left",
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
              const working = isWorkingDay(availabilityNote, d);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={!working}
                  onClick={() => {
                    setDayOffset(idx);
                    setSelectedSlot(null);
                  }}
                  className={`chip ${isSelected ? "active" : ""}`}
                  style={{
                    flexShrink: 0,
                    padding: "8px 14px",
                    borderRadius: "var(--radius)",
                    fontSize: 13,
                    fontWeight: isSelected ? 700 : 500,
                    opacity: working ? 1 : 0.4,
                  }}
                >
                  <CalendarIcon size={13} style={{ marginRight: 4 }} /> {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Daily limit warning */}
        {hasAptToday && (
          <div className="card card-condensed" style={{ background: "var(--red-50)", border: "1px solid var(--red-100)", marginBottom: 16 }}>
            <div className="row gap-8 center-v">
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div>
                <div className="bold small" style={{ color: "var(--red-600)" }}>Daily {vocabulary.nounCap} Limit Hit</div>
                <div className="tiny" style={{ color: "var(--red-600)", marginTop: 1 }}>
                  You've reached the limit of {DAILY_APPOINTMENT_LIMIT} {vocabulary.nounPlural} for this day. Please pick another date.
                </div>
              </div>
            </div>
          </div>
        )}

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
                gap: "var(--space-xs)",
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
                gap: "var(--space-xs)",
                maxHeight: 180,
                overflowY: "auto",
                paddingRight: 2,
              }}
            >
              {slots.map((s) => {
                const isSelected = selectedSlot?.id === s.id;
                // Only surface a count when it's actually informative: a
                // capacity-1 business (the norm) should look exactly as before,
                // and a half-empty slot doesn't need a number either.
                const showRemaining = s.capacity > 1 && s.isAvailable && s.remaining <= 3;
                const scarce = showRemaining && s.remaining === 1;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!s.isAvailable}
                    onClick={() => setSelectedSlot(s)}
                    style={{
                      padding: showRemaining ? "7px 8px" : "10px 8px",
                      borderRadius: 12,
                      border: isSelected
                        ? "2px solid var(--brand-600)"
                        : scarce
                        ? "1px solid var(--amber-500)"
                        : "1px solid var(--ink-200)",
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
                      flexDirection: showRemaining ? "column" : "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: showRemaining ? 1 : "var(--space-xxs)",
                      lineHeight: 1.15,
                    }}
                  >
                    <span className="row center-v" style={{ gap: 3 }}>
                      {isSelected && <Check size={13} color="var(--brand-600)" />}
                      {s.timeLabel}
                    </span>
                    {showRemaining && (
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: scarce ? "var(--amber-600)" : "var(--ink-400)" }}>
                        {s.remaining} left
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Party size — only when the chosen service actually allows more than
            one spot per booking, so a normal 1:1 service shows nothing. */}
        {canPickParty && (
          <div className="field" style={{ marginBottom: 16 }}>
            <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>
              How many spots?
            </label>
            <div className="row gap-12 center-v">
              <div className="row center-v" style={{ border: "1px solid var(--ink-200)", borderRadius: 12, overflow: "hidden" }}>
                <button
                  type="button"
                  aria-label="Fewer spots"
                  disabled={partySize <= 1}
                  onClick={() => { haptics.selection(); setPartySize((n) => Math.max(1, n - 1)); }}
                  style={{ width: 42, height: 40, fontSize: 20, fontWeight: 600, color: partySize <= 1 ? "var(--ink-300)" : "var(--ink-700)" }}
                >
                  −
                </button>
                <span className="semi" style={{ minWidth: 34, textAlign: "center", fontSize: 15 }}>{partySize}</span>
                <button
                  type="button"
                  aria-label="More spots"
                  disabled={partySize >= partyCeiling}
                  onClick={() => { haptics.selection(); setPartySize((n) => Math.min(partyCeiling, n + 1)); }}
                  style={{ width: 42, height: 40, fontSize: 20, fontWeight: 600, color: partySize >= partyCeiling ? "var(--ink-300)" : "var(--ink-700)" }}
                >
                  +
                </button>
              </div>
              <div className="tiny muted">
                {selectedSlot
                  ? `${selectedSlot.remaining} of ${selectedSlot.capacity} left at ${selectedSlot.timeLabel}`
                  : `Up to ${maxPartySize} per booking`}
              </div>
            </div>
          </div>
        )}

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
              <img src={photoPreview} alt={`${vocabulary.nounCap} Reference`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                gap: "var(--space-xs)",
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

        {/* Pay-at-booking notice */}
        {paymentTiming === "AT_BOOKING" && !hasAptToday && (
          <div className="tiny muted center" style={{ marginBottom: 10 }}>
            This seller requires payment upfront — you'll pay right after confirming.
          </div>
        )}

        {/* Confirm Action Button */}
        <button
          type="button"
          className={hasAptToday ? "btn btn-outline btn-block btn-lg" : "btn btn-green btn-block btn-lg"}
          disabled={!selectedSlot || submitting || uploading || hasAptToday || !deliveryAddressReady || outOfRange}
          onClick={handleConfirm}
          style={{ height: 48, fontSize: 15, fontWeight: 700 }}
        >
          {submitting || uploading
            ? "Booking & Uploading..."
            : outOfRange
            ? "Outside Service Area"
            : hasAptToday
            ? "Daily Limit Exceeded"
            : selectedSlot
            ? paymentTiming === "AT_BOOKING"
              ? `Confirm & Pay for ${selectedSlot.timeLabel}`
              : isReschedule
              ? `Reschedule to ${selectedSlot.timeLabel}`
              : `Confirm Booking for ${selectedSlot.timeLabel}`
            : "Select a Time Slot"}
        </button>
      </div>
    </div>
  );
}
