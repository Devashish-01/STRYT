import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { catalogService, businessService, uploadService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Camera, Phone, Calendar, CheckCircle2, FileCheck, Store, Clock, X, Plus, Check, Mail } from "@/components/Icons";
import { useApp } from "@/store";
import LocationPicker from "@/components/LocationPicker";
import RadiusSelector from "@/components/RadiusSelector";
import WeeklyHoursEditor from "@/components/WeeklyHoursEditor";
import { DEFAULT_ONBOARD_DAYS_PATTERN, DEFAULT_START_TIME, DEFAULT_ONBOARD_END_TIME, expandPatternToWeekly, serializeHoursValue, evaluateProviderAvailability } from "@/utils/availability";

import { reverseGeocodeFull } from "@/lib/geocode";
import { getBusinessTheme, BUSINESS_PACKAGES, type BusinessPackageKey } from "@/lib/businessPackages";
import { PackageConfirmCard } from "@/components/PackageConfirmCard";
import { OnboardBookingsToggle } from "@/components/OnboardBookingsToggle";
import { useFormDraft } from "@/hooks/useFormDraft";

const steps = ["Basics", "Location", "Photos", "Contact"];

/** Cap on a single shop photo. A modern phone camera writes 8–15 MB files and
 *  the upload used to fail with no message at all, so the owner just saw a
 *  photo that never appeared. Also the only thing standing between a slow
 *  connection and a submit that appears to hang. */
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
/** Businesses per owner. Mirrors trg_enforce_business_owner_limit, which is the
 *  real boundary — this is only so the cap is met before 15 minutes of typing
 *  rather than after. */
const MAX_BUSINESSES_PER_OWNER = 5;

// Bounds for the opening-date picker, as YYYY-MM-DD (what <input type="date">
// expects, and what Postgres accepts unambiguously for a `date` column —
// no locale guessing about 03/04/2026).
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** Long-established shops exist; 50 years covers them without allowing typos like 1066. */
const OPENING_DATE_MIN = isoDay(new Date(Date.now() - 50 * 365 * 24 * 60 * 60 * 1000));
/** You can pre-register a shop that's opening soon, but not one opening in 2099. */
const OPENING_DATE_MAX = isoDay(new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000));

