import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { catalogService, businessService, uploadService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Camera, Phone, Calendar, CheckCircle2, FileCheck, Store } from "@/components/Icons";
import { useApp } from "@/store";
import LocationPicker from "@/components/LocationPicker";
import RadiusSelector from "@/components/RadiusSelector";
import HoursSelector from "@/components/HoursSelector";
import { DEFAULT_ONBOARD_WORKING_HOURS } from "@/utils/availability";

import { reverseGeocodeFull } from "@/lib/geocode";

const steps = ["Basics", "Location", "Photos", "Contact"];

export default function BusinessOnboard() {
  const nav = useNavigate();
  const { user, addRole, showToast, refreshUser } = useApp();
  const { data: categories, loading: catLoading, error: catError, refetch: refetchCats } = useQuery(() => catalogService.getCategories("BUSINESS"), [], "categories:BUSINESS");
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [sub, setSub] = useState<string[]>([]);
  const [broadcastRadius, setBroadcastRadius] = useState(5);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Pune");
  const [pincode, setPincode] = useState("");
  const [hours, setHours] = useState(DEFAULT_ONBOARD_WORKING_HOURS);
  const [photos, setPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const [phone, setPhone] = useState("");
  const [openDate, setOpenDate] = useState("");
  const [offer, setOffer] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  const cats = (categories ?? []).sort((a, b) => a.slug === "other" ? 1 : b.slug === "other" ? -1 : 0);
  const selectedCat = cats.find((c) => c.id === cat);

  const canNext = [
    name.trim().length > 1 && !!cat,
    address.trim().length > 4 && lat !== null && lng !== null,
    true,
    phone.replace(/\D/g, "").length === 10,
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
      const subNames = sub.map(id => selectedCat?.children?.find(ch => ch.id === id)?.name || id);
      const biz = await businessService.create({
        name,
        categoryId: cat ?? undefined,
        subCategory: subNames.join(", ") || undefined,
        categoryName: selectedCat?.name || undefined,
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
          <div style={{ width: 96, height: 96, borderRadius: "50%", background: "var(--green-100)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop 0.4s ease" }}>
            <CheckCircle2 size={52} color="var(--green-500)" />
          </div>
          <h1 className="bold h1" style={{ marginTop: 24 }}>Submitted for review</h1>
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.5, maxWidth: 290 }}>
            We'll verify your business within ~24 hours. Once approved, <span className="semi" style={{ color: "var(--ink-900)" }}>3,247 nearby users</span> get a silent heads-up that you're open.
          </p>
          <div className="card" style={{ marginTop: 24, width: "100%", textAlign: "left" }}>
            <div className="row gap-10"><Store size={20} color="var(--orange-500)" /><div><div className="semi small">{name || "Your business"}</div><div className="tiny muted">{selectedCat?.name} • Under review</div></div></div>
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
      <AppBar title="List your business" subtitle={`Step ${step + 1} of 4 • ${steps[step]}`} onBack={() => (step === 0 ? nav(-1) : setStep(step - 1))} />

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
                      {c.icon} {c.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              )}
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
              </div>
            )}
            <div className="field" style={{ marginTop: 14 }}>
              <RadiusSelector
                value={broadcastRadius}
                onChange={setBroadcastRadius}
                accentColor="var(--brand-600)"
                label="Broadcast radius"
                description="Specify how far you want to announce your business opening."
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
                    if (res.city) setCity(res.city);
                    if (res.pincode) setPincode(res.pincode);
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
              <HoursSelector
                value={hours}
                onChange={setHours}
                accentColor="var(--brand-600)"
                label="Hours"
                description="Specify open and close hours"
              />
            </div>
          </>
        )}

      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        <button
          className="btn btn-primary btn-block"
          disabled={!canNext || submitting}
          onClick={() => (step < 3 ? setStep(step + 1) : submit())}
        >
          {step < 3 ? "Continue" : submitting ? "Submitting…" : "Submit for review"}
        </button>
      </div>
    </div>
  );
}
