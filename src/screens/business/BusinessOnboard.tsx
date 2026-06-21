import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { catalogService, businessService, uploadService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Camera, Phone, Calendar, CheckCircle2, FileCheck, Store } from "lucide-react";
import { useApp } from "@/store";
import LocationPicker from "@/components/LocationPicker";

const steps = ["Basics", "Location", "Photos", "Contact", "Verify"];

export default function BusinessOnboard() {
  const nav = useNavigate();
  const { user, addRole, showToast, refreshUser } = useApp();
  const { data: categories } = useQuery(() => catalogService.getCategories("BUSINESS"), []);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [broadcastRadius, setBroadcastRadius] = useState(5);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Pune");
  const [pincode, setPincode] = useState("");
  const [hours, setHours] = useState("");
  const [photos, setPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const [phone, setPhone] = useState("");
  const [openDate, setOpenDate] = useState("");
  const [offer, setOffer] = useState("");
  const [aadhaarNum, setAadhaarNum] = useState("");
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [panNum, setPanNum] = useState("");
  const [panFile, setPanFile] = useState<File | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  const cats = (categories ?? []).sort((a, b) => a.slug === "other" ? 1 : b.slug === "other" ? -1 : 0);
  const selectedCat = cats.find((c) => c.id === cat);

  // KYC: a business must provide BOTH Aadhaar and PAN (number + document photo).
  const aadhaarValid = aadhaarNum.replace(/\D/g, "").length === 12 && !!aadhaarFile;
  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNum.trim().toUpperCase()) && !!panFile;

  const canNext = [
    name.trim().length > 1 && !!cat,
    address.trim().length > 4 && lat !== null && lng !== null,
    true,
    phone.replace(/\D/g, "").length === 10,
    aadhaarValid && panValid,
  ][step];

  async function submit() {
    setSubmitting(true);
    try {
      let uploadedUrls: string[] = [];
      if (photos.length > 0) {
        uploadedUrls = await Promise.all(
          photos.map((p) => uploadService.upload(p.file, "business-photo"))
        );
      }
      // Required KYC documents (Aadhaar + PAN).
      const [aadhaarUrl, panUrl] = await Promise.all([
        uploadService.upload(aadhaarFile as File, "kyc-business"),
        uploadService.upload(panFile as File, "kyc-business"),
      ]);
      const biz = await businessService.create({
        name,
        categoryId: cat ?? undefined,
        subCategory: sub ?? undefined,
        addressLine1: address,
        city,
        pincode,
        phone,
        openingDate: openDate || undefined,
        offerText: offer || undefined,
        hours: hours || undefined,
        coverImage: uploadedUrls[0] || undefined,
        gallery: uploadedUrls.length > 0 ? uploadedUrls : undefined,
        broadcastRadius,
        aadhaarDocUrl: aadhaarUrl,
        panDocUrl: panUrl,
        verificationDocumentUrl: aadhaarUrl,
        verificationStatus: "UNDER_REVIEW",
        lat: lat!,
        lng: lng!,
      });
      if (biz?.id) {
        await businessService.submitForReview(biz.id);
      }
      addRole("business_owner");
      await refreshUser();
      setDone(true);
    } catch (e) {
      // Surface the real reason (RLS, upload, network) instead of a vague toast,
      // so a failed listing is actually diagnosable.
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
          <h1 className="bold" style={{ fontSize: 24, marginTop: 24 }}>Submitted for review</h1>
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.5, maxWidth: 290 }}>
            We'll verify your business within ~24 hours. Once approved, <span className="semi" style={{ color: "var(--ink-900)" }}>3,247 nearby users</span> get a silent heads-up that you're open.
          </p>
          <div className="card" style={{ padding: 14, marginTop: 24, width: "100%", textAlign: "left" }}>
            <div className="row gap-10"><Store size={20} color="#f26a00" /><div><div className="semi small">{name || "Your business"}</div><div className="tiny muted">{selectedCat?.name} • Under review</div></div></div>
          </div>
        </div>
        <div className="page-pad col gap-10">
          <button className="btn btn-primary btn-block" onClick={() => nav("/manage")}>Go to dashboard</button>
          <button className="btn btn-ghost btn-block" onClick={() => nav("/home")}>Back to home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="List your business" subtitle={`Step ${step + 1} of 5 • ${steps[step]}`} onBack={() => (step === 0 ? nav(-1) : setStep(step - 1))} />

      {/* Progress */}
      <div className="row gap-4 page-pad" style={{ paddingTop: 12, paddingBottom: 4 }}>
        {steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 5, borderRadius: 4, background: i <= step ? "var(--brand-600)" : "var(--ink-200)" }} />
        ))}
      </div>

      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        {step === 0 && (
          <>
            <div className="field">
              <label>Business name *</label>
              <input className="input" placeholder="e.g. Spice Route Kitchen" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Category *</label>
              <div className="row wrap gap-8">
                {cats.map((c) => (
                  <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} onClick={() => { setCat(c.id); setSub(null); }}>
                    {c.icon} {c.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
            {selectedCat?.children && (
              <div className="field">
                <label>Sub-category</label>
                <div className="row wrap gap-8">
                  {selectedCat.children.map((c) => (
                    <button key={c.id} className={`chip ${sub === c.id ? "active" : ""}`} onClick={() => setSub(c.id)}>{c.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="field" style={{ marginTop: 14 }}>
              <label className="row between">
                <span>Broadcast radius</span>
                <span style={{ color: "var(--brand-700)" }}>{broadcastRadius} km</span>
              </label>
              <input
                type="range"
                min={1}
                max={25}
                value={broadcastRadius}
                onChange={(e) => setBroadcastRadius(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--brand-600)" }}
              />
              <span className="tiny muted">Specify how far you want to announce your business opening.</span>
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
              pinColor="#f26a00"
              height={150}
              onChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }}
              onError={(msg) => showToast(msg)}
            />
            <div className="field">
              <label>Address *</label>
              <textarea className="input" placeholder="Shop no, lane, area" value={address} onChange={(e) => setAddress(e.target.value)} style={{ minHeight: 70 }} />
            </div>
            <div className="row gap-10">
              <div className="field grow"><label>City</label><input className="input" value={city} onChange={(e) => setCity(e.target.value)} /></div>
              <div className="field grow"><label>Pincode</label><input className="input" placeholder="411001" inputMode="numeric" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} /></div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="field">
              <label>Add photos of your shop</label>
              <span className="tiny muted">A great cover photo gets 3x more views.</span>
              <div className="row gap-8 wrap" style={{ marginTop: 8 }}>
                {photos.map((p, idx) => (
                  <img key={idx} src={p.previewUrl} className="thumb" style={{ width: 96, height: 96, borderRadius: 12, objectFit: "cover" }} />
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
                        if (file) setPhotos((p) => [...p, { file, previewUrl: URL.createObjectURL(file) }]);
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
                <input className="input" style={{ border: "none" }} inputMode="numeric" maxLength={10} placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
              </div>
            </div>
            <div className="field">
              <label>Opening date</label>
              <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 12px", background: "#fff" }}>
                <Calendar size={16} color="var(--ink-400)" />
                <input className="input" style={{ border: "none" }} placeholder="e.g. 30 May 2026" value={openDate} onChange={(e) => setOpenDate(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Hours</label>
              <input className="input" placeholder="11:00 AM – 11:30 PM" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="card row gap-10" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
              <FileCheck size={20} color="var(--brand-600)" />
              <span className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.4 }}>
                A business must verify with <b>Aadhaar</b> and <b>PAN</b>. Documents are private, used only for verification.
              </span>
            </div>

            {/* Aadhaar */}
            <div className="field">
              <label>Aadhaar number *</label>
              <input
                className="input"
                inputMode="numeric"
                maxLength={14}
                placeholder="1234 5678 9012"
                value={aadhaarNum}
                onChange={(e) => setAadhaarNum(e.target.value.replace(/[^\d ]/g, ""))}
              />
            </div>
            <label className="col center" style={{ width: "100%", padding: 18, borderRadius: 14, border: `2px dashed ${aadhaarFile ? "var(--green-500)" : "var(--ink-300)"}`, color: aadhaarFile ? "var(--green-600)" : "var(--ink-500)", gap: 6, cursor: "pointer", marginTop: -6 }}>
              <Camera size={24} />
              <span className="small semi">{aadhaarFile ? `✓ ${aadhaarFile.name}` : "Upload Aadhaar card photo"}</span>
              <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setAadhaarFile(f); showToast("Aadhaar added"); } }} />
            </label>

            {/* PAN */}
            <div className="field" style={{ marginTop: 4 }}>
              <label>PAN number *</label>
              <input
                className="input"
                style={{ textTransform: "uppercase" }}
                maxLength={10}
                placeholder="ABCDE1234F"
                value={panNum}
                onChange={(e) => setPanNum(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
            </div>
            <label className="col center" style={{ width: "100%", padding: 18, borderRadius: 14, border: `2px dashed ${panFile ? "var(--green-500)" : "var(--ink-300)"}`, color: panFile ? "var(--green-600)" : "var(--ink-500)", gap: 6, cursor: "pointer", marginTop: -6 }}>
              <Camera size={24} />
              <span className="small semi">{panFile ? `✓ ${panFile.name}` : "Upload PAN card photo"}</span>
              <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPanFile(f); showToast("PAN added"); } }} />
            </label>
          </>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        <button
          className="btn btn-primary btn-block"
          disabled={!canNext || submitting}
          onClick={() => (step < 4 ? setStep(step + 1) : submit())}
        >
          {step < 4 ? "Continue" : submitting ? "Submitting…" : "Submit for review"}
        </button>
      </div>
    </div>
  );
}