export default function BusinessOnboard() {
  const nav = useNavigate();
  const { user, addRole, showToast, refreshUser, isAuthed, authReady, setContext, ownedBusinessIds, ownedEntitiesLoaded } = useApp();
  const { data: categories, loading: catLoading, error: catError, refetch: refetchCats } = useQuery(() => catalogService.getCategories("BUSINESS"), [], "categories:BUSINESS");
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  // #15 — the provider flow has always let someone propose a missing category;
  // a shop owner whose trade wasn't in the list had no option at all and had to
  // file themselves under something wrong.
  const [newCat, setNewCat] = useState("");
  const [sub, setSub] = useState<string[]>([]);
  // #12 — `businesses.description` exists, BusinessDetail renders it at the top
  // of the page, and ProfileEditor can edit it. Onboarding just never asked, so
  // every new shop went live with a blank About section.
  const [description, setDescription] = useState("");
  const [broadcastRadius, setBroadcastRadius] = useState(5);
  const [address, setAddress] = useState("");
  // Deliberately blank, not "Pune". It's filled from the location picker's
  // reverse-geocode (below) and is editable. Hardcoding a default meant a shop
  // whose geocode failed — or whose owner never touched the field — was filed
  // under Pune regardless of where it actually is. Harmless while Pune was the
  // only market; wrong the moment Bangalore is in scope, and city is what
  // discovery and the admin review both read.
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  // Same per-day, multi-shift editor as the real Hours page (HoursEditor.tsx) â€”
  // so what's set at onboarding is the exact control the owner will edit later,
  // not a coarser preset picker that forces an immediate follow-up trip to Settings.
  const [hoursRaw, setHoursRaw] = useState(() =>
    serializeHoursValue(expandPatternToWeekly(DEFAULT_ONBOARD_DAYS_PATTERN, DEFAULT_START_TIME, DEFAULT_ONBOARD_END_TIME, 30))
  );
  const [photos, setPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const [phone, setPhone] = useState("");
  // #13 — WhatsApp is how most local commerce here actually gets done, and both
  // columns already existed on the table. Defaulted to the contact number,
  // which is the true answer for nearly every shop.
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappSame, setWhatsappSame] = useState(true);
  const [email, setEmail] = useState("");
  const [openDate, setOpenDate] = useState("");
  const [offer, setOffer] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  // #9 — the reverse geocode fired on every pin nudge and overwrote City and
  // Pincode unconditionally, wiping a correction the owner had just typed by
  // hand. Once either field is touched it belongs to them; the geocode only
  // fills what's still untouched.
  const cityTouched = useRef(false);
  const pincodeTouched = useRef(false);
  // #21 — every URL uploaded during this attempt, so a failed create can take
  // its orphans with it instead of leaving them paid-for in storage forever.
  const uploadedRef = useRef<string[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // #1 — a signed-out visitor could fill in all four steps and only discover
  // it at submit, as a 401 with no route back. Bounced at the door, carrying a
  // return path so signing in resumes here.
  useEffect(() => {
    if (authReady && !isAuthed) {
      nav("/auth/phone", { replace: true, state: { next: "/onboard/business" } });
    }
  }, [authReady, isAuthed, nav]);

  // #2 — the cap is enforced by a BEFORE INSERT trigger, so without this the
  // sixth business failed on submit, after the photos had already uploaded.
  const atBusinessCap = ownedEntitiesLoaded && ownedBusinessIds.length >= MAX_BUSINESSES_PER_OWNER;

  // #6 — object URLs are leaked otherwise: each preview pins its full-size file
  // in memory for the life of the document.
  useEffect(() => () => {
    photos.forEach((ph) => URL.revokeObjectURL(ph.previewUrl));
  }, [photos]);

  function addPhoto(file: File) {
    // #6 — both of these used to be unchecked, and Supabase's rejection was
    // swallowed, so an oversized or unsupported file simply never appeared.
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      showToast("That file isn't an image we can use — try a JPG or PNG.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      showToast(`That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB.`);
      return;
    }
    setPhotos((prev) => [...prev, { file, previewUrl: URL.createObjectURL(file) }]);
  }

  const cats = (categories ?? []).sort((a, b) => a.slug === "other" ? 1 : b.slug === "other" ? -1 : 0);
  const selectedCat = cats.find((c) => c.id === cat);
  // Business Packages — the suggested package, recomputed live as
  // sub-category chips are toggled, same [subCategory, categoryName]
  // precedence used everywhere else this is resolved. Pure derivation here
  // (not resolvePackage) since there's no entity yet to carry an explicit
  // packageKey override — that only exists once the confirm step (Phase 2)
  // lets the owner pick one, which then rides along in the submit payload.
  const subNamesLive = sub
    .map((subId) => selectedCat?.children?.find((c) => c.id === subId)?.name)
    .filter((n): n is string => !!n)
    .join(", ");
  const bizThemeKey = getBusinessTheme(selectedCat?.name, subNamesLive);
  const bizTheme = BUSINESS_PACKAGES[bizThemeKey];
  // Phase 2 — the owner's own explicit pick, once they've opened the confirm
  // card's picker (PackageConfirmCard). Null = "still following the live
  // suggestion", which is what makes changing category before that point
  // keep re-suggesting instead of sticking to a stale choice.
  const [packageOverride, setPackageOverride] = useState<BusinessPackageKey | null>(null);
  const effectivePackageKey = packageOverride ?? bizThemeKey;
  // Bookings follows the resolved package until the owner says otherwise —
  // same null-means-"still following the suggestion" pattern as
  // packageOverride above. Hardcoding `false` here stored a Dining business as
  // bookings-off while PackageConfirmCard on this very step advertised
  // "Bookings on by default", and left its console without a reservations tab.
  const [bookingsOverride, setBookingsOverride] = useState<boolean | null>(null);
  const wantsBookings = bookingsOverride ?? BUSINESS_PACKAGES[effectivePackageKey].bookingsDefault;

  // #3 — everything except the photos, which hold File objects that can't be
  // serialised (the restore banner says so rather than returning a form that
  // looks complete but would submit without them).
  const draftSnapshot = {
    step, name, cat, newCat, sub, description, broadcastRadius, address, city, pincode,
    hoursRaw, phone, whatsapp, whatsappSame, email, openDate, offer, lat, lng,
    packageOverride, bookingsOverride,
  };
  const { restored, acknowledge, discard: discardDraft, clear: clearDraft } = useFormDraft({
    // Namespaced per user for the same reason `ob_beat` had to be: a shared
    // phone must not hand one person's half-written listing to the next.
    key: user.id ? `biz_onboard_draft:${user.id}` : null,
    snapshot: draftSnapshot,
    isEmpty: (v) => !v.name?.trim() && !v.cat && !v.address?.trim() && !v.description?.trim() && !v.phone?.trim(),
    onRestore: (v) => {
      setStep(typeof v.step === "number" ? Math.min(Math.max(v.step, 0), 3) : 0);
      setName(v.name ?? "");
      setCat(v.cat ?? null);
      setNewCat(v.newCat ?? "");
      setSub(Array.isArray(v.sub) ? v.sub : []);
      setDescription(v.description ?? "");
      setBroadcastRadius(v.broadcastRadius ?? 5);
      setAddress(v.address ?? "");
      setCity(v.city ?? "");
      setPincode(v.pincode ?? "");
      if (v.hoursRaw) setHoursRaw(v.hoursRaw);
      setPhone(v.phone ?? "");
      setWhatsapp(v.whatsapp ?? "");
      setWhatsappSame(v.whatsappSame !== false);
      setEmail(v.email ?? "");
      setOpenDate(v.openDate ?? "");
      setOffer(v.offer ?? "");
      setLat(v.lat ?? null);
      setLng(v.lng ?? null);
      setPackageOverride(v.packageOverride ?? null);
      setBookingsOverride(v.bookingsOverride ?? null);
      // A restored city/pincode is the owner's own typing, so the reverse
      // geocode must not treat it as free to overwrite (#9).
      if (v.city) cityTouched.current = true;
      if (v.pincode) pincodeTouched.current = true;
    },
  });


  const phoneDigits = phone.replace(/\D/g, "");
  const canNext = [
    name.trim().length > 1 && (!!cat || newCat.trim().length > 2),
    // City is now required to leave the Location step. It drives discovery and
    // it's what an admin checks at review, so an empty or wrong one is worse
    // than an extra field to fill.
    address.trim().length > 4 && city.trim().length > 1 && lat !== null && lng !== null,
    true,
    phoneDigits.length === 10,
  ][step];

  // #8 — the button used to just go grey. A disabled control with no stated
  // reason is indistinguishable from a broken one, and "drop a pin" is the
  // least guessable of these because the map already looks filled in.
  const blockedReason: string | null = canNext ? null : [
    name.trim().length > 1 ? "Pick a category, or propose one" : "Add your business name",
    lat === null || lng === null
      ? "Drop a pin on the map so customers can find your shop"
      : address.trim().length <= 4
        ? "Add your street address"
        : "Add your city",
    null,
    phoneDigits.length === 0 ? "Add a contact number" : "That number needs 10 digits",
  ][step];

  async function submit() {
    setSubmitting(true);
    try {
      let uploadedUrls = uploadedRef.current;
      if (photos.length > 0 && uploadedUrls.length === 0) {
        uploadedUrls = await Promise.all(
          photos.map((ph) => uploadService.upload(ph.file, "business-photo"))
        );
        // Remembered so a retry after a failed insert reuses these rather than
        // uploading a second copy of every photo.
        uploadedRef.current = uploadedUrls;
      }
      const subNames = sub.map(id => selectedCat?.children?.find(ch => ch.id === id)?.name || id);

      // #15 — the proposed row's own id and name are used when the insert
      // succeeded. The service falls back to a synthetic "prop_" id if RLS
      // refuses; that is deliberately never written as a foreign key, but the
      // typed name still goes in as categoryName so the shop is findable by
      // what it says it is rather than by nothing. (Same handling as the
      // provider flow, whose version of this wrote NULL for both.)
      let categoryId: string | undefined = cat ?? undefined;
      let categoryName: string | undefined = selectedCat?.name || undefined;
      if (!cat && newCat.trim()) {
        const proposed = await catalogService.proposeCategory(newCat.trim(), null, "BUSINESS") as any;
        if (proposed?.id && String(proposed.id).startsWith("cat_")) categoryId = proposed.id;
        categoryName = proposed?.name || newCat.trim();
      }

      // #11 — hours used to be dropped entirely when bookings were off, so a
      // retail shop or cafe that didn't take reservations was filed with NULL
      // hours and its listing showed none. When you're open is public
      // information regardless; only `bookingsEnabled` decides whether those
      // hours can be reserved against.
      const hoursValue = hoursRaw || undefined;
      // #20 — this was a flat `isOpenNow: true`, so a shop submitted at
      // midnight was published as open. Derived from the hours just entered,
      // which is the same function the badge itself reads.
      const openNow = evaluateProviderAvailability(hoursValue).isOpenNow;

      let bizId = createdId;
      if (!bizId) {
        const biz = await businessService.create({
          name,
          categoryId,
          subCategory: subNames.join(", ") || undefined,
          categoryName,
          description: description.trim() || undefined,
          addressLine1: address,
          city,
          pincode,
          phone: phoneDigits,
          whatsapp: (whatsappSame ? phoneDigits : whatsapp.replace(/\D/g, "")) || undefined,
          email: email.trim() || undefined,
          openingDate: openDate || undefined,
          offerText: offer || undefined,
          bookingsEnabled: wantsBookings,
          hours: hoursValue,
          isOpenNow: openNow,
          coverImage: uploadedUrls[0] || undefined,
          gallery: uploadedUrls.length > 0 ? uploadedUrls : undefined,
          broadcastRadius,
          lat: lat!,
          lng: lng!,
          // The owner's confirmed/overridden package (PackageConfirmCard,
          // shown below step 3) — resolvePackage() reads this first from here
          // on, ahead of re-deriving from category.
          packageKey: effectivePackageKey,
        });
        bizId = biz?.id ?? null;
        setCreatedId(bizId);
        // #21 — the row owns these URLs now, so they're no longer orphans to
        // clean up if a later step fails.
        uploadedRef.current = [];
      }

      // #22 — the submitForReview() call that used to live here was redundant
      // AND non-atomic: businessService.create already inserts with
      // status 'PENDING', so this second round trip re-set the same value, and
      // when it failed the business existed anyway while the owner saw an error
      // and (reasonably) retried, creating a duplicate listing.

      // #19 — awaited. addRole used to fire its database write without waiting,
      // so the refreshUser() below read roles back before the write landed and
      // reset them to ['customer'], stripping the owner role the user had just
      // earned.
      await addRole("business_owner");
      await refreshUser();
      // #18 — land in this shop's own hat. Without it the owner was returned to
      // /manage still in customer mode, looking at a hub that wasn't theirs.
      if (bizId) setContext({ type: "business", id: bizId, name });
      clearDraft(); // the draft has become a listing; keeping it would re-offer it
      setDone(true);
    } catch (e) {
      // #21 — an insert that never happened leaves its uploads stranded in the
      // bucket with nothing referencing them. Best-effort cleanup: if it fails
      // (offline, permissions) the submit error is still what the owner sees.
      if (!createdId && uploadedRef.current.length > 0) {
        try {
          await Promise.all(uploadedRef.current.map((url) => uploadService.remove(url)));
          uploadedRef.current = [];
        } catch { /* orphan cleanup is best-effort */ }
      }
      // Surface the real reason (RLS, upload, network) instead of a vague toast,
      // so a failed listing is actually diagnosable.
      const msg = e instanceof Error && e.message ? e.message : "Couldn't submit. Try again.";
      showToast(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (atBusinessCap && !done) {
    return (
      <div className="screen">
        <AppBar title="List your business" onBack={() => nav(-1)} />
        <div className="screen-scroll col center page-pad" style={{ paddingTop: 60, textAlign: "center" }}>
          <div style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--ink-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Store size={40} color="var(--ink-500)" />
          </div>
          <h1 className="bold h1" style={{ marginTop: 22 }}>You're at {MAX_BUSINESSES_PER_OWNER} businesses</h1>
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.5, maxWidth: 300 }}>
            That's the limit for one account. Manage an existing shop, or remove
            one you no longer run, to make room for another.
          </p>
        </div>
        <div className="page-pad col gap-10">
          <button className="btn btn-primary btn-block" onClick={() => nav("/manage")}>Manage my businesses</button>
          <button className="btn btn-ghost btn-block" onClick={() => nav("/home")}>Back to home</button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="screen">
        <div className="screen-scroll col center page-pad" style={{ paddingTop: 70, textAlign: "center" }}>
          <div style={{ width: 96, height: 96, borderRadius: "50%", background: "var(--green-100)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop 0.4s ease" }}>
            <CheckCircle2 size={52} color="var(--green-500)" />
          </div>
          <h1 className="bold h1" style={{ marginTop: 24 }}>Submitted for review</h1>
          {/* #17 — "3,247 nearby users" was a hardcoded literal shown to every
              owner in every city, including the first shop in a new market with
              no users at all. A promise the app can't keep is worse than no
              number, and there's no cheap honest count to put here. */}
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.5, maxWidth: 290 }}>
            We'll verify your business within ~24 hours. Once approved, neighbours within <span className="semi" style={{ color: "var(--ink-900)" }}>{broadcastRadius} km</span> will see you in search and the feed.
          </p>
          <div className="card" style={{ marginTop: 24, width: "100%", textAlign: "left" }}>
            <div className="row gap-10"><Store size={20} color="var(--orange-500)" /><div><div className="semi small">{name || "Your business"}</div><div className="tiny muted">{selectedCat?.name} • Under review</div></div></div>
          </div>
        </div>
        <div className="page-pad col gap-10">
          <button
            className="btn btn-primary btn-block"
            onClick={() => nav(createdId ? `/business/${createdId}/manage` : "/manage")}
          >
            Go to dashboard
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => nav("/home")}>Back to home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="List your business" subtitle={`Step ${step + 1} of 4 • ${steps[step]}`} onBack={() => (step === 0 ? nav(-1) : setStep(step - 1))} />

      {/* Progress */}
      <div className="row gap-4 page-pad" style={{ paddingTop: 12, paddingBottom: 4 }}>
        {steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 5, borderRadius: 4, background: i <= step ? "var(--brand-600)" : "var(--ink-200)" }} />
        ))}
      </div>

      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        {restored && (
          <div className="row between center-v" style={{ padding: "9px 12px", background: "var(--amber-50)", border: "1px solid var(--amber-200)", borderRadius: 12 }}>
            <span className="tiny semi" style={{ color: "var(--amber-800)", lineHeight: 1.4 }}>
              Picked up where you left off.{photos.length === 0 ? " Photos need choosing again." : ""}
            </span>
            <div className="row gap-8" style={{ flexShrink: 0 }}>
              <button
                type="button"
                className="tiny semi"
                style={{ color: "var(--amber-800)", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}
                onClick={() => {
                  discardDraft();
                  setStep(0); setName(""); setCat(null); setNewCat(""); setSub([]); setDescription("");
                  setAddress(""); setCity(""); setPincode(""); setPhone(""); setWhatsapp(""); setEmail("");
                  setOpenDate(""); setOffer(""); setLat(null); setLng(null);
                  setPackageOverride(null); setBookingsOverride(null);
                  cityTouched.current = false; pincodeTouched.current = false;
                }}
              >
                Start over
              </button>
              <button type="button" className="icon-btn" aria-label="Dismiss" style={{ width: 24, height: 24 }} onClick={acknowledge}>
                <X size={12} />
              </button>
            </div>
          </div>
        )}
        {step === 0 && (
          <>

            <div className="field">
              <label>Business name *</label>
              <input className="input" placeholder="e.g. Spice Route Kitchen" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Category *</label>
              {catError ? (
                <div className="card col gap-8" style={{ padding: 12, border: "1px solid var(--red-500)" }}>
                  <span className="tiny" style={{ color: "var(--red-600)" }}>Couldn't load categories: {catError.message || "network error"}</span>
                  <button className="btn btn-outline btn-sm" style={{ width: "fit-content" }} onClick={refetchCats}>Retry</button>
                </div>
              ) : catLoading && cats.length === 0 ? (
                <div className="tiny muted">Loading categories…</div>
              ) : cats.length === 0 ? (
                <div className="tiny muted">No categories available. <button className="semi" style={{ color: "var(--brand-700)" }} onClick={refetchCats}>Reload</button></div>
              ) : (
                <div className="row wrap gap-8">
                  {cats.map((c) => (
                    <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} onClick={() => { setCat(c.id); setSub([]); }}>
                      {c.icon} {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>Don't see your line of work? Propose a category</label>
              <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 12px", background: "#fff" }}>
                <Plus size={16} color="var(--ink-400)" />
                <input
                  className="input"
                  style={{ border: "none" }}
                  placeholder="e.g. Cycle repair"
                  value={newCat}
                  onChange={(e) => { setNewCat(e.target.value); if (e.target.value.trim()) { setCat(null); setSub([]); } }}
                />
              </div>
              {newCat.trim() && <span className="tiny muted">New categories are reviewed by our team before going live.</span>}
            </div>
            <div className="field">
              <label>About your business</label>
              <textarea
                className="input"
                style={{ minHeight: 80 }}
                placeholder="What you sell or do, what you're known for, anything a first-time customer should know…"
                value={description}
                maxLength={600}
                onChange={(e) => setDescription(e.target.value)}
              />
              <span className="tiny muted">Shown at the top of your listing. You can change it any time.</span>
            </div>
            {selectedCat?.children && (
              <div className="field">
                <label>Sub-categories (select all that apply)</label>
                <div className="row wrap gap-8">
                  {selectedCat.children.map((c) => {
                    const active = sub.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`chip ${active ? "active" : ""}`}
                        onClick={() => {
                          if (active) {
                            setSub(sub.filter((id) => id !== c.id));
                          } else {
                            setSub([...sub, c.id]);
                          }
                        }}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                {bizTheme.onboardSubcategoryHint && (
                  <span className="tiny muted" style={{ marginTop: 6, display: "block" }}>
                    {bizTheme.onboardSubcategoryHint}
                  </span>
                )}
              </div>
            )}
            <div className="field" style={{ marginTop: 14 }}>
              <RadiusSelector
                value={broadcastRadius}
                onChange={setBroadcastRadius}
                accentColor="var(--brand-600)"
                label="Service radius"
                description="How far you'll take bookings from, and how far your posts and stories reach nearby customers."
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <LocationPicker
              lat={lat}
              lng={lng}
              storedLat={user.lat}
              storedLng={user.lng}
              pinColor="var(--orange-500)"
              height={190}
              onChange={async (newLat, newLng) => {
                setLat(newLat);
                setLng(newLng);
                try {
                  const res = await reverseGeocodeFull(newLat, newLng);
                  if (res) {
                    // #9 — only fills what the owner hasn't typed into. This
                    // used to overwrite unconditionally on every pin nudge,
                    // silently reverting a hand-corrected city or pincode.
                    if (res.city && !cityTouched.current) setCity(res.city);
                    if (res.pincode && !pincodeTouched.current) setPincode(res.pincode);
                  }
                } catch {
                  /* ignore */
                }
              }}
              onError={(msg) => showToast(msg)}
            />
            <div className="field">
              <label>Address *</label>
              <textarea className="input" placeholder="Shop no, lane, area" value={address} onChange={(e) => setAddress(e.target.value)} style={{ minHeight: 70 }} />
            </div>
            <div className="row gap-10">
              <div className="field grow"><label>City *</label><input className="input" placeholder="e.g. Pune" value={city} onChange={(e) => { cityTouched.current = true; setCity(e.target.value); }} /></div>
              <div className="field grow"><label>Pincode</label><input className="input" placeholder="411001" inputMode="numeric" value={pincode} onChange={(e) => { pincodeTouched.current = true; setPincode(e.target.value.replace(/\D/g, "")); }} /></div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="field">
              <label>Add photos of your shop</label>
              <span className="tiny muted">
                {bizTheme.onboardPhotoHint ?? "A great cover photo gets 3x more views."}
              </span>
              <div className="row gap-8 wrap" style={{ marginTop: 8 }}>
                {photos.map((ph, idx) => (
                  <div key={ph.previewUrl} style={{ position: "relative", width: 96, height: 96 }}>
                    <img src={ph.previewUrl} alt={idx === 0 ? "Cover photo" : `Shop photo ${idx + 1}`} className="thumb" style={{ width: 96, height: 96, borderRadius: 12, objectFit: "cover" }} />
                    {/* #5 — the cover was silently `uploadedUrls[0]`, with
                        nothing saying so and no way to change it. The badge
                        states the consequence; the button on every other photo
                        is how you act on it. Promoting to the front rather than
                        swapping keeps the rest of the gallery in the order the
                        owner added it. */}
                    {idx === 0 && photos.length > 1 && (
                      <span className="tiny semi" style={{ position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,0.6)", color: "#fff", borderRadius: 6, padding: "1px 6px", fontSize: 9.5 }}>COVER</span>
                    )}
                    {idx > 0 && (
                      <button
                        type="button"
                        className="tiny semi"
                        aria-label={`Make photo ${idx + 1} the cover`}
                        onClick={() => setPhotos((prev) => {
                          const next = [...prev];
                          const [moved] = next.splice(idx, 1);
                          return [moved, ...next];
                        })}
                        style={{
                          position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,0.6)", color: "#fff",
                          border: "none", borderRadius: 6, padding: "2px 7px", fontSize: 9.5, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 3,
                        }}
                      >
                        <Check size={9} /> COVER
                      </button>
                    )}
                    {/* #4 — there was no way to take a photo back out; the only
                        remedy for a wrong pick was reloading the whole form and
                        losing every other answer with it. */}
                    <button
                      type="button"
                      aria-label={`Remove photo ${idx + 1}`}
                      onClick={() => {
                        URL.revokeObjectURL(ph.previewUrl);
                        setPhotos((prev) => prev.filter((x) => x.previewUrl !== ph.previewUrl));
                      }}
                      style={{
                        position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: "50%",
                        background: "var(--ink-900)", color: "#fff", border: "2px solid var(--surface)",
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {photos.length < 4 && (
                  <label className="col center" style={{ width: 96, height: 96, borderRadius: 12, border: "2px dashed var(--ink-300)", color: "var(--ink-500)", gap: 4, cursor: "pointer" }}>
                    <Camera size={22} /><span className="tiny">Add</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) addPhoto(file);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="field">
              <label>Opening offer (optional)</label>
              <input className="input" placeholder="e.g. 50% OFF up to ₹100" value={offer} onChange={(e) => setOffer(e.target.value)} />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="field">
              <label>Contact number *</label>
              <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 12px", background: "#fff" }}>
                <Phone size={16} color="var(--ink-400)" />
                {/* #10 — maxLength={10} counted the RAW keystrokes, so typing
                    "+91 98765 43210" was clipped to "+91 98765 " before the
                    strip ran, leaving 7 digits and a Continue button that would
                    never enable. The cap now applies to digits, and keeping the
                    LAST ten drops a country code or leading zero instead of the
                    real number. */}
                <input className="input" style={{ border: "none" }} inputMode="numeric" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(-10))} />
              </div>
            </div>
            <div className="field">
              <label>WhatsApp</label>
              <button
                type="button"
                className="row gap-8 center-v"
                onClick={() => setWhatsappSame((v) => !v)}
                aria-pressed={whatsappSame}
                style={{ background: "none", border: "none", padding: "2px 0 8px", cursor: "pointer", textAlign: "left" }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  border: whatsappSame ? "none" : "2px solid var(--ink-300)",
                  background: whatsappSame ? "var(--brand-600)" : "transparent",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {whatsappSame && <Check size={13} />}
                </span>
                <span className="small">Same as my contact number</span>
              </button>
              {!whatsappSame && (
                <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 12px", background: "#fff" }}>
                  <Phone size={16} color="var(--ink-400)" />
                  <input
                    className="input"
                    style={{ border: "none" }}
                    inputMode="numeric"
                    placeholder="WhatsApp number"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, "").slice(-10))}
                  />
                </div>
              )}
            </div>
            <div className="field">
              <label>Business email (optional)</label>
              <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 12px", background: "#fff" }}>
                <Mail size={16} color="var(--ink-400)" />
                <input
                  className="input"
                  style={{ border: "none" }}
                  inputMode="email"
                  autoCapitalize="none"
                  placeholder="shop@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                />
              </div>
              <span className="tiny muted">For official enquiries. Hidden from your public listing until you turn it on in Settings.</span>
            </div>
            <div className="field">
              <label>Opening date</label>
              {/* A real date input, not free text. This used to be a plain
                  text field with placeholder "e.g. 30 May 2026" writing into
                  businesses.opening_date, which is a genuine `date` column —
                  so anything unparseable was silently lost on submit.
                  min/max keep it to a sane window: a shop can have opened in
                  the past, but not be scheduled decades out. */}
              <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 12px", background: "#fff" }}>
                <Calendar size={16} color="var(--ink-400)" />
                <input
                  type="date"
                  className="input"
                  style={{ border: "none" }}
                  value={openDate}
                  min={OPENING_DATE_MIN}
                  max={OPENING_DATE_MAX}
                  onChange={(e) => setOpenDate(e.target.value)}
                />
              </div>
            </div>
            <OnboardBookingsToggle
              on={wantsBookings}
              onChange={setBookingsOverride}
              accentColor="var(--brand-600)"
            />
            {/* #11 — shown whether or not bookings are on. Opening hours are
                what a customer checks before walking over; hiding the editor
                behind the bookings toggle filed every non-booking shop with
                NULL hours and an empty listing. */}
            <div className="card col gap-14" style={{ padding: 16 }}>
              <div className="bold small row gap-6 center-v" style={{ color: "var(--ink-900)" }}>
                <Clock size={18} color="var(--brand-700)" /> {bizThemeKey === "generic" ? "Working Hours (Availability Timing)" : bizTheme.hoursLabel}
              </div>
              <span className="tiny muted">
                {wantsBookings
                  ? "Set your real working hours — this is exactly what customers will book against."
                  : "Set your real opening hours — customers see these on your listing and in the \"Open now\" badge."}
              </span>
              <WeeklyHoursEditor initialRaw={hoursRaw} onChange={setHoursRaw} />
              <div className="tiny muted">
                Holiday hours, "open right now" and booking capacity can be set
                any time from Business → Settings once you're live.
              </div>
            </div>

            {/* The suggested package becomes a real, visible choice right
                before submit — not silently applied.
                #16 — this used to be hidden entirely when the detected package
                was "generic", which is exactly backwards: an owner whose
                category matched nothing was the ONE person who couldn't pick a
                page type, and got stuck with the generic console forever. The
                card is always shown; only its wording changes. */}
            <PackageConfirmCard
              suggested={bizThemeKey}
              selected={effectivePackageKey}
              onChange={setPackageOverride}
              accentColor="var(--brand-600)"
            />
          </>
        )}

      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        {blockedReason && (
          <p className="tiny muted center" style={{ marginBottom: 8 }} role="status">{blockedReason}</p>
        )}
        <button
          className="btn btn-primary btn-block"
          disabled={!canNext || submitting}
          onClick={() => (step < 3 ? setStep(step + 1) : submit())}
        >
          {step < 3 ? "Continue" : submitting ? "Submitting…" : createdId ? "Retry" : "Submit for review"}
        </button>
      </div>
    </div>
  );
}
