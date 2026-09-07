import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { catalogService, providerService, uploadService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Camera, CheckCircle2, IndianRupee, Plus, Briefcase, Phone, X } from "@/components/Icons";
import { useApp } from "@/store";
import LocationPicker from "@/components/LocationPicker";
import RadiusSelector from "@/components/RadiusSelector";
import HoursSelector, { parseAvailability } from "@/components/HoursSelector";
import { DEFAULT_ONBOARD_WORKING_HOURS, expandPatternToWeekly, serializeHoursValue } from "@/utils/availability";
import { getBusinessTheme, BUSINESS_PACKAGES, type BusinessPackageKey } from "@/lib/businessPackages";
import { PackageConfirmCard } from "@/components/PackageConfirmCard";
import { OnboardBookingsToggle } from "@/components/OnboardBookingsToggle";
import { useFormDraft } from "@/hooks/useFormDraft";

const steps = ["Skill", "Area & price", "Portfolio", "Photo"];

export default function ProviderOnboard() {
  const nav = useNavigate();
  const { user, addRole, showToast, refreshUser, ownedProviderId, isAuthed, authReady, setContext } = useApp();
  const { data: serviceCatsData } = useQuery(() => catalogService.byKind("SERVICE"), [], "catalog:by-kind:SERVICE");

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [newCat, setNewCat] = useState("");
  const [radius, setRadius] = useState(5);
  const [price, setPrice] = useState("");
  const [bio, setBio] = useState("");
  const [availability, setAvailability] = useState(DEFAULT_ONBOARD_WORKING_HOURS);
  const [photos, setPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  // #1 — the public "Call" button reads providers.phone, which onboarding never
  // collected, so every profile created here shipped unreachable. Prefilled
  // from the account's own number, which is almost always the right one.
  const [phone, setPhone] = useState(user.phone ?? "");
  // #4 — a provider row that was created before a later step failed. The
  // one-provider-per-user unique index means a naive retry hits 23505 forever,
  // so the second attempt has to resume from here rather than re-create.
  const [createdId, setCreatedId] = useState<string | null>(null);

  // #5 — this form used to let a signed-out visitor fill in four steps and
  // only fail at submit, with a 401 and no way back. Bounced at the door
  // instead, carrying a return path so signing in resumes here.
  useEffect(() => {
    if (authReady && !isAuthed) {
      nav("/auth/phone", { replace: true, state: { next: "/onboard/provider" } });
    }
  }, [authReady, isAuthed, nav]);

  // Guard: if the user already owns a provider, go straight to manage.
  useEffect(() => {
    if (ownedProviderId) {
      nav(`/provider/${ownedProviderId}/manage`, { replace: true });
    }
  }, [ownedProviderId, nav]);

  // #3 — object URLs are leaked otherwise: every preview holds its file in
  // memory for the life of the document, and onboarding can add six of them.
  useEffect(() => () => {
    photos.forEach((ph) => URL.revokeObjectURL(ph.previewUrl));
  }, [photos]);
  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const serviceCats = (serviceCatsData ?? []).sort((a, b) => a.slug === "other" ? 1 : b.slug === "other" ? -1 : 0);
  const selectedCat = serviceCats.find((c) => c.id === cat);
  // Business Packages — same live-suggestion + explicit-override pattern as
  // BusinessOnboard.tsx. A proposed (not-yet-existing) category has no name
  // to derive from, so it correctly falls through to "generic" — nothing to
  // confirm there.
  const bizThemeKey = getBusinessTheme(selectedCat?.name);
  const [packageOverride, setPackageOverride] = useState<BusinessPackageKey | null>(null);
  const effectivePackageKey = packageOverride ?? bizThemeKey;
  // Same null-means-"follow the package" pattern as BusinessOnboard — see the
  // comment there for why a hardcoded false was wrong.
  const [bookingsOverride, setBookingsOverride] = useState<boolean | null>(null);
  const wantsBookings = bookingsOverride ?? BUSINESS_PACKAGES[effectivePackageKey].bookingsDefault;

  // #12 — everything except the two photo fields, which hold File objects that
  // can't be serialised. The restore banner says so rather than handing back a
  // form that looks finished but would fail its own photo requirement.
  const draftSnapshot = {
    step, displayName, cat, newCat, radius, price, bio, phone, availability,
    lat, lng, packageOverride, bookingsOverride,
  };
  const { restored, acknowledge, discard: discardDraft, clear: clearDraft } = useFormDraft({
    // Per user, for the same reason `ob_beat` had to be: a shared phone must
    // not hand one person's half-written profile to the next.
    key: user.id ? `provider_onboard_draft:${user.id}` : null,
    snapshot: draftSnapshot,
    isEmpty: (v) => !v.displayName?.trim() && !v.cat && !v.newCat?.trim() && !v.bio?.trim() && !v.price?.trim(),
    onRestore: (v) => {
      setStep(typeof v.step === "number" ? Math.min(Math.max(v.step, 0), 3) : 0);
      setDisplayName(v.displayName ?? "");
      setCat(v.cat ?? null);
      setNewCat(v.newCat ?? "");
      setRadius(v.radius ?? 5);
      setPrice(v.price ?? "");
      setBio(v.bio ?? "");
      setPhone(v.phone ?? "");
      if (v.availability) setAvailability(v.availability);
      setLat(v.lat ?? null);
      setLng(v.lng ?? null);
      setPackageOverride(v.packageOverride ?? null);
      setBookingsOverride(v.bookingsOverride ?? null);
    },
  });

  // A clear face photograph (becomes the profile photo) is the only requirement.
  const verifyValid = !!photoFile;

  const digits = phone.replace(/\D/g, "");
  const canNext = [
    (!!cat || newCat.trim().length > 2) && displayName.trim().length > 1,
    digits.length === 10 && price.replace(/\D/g, "").length > 1 && bio.trim().length > 5 && lat !== null && lng !== null,
    true,
    verifyValid,
  ][step];

  // #9 — the button used to just go grey. A disabled control with no stated
  // reason is indistinguishable from a broken one, and "pin your location" is
  // the least guessable of these because the map looks already-filled.
  const blockedReason: string | null = canNext ? null : [
    !displayName.trim() || displayName.trim().length <= 1
      ? "Add your professional name"
      : "Pick a service, or propose a new one",
    lat === null || lng === null
      ? "Drop a pin on the map so customers can find you"
      : digits.length !== 10
        ? "Add a 10-digit contact number"
        : bio.trim().length <= 5
          ? "Write a short bio (a line or two)"
          : "Add your starting price",
    null,
    "Add a clear face photo to finish",
  ][step];

  async function submit() {
    setSubmitting(true);
    try {
      let providerId = createdId;
      let finalName = displayName.trim();

      // #4 — everything up to and including the insert is skipped on a retry
      // that already got a row created. Re-running providerService.create would
      // hit idx_providers_one_per_user and fail forever, which is exactly how a
      // single failed portfolio upload used to brick the whole flow.
      if (!providerId) {
        // #2 — proposing a category used to be fire-and-forget: the result was
        // discarded and `categoryId: cat ?? undefined` then wrote NOTHING,
        // producing a provider with no category and no category name at all,
        // invisible to category-filtered discovery. Now the proposed row's own
        // id and name are used when the insert succeeded; when it didn't (the
        // service falls back to a synthetic "prop_" id on an RLS refusal) the
        // typed name is still written as categoryName, so the profile is at
        // least findable by what it says it does.
        let categoryId: string | undefined = cat ?? undefined;
        let categoryName: string | undefined = selectedCat?.name || undefined;
        if (!cat && newCat.trim()) {
          const proposed = await catalogService.proposeCategory(newCat.trim(), null, "SERVICE") as any;
          if (proposed?.id && String(proposed.id).startsWith("cat_")) categoryId = proposed.id;
          categoryName = proposed?.name || newCat.trim();
        }

        // A clear photograph becomes the provider's profile photo (avatar).
        const photoUrl = await uploadService.upload(photoFile as File, "provider-photo");
        // Onboarding still picks hours via the lightweight day-group + single-range HoursSelector,
        // but writes storage in the new per-day format so the new hours editor / correct "open now"
        // badges apply immediately, without a legacy round-trip.
        const parsedAvailability = parseAvailability(availability);
        // #7 — this used to be `wantsBookings ? ... : undefined`, so a provider
        // who turned bookings off had their whole working schedule dropped and
        // their listing showed no hours at all. When you work is public
        // information whether or not you accept bookings through the app; only
        // `bookingsEnabled` should decide whether slots can be reserved.
        const availabilityValue = serializeHoursValue(
          expandPatternToWeekly(parsedAvailability.days, parsedAvailability.from, parsedAvailability.to, 30)
        );
        const created = await providerService.create({
          displayName: finalName,
          categoryId,
          // Was missing entirely — resolvePackage() (src/lib/businessPackages.ts)
          // and every themed screen read categoryName off the record, so with
          // only categoryId ever written, no provider could resolve a package.
          categoryName,
          bio,
          phone: digits,
          startingPrice: Number(price),
          serviceRadiusKm: radius,
          bookingsEnabled: wantsBookings,
          availabilityNote: availabilityValue,
          avatar: photoUrl,
          lat: lat!,
          lng: lng!,
          // The provider's confirmed/overridden package (PackageConfirmCard,
          // shown below step 3 when it isn't "generic").
          packageKey: effectivePackageKey,
        });
        providerId = created?.id ?? null;
        finalName = created?.displayName || finalName;
        setCreatedId(providerId);
      }

      // Upload each portfolio photo and persist it. Failures here are no longer
      // fatal to the whole submission — the profile exists and is live, and a
      // photo can be added from the console.
      if (providerId && photos.length > 0) {
        try {
          const uploadedUrls = await Promise.all(
            photos.map((ph) => uploadService.upload(ph.file, "portfolio"))
          );
          await Promise.all(
            uploadedUrls.map((url) => providerService.addPortfolio(providerId as string, { url, caption: "" }))
          );
        } catch {
          showToast("Profile created — some portfolio photos didn't upload. Add them from your dashboard.");
        }
      }

      // #6 — awaited. addRole used to fire its database write without waiting,
      // so the refreshUser() below read the roles back before the write landed
      // and reset them to ['customer'], stripping the provider role.
      await addRole("provider");
      await refreshUser();
      // #11 — land in the provider's own hat rather than leaving them in
      // customer mode looking at a dashboard that isn't theirs.
      if (providerId) setContext({ type: "provider", id: providerId, name: finalName });
      clearDraft(); // the draft has become a profile; keeping it would re-offer it
      setDone(true);
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Couldn't submit. Try again.";
      showToast(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // Redirect is in-flight via the effect above — render nothing this frame.
  if (ownedProviderId) return null;

  if (done) {
    return (
      <div className="screen">
        <div className="screen-scroll col center page-pad" style={{ paddingTop: 70, textAlign: "center" }}>
          <div style={{ width: 96, height: 96, borderRadius: "50%", background: "var(--green-100)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop 0.4s ease" }}>
            <CheckCircle2 size={52} color="var(--green-500)" />
          </div>
          {/* #10 — this said "almost live", "we'll verify shortly" and "once
              approved", none of which is true: providerService.create inserts
              with status ACTIVE and discovery shows ACTIVE immediately. The old
              copy had providers waiting for an approval that was never coming,
              and not promoting a profile that was already public. The blue tick
              is the separate thing that actually gets reviewed. */}
          <h1 className="bold h1" style={{ marginTop: 24 }}>You're live!</h1>
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.5, maxWidth: 290 }}>
            Your profile is now visible in search and the feed for everyone within <span className="semi" style={{ color: "var(--ink-900)" }}>{radius} km</span>. Add your ID from the dashboard whenever you want the verified badge.
          </p>
        </div>
        <div className="page-pad col gap-10">
          <button
            className="btn btn-primary btn-block"
            onClick={() => nav(createdId ? `/provider/${createdId}/manage` : "/manage")}
          >
            Go to my dashboard
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => nav("/home")}>Back to home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="Offer a service" subtitle={`Step ${step + 1} of 4 • ${steps[step]}`} onBack={() => (step === 0 ? nav(-1) : setStep(step - 1))} />

      <div className="row gap-4 page-pad" style={{ paddingTop: 12, paddingBottom: 4 }}>
        {steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 5, borderRadius: 4, background: i <= step ? "var(--green-500)" : "var(--ink-200)" }} />
        ))}
      </div>

      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        {restored && (
          <div className="row between center-v" style={{ padding: "9px 12px", background: "var(--amber-50)", border: "1px solid var(--amber-200)", borderRadius: 12 }}>
            <span className="tiny semi" style={{ color: "var(--amber-800)", lineHeight: 1.4 }}>
              Picked up where you left off.{!photoFile ? " Your photo needs choosing again." : ""}
            </span>
            <div className="row gap-8" style={{ flexShrink: 0 }}>
              <button
                type="button"
                className="tiny semi"
                style={{ color: "var(--amber-800)", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}
                onClick={() => {
                  discardDraft();
                  setStep(0); setDisplayName(""); setCat(null); setNewCat(""); setPrice("");
                  setBio(""); setPhone(user.phone ?? ""); setLat(null); setLng(null);
                  setPackageOverride(null); setBookingsOverride(null);
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
              <label>Your professional name *</label>
              <input
                className="input"
                placeholder="e.g. Ramesh Plumbing Works, Priya Makeup Studio"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoFocus
              />
              <span className="tiny muted">This is what customers will see — use your name or business name.</span>
            </div>
            <div className="field">
              <label>What service do you offer? *</label>
              <div className="row wrap gap-8">
                {serviceCats.map((c) => (
                  <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} style={cat === c.id ? { background: "var(--green-500)", borderColor: "var(--green-500)" } : undefined} onClick={() => { setCat(c.id); setNewCat(""); }}>
                    {c.icon} {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Don't see your skill? Propose a new category</label>
              <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 12px", background: "#fff" }}>
                <Plus size={16} color="var(--ink-400)" />
                <input className="input" style={{ border: "none" }} placeholder="e.g. Drone pilot" value={newCat} onChange={(e) => { setNewCat(e.target.value); setCat(null); }} />
              </div>
              {newCat && <span className="tiny muted">New categories are reviewed by our team before going live.</span>}
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
              pinColor="var(--green-500)"
              height={190}
              onChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }}
              onError={(msg) => showToast(msg)}
            />
            <div className="field">
              <label>Short bio *</label>
              <textarea className="input" placeholder="What you do, your experience, what makes you reliable…" value={bio} onChange={(e) => setBio(e.target.value)} />
            </div>
            <div className="field">
              <label>Contact number *</label>
              <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 12px", background: "#fff" }}>
                <Phone size={16} color="var(--ink-400)" />
                <input
                  className="input"
                  style={{ border: "none" }}
                  inputMode="numeric"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(-10))}
                />
              </div>
              <span className="tiny muted">Customers tap this to call you. You can hide it publicly later from your dashboard.</span>
            </div>
            <div className="field">
              <label>Starting price (₹) *</label>
              <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 12px", background: "#fff" }}>
                <IndianRupee size={16} color="var(--ink-400)" />
                <input className="input" style={{ border: "none" }} inputMode="numeric" placeholder="from ₹…" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
              </div>
            </div>
            <div className="field">
              <RadiusSelector
                value={radius}
                onChange={setRadius}
                accentColor="var(--green-500)"
                label="Service radius"
                description="How far you'll travel to serve, and how far your posts and stories reach nearby customers."
              />
            </div>
            <OnboardBookingsToggle
              on={wantsBookings}
              onChange={setBookingsOverride}
              accentColor="var(--green-500)"
            />
            {/* #7 — shown whether or not bookings are on. When you work is
                public information; only `bookingsEnabled` decides whether those
                hours can be reserved. Hiding this behind the toggle meant a
                provider who took calls but not app bookings published no hours
                at all. */}
            <div className="field">
              <HoursSelector
                value={availability}
                onChange={setAvailability}
                accentColor="var(--green-500)"
                label="Working hours"
                description={wantsBookings
                  ? "Specify when you are available for customer bookings"
                  : "Shown on your profile so customers know when to reach you"}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <div className="field">
            <label>Show your past work</label>
            <span className="tiny muted">Portfolio photos build trust and win more jobs.</span>
            <div className="row gap-8 wrap" style={{ marginTop: 8 }}>
              {photos.map((ph, idx) => (
                <div key={ph.previewUrl} style={{ position: "relative", width: 96, height: 96 }}>
                  <img src={ph.previewUrl} alt={`Portfolio photo ${idx + 1}`} className="thumb" style={{ width: 96, height: 96, borderRadius: 12, objectFit: "cover" }} />
                  {/* #3 — there was no way to take a photo back out. The only
                      remedy for a wrong pick was restarting the whole form. */}
                  <button
                    type="button"
                    aria-label={`Remove portfolio photo ${idx + 1}`}
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
              {photos.length < 5 && (
                <label className="col center" style={{ width: 96, height: 96, borderRadius: 12, border: "2px dashed var(--ink-300)", color: "var(--ink-500)", gap: 4, cursor: "pointer" }}>
                  <Camera size={22} /><span className="tiny">Add</span>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setPhotos((p) => [...p, { file, previewUrl: URL.createObjectURL(file) }]);
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <>
            <div className="card row gap-10" style={{ padding: 12, background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
              <Briefcase size={20} color="var(--green-500)" />
              <span className="tiny" style={{ color: "var(--green-600)", lineHeight: 1.4 }}>
                Add a clear face photo — it becomes your public profile photo so customers know who they're hiring.
              </span>
            </div>

            {/* Photograph (becomes profile photo) */}
            <div className="field">
              <label>Your photograph *</label>
              <label className="row gap-12" style={{ cursor: "pointer", alignItems: "center" }}>
                {photoPreview
                  ? <img src={photoPreview} alt="Your profile photo" className="thumb" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />
                  : <div className="col center" style={{ width: 72, height: 72, borderRadius: "50%", border: "2px dashed var(--ink-300)", color: "var(--ink-500)" }}><Camera size={22} /></div>}
                <span className="small semi" style={{ color: photoFile ? "var(--green-600)" : "var(--ink-600)" }}>
                  {photoFile ? "Photo added — tap to change" : "Add a clear face photo"}
                </span>
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); } }} />
              </label>
            </div>

            {/* The suggested package becomes a real, visible choice right
                before submit — not silently applied. Skipped for "generic"
                (including a proposed, not-yet-approved category). */}
            {bizThemeKey !== "generic" && (
              <PackageConfirmCard
                suggested={bizThemeKey}
                selected={effectivePackageKey}
                onChange={setPackageOverride}
                accentColor="var(--green-500)"
              />
            )}
          </>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        {blockedReason && (
          <p className="tiny muted center" style={{ marginBottom: 8 }} role="status">{blockedReason}</p>
        )}
        <button
          className="btn btn-block"
          style={{ background: canNext ? "var(--green-500)" : "var(--ink-200)", color: "#fff" }}
          disabled={!canNext || submitting}
          onClick={() => (step < 3 ? setStep(step + 1) : submit())}
        >
          {step < 3 ? "Continue" : submitting ? "Submitting…" : createdId ? "Retry" : "Submit profile"}
        </button>
      </div>
    </div>
  );
}
