import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { businessService, bustBusinessGetCache, profileControlService, uploadService, userService } from "@/services";
import { useQuery, invalidateQueryCache } from "@/hooks/useApi";
import { ErrorView } from "@/components/states";
import { SettingsSection, SettingsRow, SettingsToggleRow } from "@/components/settings";
import { BadgeCheck, UserPlus, X, Image as ImageIcon, Trash2 } from "@/components/Icons";
import { useApp } from "@/store";
import ManageNav from "./ManageNav";
import { resolvePackage, BUSINESS_PACKAGES, PACKAGE_KEYS, type BusinessPackageKey } from "@/lib/businessPackages";

export default function BusinessSettings() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast, setContext, user, refreshUser } = useApp();
  // #5 — delete flow state. Typed confirmation, not a yes/no: this is the one
  // action on this screen that removes the shop from the app.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { data: business, refetch: refetchBiz } = useQuery(() => businessService.get(id), [id], `business:${id}`);
  const [ownerEnabled, setOwnerEnabled] = useState(true);
  const [accepting, setAccepting] = useState(true);
  // "New leads"/"New reviews" have no notification-emission trigger yet (no
  // insert into public.notifications is fired by the leads or ratings
  // tables) — localStorage-only until that trigger exists. "Matching
  // requests", below, is different: it already fires server-side via
  // NEARBY_REQUEST/notif_nearby_requests, so it's wired to the real column.
  const [leads, setLeads] = useState(() => localStorage.getItem("biz_notif_leads") !== "false");
  const [reviewsN, setReviewsN] = useState(() => localStorage.getItem("biz_notif_reviews") !== "false");
  useEffect(() => { localStorage.setItem("biz_notif_leads", String(leads)); }, [leads]);
  useEffect(() => { localStorage.setItem("biz_notif_reviews", String(reviewsN)); }, [reviewsN]);
  const [requests, setRequests] = useState(user.notifNearbyRequests !== false);
  useEffect(() => { setRequests(user.notifNearbyRequests !== false); }, [user.notifNearbyRequests]);
  const [upiId, setUpiId] = useState("");
  const [savingUpi, setSavingUpi] = useState(false);
  const [email, setEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [locPublic, setLocPublic] = useState(false);
  const [customQrUrl, setCustomQrUrl] = useState(() => localStorage.getItem("stryt_upi_qr_" + id) || "");
  const [uploadingQr, setUploadingQr] = useState(false);
  const [paymentTiming, setPaymentTiming] = useState<"AT_BOOKING" | "AT_APPOINTMENT">("AT_APPOINTMENT");
  const [savingTiming, setSavingTiming] = useState(false);
  const [depositPercent, setDepositPercent] = useState("0");
  const [savingDeposit, setSavingDeposit] = useState(false);
  const [defaultCapacity, setDefaultCapacity] = useState("1");
  const [ceiling, setCeiling] = useState("");
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [defaultEta, setDefaultEta] = useState("");
  const [savingEta, setSavingEta] = useState(false);
  const [packagePicking, setPackagePicking] = useState(false);
  const [bookingsOn, setBookingsOn] = useState(true);

  function persistMatchingRequests(v: boolean) {
    setRequests(v);
    userService.update({ notifNearbyRequests: v } as any)
      .then(() => showToast(v ? "You'll hear about matching requests" : "Matching-request alerts off"))
      .catch(() => {
        setRequests(!v);
        showToast("Couldn't save — try again");
      });
  }

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
      setAccepting(business.isOpenNow !== false);
      setUpiId(business.upiId ?? "");
      setEmail(business.email ?? "");
      setShowPhone(business.showPhonePublicly !== false);
      setShowEmail(business.showEmailPublicly === true);
      setLocPublic(business.locationPublic === true);
      setPaymentTiming(business.paymentTiming === "AT_BOOKING" ? "AT_BOOKING" : "AT_APPOINTMENT");
      setDepositPercent(String((business as any).depositPercent ?? 0));
      setDeliveryEnabled(business.deliveryEnabled === true);
      setDefaultEta(business.deliveryTime ?? "");
      setDefaultCapacity(String(business.defaultSlotCapacity ?? 1));
      setCeiling(business.maxConcurrentBookings != null ? String(business.maxConcurrentBookings) : "");
      // bookingsEnabled null means "inherit the resolved package's own
      // default" — resolve it once here rather than showing a toggle in an
      // ambiguous third state.
      setBookingsOn(business.bookingsEnabled ?? BUSINESS_PACKAGES[resolvePackage(business)].bookingsDefault);
    }
  }, [business]);

  const pkg = BUSINESS_PACKAGES[business ? resolvePackage(business) : "generic"];

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Settings" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

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

  async function savePaymentTiming(v: "AT_BOOKING" | "AT_APPOINTMENT") {
    const prev = paymentTiming;
    setPaymentTiming(v);
    setSavingTiming(true);
    try {
      await businessService.update(id, { paymentTiming: v } as any);
      void refetchBiz();
    } catch {
      setPaymentTiming(prev);
      showToast("Couldn't save — try again");
    } finally {
      setSavingTiming(false);
    }
  }

  async function saveDepositPercent() {
    const n = Math.max(0, Math.min(100, Math.round(Number(depositPercent) || 0)));
    setDepositPercent(String(n));
    setSavingDeposit(true);
    try {
      await businessService.update(id, { depositPercent: n } as any);
      showToast("Deposit saved");
      void refetchBiz();
    } catch {
      showToast("Couldn't save — try again");
    } finally {
      setSavingDeposit(false);
    }
  }

  async function saveCapacity() {
    setSavingCapacity(true);
    try {
      await businessService.update(id, {
        defaultSlotCapacity: Math.max(1, Number(defaultCapacity) || 1),
        maxConcurrentBookings: ceiling.trim() ? Math.max(1, Number(ceiling) || 1) : null,
      } as any);
      showToast("Booking capacity saved");
      void refetchBiz();
    } catch {
      showToast("Couldn't save — try again");
    } finally {
      setSavingCapacity(false);
    }
  }

  async function toggleDelivery(v: boolean) {
    setDeliveryEnabled(v);
    try {
      await businessService.update(id, { deliveryEnabled: v } as any);
      showToast(v ? "Home delivery is on — customers can now order delivery" : "Home delivery turned off");
      void refetchBiz();
    } catch {
      setDeliveryEnabled(!v); // optimistic + revert, per the app-wide write pattern
      showToast("Couldn't save — try again");
    }
  }

  async function saveDefaultEta() {
    setSavingEta(true);
    try {
      await businessService.update(id, { deliveryTime: defaultEta.trim() || null } as any);
      showToast("Typical delivery time saved");
      void refetchBiz();
    } catch {
      showToast("Couldn't save — try again");
    } finally {
      setSavingEta(false);
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

  async function savePackage(key: BusinessPackageKey) {
    setPackagePicking(false);
    try {
      await businessService.update(id, { packageKey: key } as any);
      showToast(`Page type set to ${BUSINESS_PACKAGES[key].label}`);
      void refetchBiz();
    } catch {
      showToast("Couldn't save — try again");
    }
  }

  async function toggleBookingsEnabled(v: boolean) {
    setBookingsOn(v);
    try {
      await businessService.update(id, { bookingsEnabled: v } as any);
      showToast(v ? "Bookings are on for this page" : "Bookings are off — your page shows products/services only, no booking button");
      void refetchBiz();
    } catch {
      setBookingsOn(!v);
      showToast("Couldn't save — try again");
    }
  }

  async function toggleAccepting(v: boolean) {
    setAccepting(v);
    try {
      await businessService.update(id, { isOpenNow: v } as any);
      showToast(v ? "Now accepting appointments" : "Paused — customers can't book new appointments");
      invalidateQueryCache(`business:${id}`, () => bustBusinessGetCache(id));
      void refetchBiz();
    } catch (err: any) {
      setAccepting(!v);
      showToast(err?.message || "Couldn't save — try again");
    }
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Business settings" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 20 }}>

        <SettingsSection title="Visibility">
          <SettingsToggleRow label="Show business publicly" on={ownerEnabled} onChange={handleToggleVisibility} />
        </SettingsSection>

        {/* Business Packages — the choice made visible and changeable for
            good, not just a one-time onboarding moment (PackageConfirmCard). */}
        <SettingsSection title="Page type">
          <SettingsRow
            icon={<span style={{ fontSize: 18, lineHeight: 1 }}>{pkg.icon || "🏪"}</span>}
            label="Page type"
            hint="Controls your page's layout, CTA wording, and catalogue form"
            value={pkg.label}
            onClick={() => setPackagePicking(true)}
          />
          <SettingsToggleRow
            label="Take bookings"
            hint={bookingsOn ? "Your page shows a booking button" : "No booking button — products/services only"}
            on={bookingsOn}
            onChange={toggleBookingsEnabled}
          />
        </SettingsSection>

        <SettingsSection title="Notifications">
          <SettingsToggleRow label="New leads" on={leads} onChange={setLeads} />
          <SettingsToggleRow label="New reviews" on={reviewsN} onChange={setReviewsN} />
          <SettingsToggleRow
            label="Matching requests"
            hint="Also controls your personal 'Nearby requests' alerts"
            on={requests}
            onChange={persistMatchingRequests}
          />
        </SettingsSection>

        {/* Accepting appointments — the real "pause bookings" control (businesses.is_open_now).
            Mirrored on the manage dashboard front door for one-tap access; this is the
            fuller settings-page home for it, alongside the rest of the booking controls. */}
        <SettingsSection title="Appointments">
          <SettingsToggleRow
            label="Accepting appointments"
            hint={accepting ? "Customers can book you right now" : "Paused — new bookings are turned off"}
            on={accepting}
            onChange={toggleAccepting}
          />
        </SettingsSection>

        {/* Booking capacity — how many bookings can share one time slot. 1 is
            the classic one-at-a-time rule; per-service overrides live on each
            catalogue item. */}
        <div>
          <div className="profile-eyebrow">Booking capacity</div>
          <div className="card col gap-12" style={{ padding: 14 }}>
            <div>
              <div className="tiny semi" style={{ marginBottom: 4 }}>Default bookings per time slot</div>
              <div className="tiny muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>
                How many customers you can serve at the same time. Individual services can override this in your catalogue.
              </div>
              <input
                className="input"
                inputMode="numeric"
                value={defaultCapacity}
                onChange={(e) => setDefaultCapacity(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="1"
              />
            </div>
            <div>
              <div className="tiny semi" style={{ marginBottom: 4 }}>Overall limit at one time (optional)</div>
              <div className="tiny muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>
                A hard cap across <em>all</em> services combined — useful when different services share the same space or staff. Leave blank for no overall limit.
              </div>
              <input
                className="input"
                inputMode="numeric"
                value={ceiling}
                onChange={(e) => setCeiling(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="No limit"
              />
            </div>
            <button className="btn btn-outline btn-sm" disabled={savingCapacity} onClick={saveCapacity}>
              {savingCapacity ? "Saving…" : "Save capacity"}
            </button>
          </div>
        </div>

        {/* Home delivery — opt-in. Off means the delivery option never appears
            in the booking sheet for this shop (enforced server-side too). */}
        <SettingsSection title="Home delivery">
          <SettingsToggleRow
            label="Offer home delivery"
            hint="Lets customers choose delivery instead of visiting, and send their address at booking"
            on={deliveryEnabled}
            onChange={toggleDelivery}
          />
          {deliveryEnabled && (
            <div style={{ padding: "13px 14px", borderTop: "1px solid var(--line)" }}>
              <div className="tiny semi" style={{ marginBottom: 4 }}>Typical delivery time</div>
              <div className="tiny muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>
                Shown to customers as a guide. You still confirm an exact ETA when you accept each order.
              </div>
              <div className="row gap-8">
                <input
                  className="input grow"
                  placeholder="e.g. 30–45 min"
                  value={defaultEta}
                  maxLength={40}
                  onChange={(e) => setDefaultEta(e.target.value)}
                />
                <button className="btn btn-outline btn-sm" disabled={savingEta} onClick={saveDefaultEta}>
                  {savingEta ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </SettingsSection>

        {/* Payment */}
        <div>
          <div className="profile-eyebrow">Payment</div>
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
                      border: paymentTiming === t ? "2px solid var(--brand-600)" : "1.5px solid var(--ink-200)",
                      background: paymentTiming === t ? "var(--brand-50)" : "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                      color: paymentTiming === t ? "var(--brand-700)" : "var(--ink-500)",
                    }}
                    onClick={() => savePaymentTiming(t)}
                  >
                    {t === "AT_BOOKING" ? "At booking" : "At appointment"}
                  </button>
                ))}
              </div>

              {/* Deposit % — only meaningful when payment is collected upfront. */}
              {paymentTiming === "AT_BOOKING" && (
                <div style={{ marginTop: 12 }}>
                  <div className="tiny semi" style={{ marginBottom: 4 }}>Upfront deposit (%)</div>
                  <div className="tiny muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>
                    Upfront deposit (%) — rest collected at the appointment. 0 = full amount up front.
                  </div>
                  <div className="row gap-8">
                    <input
                      className="input grow"
                      inputMode="numeric"
                      placeholder="0"
                      value={depositPercent}
                      onChange={(e) => setDepositPercent(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                      style={{ fontSize: 14 }}
                    />
                    <button className="btn btn-outline btn-sm" disabled={savingDeposit} onClick={saveDepositPercent}>
                      {savingDeposit ? "…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contact & privacy — control what customers can see */}
        <SettingsSection title="Contact & privacy">
          <div style={{ padding: "13px 14px" }}>
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
          <SettingsToggleRow label="Show phone publicly" on={showPhone} onChange={(v) => { setShowPhone(v); persist({ showPhonePublicly: v }); }} />
          <SettingsToggleRow label="Show email publicly" on={showEmail} onChange={(v) => { setShowEmail(v); persist({ showEmailPublicly: v }); }} />
          <SettingsToggleRow label="Exact location public" hint="OFF = customers must request & you approve" on={locPublic} onChange={(v) => { setLocPublic(v); persist({ locationPublic: v }); }} />
        </SettingsSection>

        <SettingsSection title="Account">
          <SettingsRow icon={<UserPlus size={18} />} label="Team & access" hint="Add team members with scoped access" onClick={() => nav("/account/business-access")} />
          <SettingsRow icon={<BadgeCheck size={18} />} label="Verification" hint="Documents and badge status" onClick={() => nav(`/business/${id}/manage/verify`)} />
        </SettingsSection>

        <button className="btn btn-ghost btn-block" onClick={() => { setContext({ type: "customer", id: null, name: "Personal" }); nav("/home"); }}>
          Exit business mode
        </button>

        {/* Feedback #5 — there was no way to delete a business at all.
            Owner-only, last on the page, and behind a typed confirmation:
            this is the single most destructive thing an owner can do here. */}
        <SettingsSection title="Danger zone">
          <SettingsRow
            icon={<Trash2 size={18} color="var(--red-600)" />}
            label="Delete this business"
            hint="Removes it from STRYT. Past bookings are kept."
            onClick={() => setDeleteOpen(true)}
          />
        </SettingsSection>

        {deleteOpen && (
          <div className="overlay" onClick={() => !deleting && setDeleteOpen(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grab" />
              <h3 className="bold h2" style={{ marginBottom: 4 }}>Delete {business?.name || "this business"}?</h3>
              <p className="small muted" style={{ marginBottom: 14 }}>
                It disappears from search, the map and nearby feeds, and your team loses access.
                Bookings customers already have with you are kept, so nobody loses their history.
                This can't be undone from the app.
              </p>
              <label className="tiny semi" style={{ display: "block", marginBottom: 6 }}>
                Type <b>DELETE</b> to confirm
              </label>
              <input
                className="input"
                value={deleteConfirm}
                disabled={deleting}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
              <button
                className="btn btn-block"
                style={{ marginTop: 14, height: 48, background: deleteConfirm.trim().toUpperCase() === "DELETE" ? "var(--red-500)" : "var(--ink-200)", color: "#fff", fontWeight: 700 }}
                disabled={deleting || deleteConfirm.trim().toUpperCase() !== "DELETE"}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await businessService.delete(id);
                    showToast("Business deleted");
                    setContext({ type: "customer", id: null, name: "Personal" });
                    await refreshUser();
                    nav("/home");
                  } catch (e: any) {
                    // Surfaces the server's own reason — e.g. "You have 3
                    // upcoming booking(s)" — which is actionable, unlike a
                    // generic failure.
                    showToast(e?.message || "Couldn't delete this business");
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
              <button
                className="btn btn-block"
                style={{ marginTop: 8, height: 44, background: "transparent", color: "var(--ink-600)" }}
                disabled={deleting}
                onClick={() => setDeleteOpen(false)}
              >
                Keep my business
              </button>
            </div>
          </div>
        )}

        {packagePicking && (
          <div className="overlay" onClick={() => setPackagePicking(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grab" />
              <h3 className="bold h2" style={{ marginBottom: 4 }}>Choose your page type</h3>
              <p className="small muted" style={{ marginBottom: 14, lineHeight: 1.5 }}>
                Controls your page's layout, CTA wording, and the owner-side catalogue form.
              </p>
              <div className="col gap-8">
                {PACKAGE_KEYS.map((key) => {
                  const p = BUSINESS_PACKAGES[key];
                  const active = pkg.key === key;
                  return (
                    <button
                      key={key}
                      className="card row gap-10"
                      style={{ padding: 12, alignItems: "flex-start", textAlign: "left", border: active ? "2px solid var(--brand-600)" : "1px solid var(--line)" }}
                      onClick={() => savePackage(key)}
                    >
                      <span style={{ fontSize: 22, lineHeight: 1 }}>{p.icon || "🏪"}</span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="semi small" style={{ display: "block" }}>{key === "generic" ? "Plain page" : p.label}</span>
                        <span className="tiny muted" style={{ display: "block", marginTop: 2, lineHeight: 1.4 }}>{p.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
      <ManageNav bizId={id} />
    </div>
  );
}
