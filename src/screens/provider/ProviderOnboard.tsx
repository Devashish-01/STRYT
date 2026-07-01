import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { catalogService, providerService, uploadService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Camera, CheckCircle2, IndianRupee, Plus, Briefcase } from "lucide-react";
import { useApp } from "@/store";
import LocationPicker from "@/components/LocationPicker";
import RadiusSelector from "@/components/RadiusSelector";
import HoursSelector from "@/components/HoursSelector";


const steps = ["Skill", "Area & price", "Portfolio", "Verify"];

export default function ProviderOnboard() {
  const nav = useNavigate();
  const { user, addRole, showToast, refreshUser, ownedProviderId } = useApp();
  const { data: serviceCatsData } = useQuery(() => catalogService.byKind("SERVICE"), []);

  // Guard: if the user already owns a provider, go straight to manage.
  if (ownedProviderId) {
    nav(`/provider/${ownedProviderId}/manage`, { replace: true });
    return null;
  }
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [newCat, setNewCat] = useState("");
  const [radius, setRadius] = useState(5);
  const [price, setPrice] = useState("");
  const [bio, setBio] = useState("");
  const [availability, setAvailability] = useState("Everyday from 09:00 AM to 09:00 PM");
  const [photos, setPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const [aadhaarNum, setAadhaarNum] = useState("");
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  const serviceCats = (serviceCatsData ?? []).sort((a, b) => a.slug === "other" ? 1 : b.slug === "other" ? -1 : 0);

  // KYC: a provider must provide an Aadhaar (number + photo) and a face photograph.
  const verifyValid = aadhaarNum.replace(/\D/g, "").length === 12 && !!aadhaarFile && !!photoFile;

  const canNext = [
    (!!cat || newCat.trim().length > 2) && displayName.trim().length > 1,
    price.replace(/\D/g, "").length > 1 && bio.trim().length > 5 && lat !== null && lng !== null,
    true,
    verifyValid,
  ][step];

  async function submit() {
    setSubmitting(true);
    try {
      if (newCat.trim()) await catalogService.proposeCategory(newCat.trim(), null, "SERVICE");
      // Required KYC: Aadhaar document + a clear photograph (becomes the avatar).
      const [aadhaarUrl, photoUrl] = await Promise.all([
        uploadService.upload(aadhaarFile as File, "kyc-provider"),
        uploadService.upload(photoFile as File, "provider-photo"),
      ]);
      const created = await providerService.create({
        displayName: displayName.trim(),
        categoryId: cat ?? undefined,
        bio,
        startingPrice: Number(price),
        serviceRadiusKm: radius,
        availabilityNote: availability,
        avatar: photoUrl,
        verificationDocumentUrl: aadhaarUrl,
        verificationStatus: "UNDER_REVIEW",
        lat: lat!,
        lng: lng!,
      });
      // Upload each portfolio photo and persist it.
      if (created?.id && photos.length > 0) {
        const uploadedUrls = await Promise.all(
          photos.map((p) => uploadService.upload(p.file, "portfolio"))
        );
        await Promise.all(
          uploadedUrls.map((url) => providerService.addPortfolio(created.id, { url, caption: "" }))
        );
      }
      addRole("provider");
      await refreshUser();
      setDone(true);
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Couldn't submit. Try again.";
      showToast(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="screen">
        <div className="screen-scroll col center page-pad" style={{ paddingTop: 70, textAlign: "center" }}>
          <div style={{ width: 96, height: 96, borderRadius: "50%", background: "#e8f7ee", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop 0.4s ease" }}>
            <CheckCircle2 size={52} color="#16a34a" />
          </div>
          <h1 className="bold" style={{ fontSize: 24, marginTop: 24 }}>You're almost live!</h1>
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.5, maxWidth: 290 }}>
            We'll verify your profile shortly. Once approved you'll appear in search and the feed for everyone within <span className="semi" style={{ color: "var(--ink-900)" }}>{radius} km</span>.
          </p>
        </div>
        <div className="page-pad col gap-10">
          <button className="btn btn-primary btn-block" onClick={() => nav("/manage")}>Done</button>
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
                  <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} style={cat === c.id ? { background: "#16a34a", borderColor: "#16a34a" } : undefined} onClick={() => { setCat(c.id); setNewCat(""); }}>
                    {c.icon} {c.name.split(" ")[0]}
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
              pinColor="#16a34a"
              height={120}
              onChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }}
              onError={(msg) => showToast(msg)}
            />
            <div className="field">
              <label>Short bio *</label>
              <textarea className="input" placeholder="What you do, your experience, what makes you reliable…" value={bio} onChange={(e) => setBio(e.target.value)} />
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
                accentColor="#16a34a"
                label="Service radius"
                description="How far you're willing to travel/serve."
              />
            </div>
            <div className="field">
              <HoursSelector
                value={availability}
                onChange={setAvailability}
                accentColor="#16a34a"
                label="Availability timing"
                description="Specify when you are available for customer bookings"
              />
            </div>
          </>
        )}

        {step === 2 && (
          <div className="field">
            <label>Show your past work</label>
            <span className="tiny muted">Portfolio photos build trust and win more jobs.</span>
            <div className="row gap-8 wrap" style={{ marginTop: 8 }}>
              {photos.map((p, idx) => (
                <img key={idx} src={p.previewUrl} className="thumb" style={{ width: 96, height: 96, borderRadius: 12, objectFit: "cover" }} />
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
            <div className="card row gap-10" style={{ padding: 12, background: "#e8f7ee", border: "1px solid #bbf7d0" }}>
              <Briefcase size={20} color="#16a34a" />
              <span className="tiny" style={{ color: "#15803d", lineHeight: 1.4 }}>
                Providers verify with <b>Aadhaar</b> and a clear <b>photograph</b>. Kept private, used only to keep the community safe.
              </span>
            </div>

            {/* Photograph (becomes profile photo) */}
            <div className="field">
              <label>Your photograph *</label>
              <label className="row gap-12" style={{ cursor: "pointer", alignItems: "center" }}>
                {photoPreview
                  ? <img src={photoPreview} className="thumb" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />
                  : <div className="col center" style={{ width: 72, height: 72, borderRadius: "50%", border: "2px dashed var(--ink-300)", color: "var(--ink-500)" }}><Camera size={22} /></div>}
                <span className="small semi" style={{ color: photoFile ? "var(--green-600)" : "var(--ink-600)" }}>
                  {photoFile ? "Photo added — tap to change" : "Add a clear face photo"}
                </span>
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); } }} />
              </label>
            </div>

            {/* Aadhaar */}
            <div className="field">
              <label>Aadhaar number *</label>
              <input className="input" inputMode="numeric" maxLength={14} placeholder="1234 5678 9012"
                value={aadhaarNum} onChange={(e) => setAadhaarNum(e.target.value.replace(/[^\d ]/g, ""))} />
            </div>
            <label className="col center" style={{ width: "100%", padding: 18, borderRadius: 14, border: `2px dashed ${aadhaarFile ? "#16a34a" : "var(--ink-300)"}`, color: aadhaarFile ? "var(--green-600)" : "var(--ink-500)", gap: 6, cursor: "pointer" }}>
              <Camera size={24} />
              <span className="small semi">{aadhaarFile ? `✓ ${aadhaarFile.name}` : "Upload Aadhaar card photo"}</span>
              <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setAadhaarFile(f); showToast("Aadhaar added"); } }} />
            </label>
          </>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        <button
          className="btn btn-block"
          style={{ background: canNext ? "#16a34a" : "var(--ink-200)", color: "#fff" }}
          disabled={!canNext || submitting}
          onClick={() => (step < 3 ? setStep(step + 1) : submit())}
        >
          {step < 3 ? "Continue" : submitting ? "Submitting…" : "Submit profile"}
        </button>
      </div>
    </div>
  );
}
