import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { Skeleton, ErrorView } from "@/components/states";
import { catalogService, businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import RadiusSelector from "@/components/RadiusSelector";
import MiniMap from "@/components/MiniMap";
import LocationPicker from "@/components/LocationPicker";
import { MapPin, X } from "@/components/Icons";


export default function ProfileEditor() {
  const { id = "" } = useParams();
  const { data: b, loading, refetch } = useQuery(() => businessService.get(id), [id]);
  const { data: categories } = useQuery(() => catalogService.getCategories(), []);
  const { showToast } = useApp();

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Edit Profile" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [broadcastRadius, setBroadcastRadius] = useState(5);
  const [saving, setSaving] = useState(false);

  // Business location change is review-gated — the owner can only *request* a
  // move via an explicit full-map picker; it never touches the live location
  // until an admin approves it. (Never auto-updates from device GPS.)
  const [locModalOpen, setLocModalOpen] = useState(false);
  const [pickLat, setPickLat] = useState<number | null>(null);
  const [pickLng, setPickLng] = useState<number | null>(null);
  const [requestingLoc, setRequestingLoc] = useState(false);
  const locationPending = (b as any)?.locationReviewStatus === "PENDING";

  function openLocationPicker() {
    // Seed the picker with the current live location so it opens on the shop's
    // existing spot (and so LocationPicker won't auto-detect device GPS).
    setPickLat(b?.lat ?? null);
    setPickLng(b?.lng ?? null);
    setLocModalOpen(true);
  }

  async function submitLocationChange() {
    if (pickLat == null || pickLng == null) return;
    setRequestingLoc(true);
    try {
      await businessService.requestLocationChange(id, pickLat, pickLng);
      showToast("Location change submitted for admin review");
      setLocModalOpen(false);
      refetch();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't submit location change");
    } finally {
      setRequestingLoc(false);
    }
  }


  // Seed form once the business loads.
  useEffect(() => {
    if (!b) return;
    setName(b.name);
    setDesc(b.description);
    setCat(b.categoryId);
    setAddress(b.addressLine1);
    setCity(b.city);
    setPincode(b.pincode);
    setPhone(b.phone);
    setWhatsapp(b.whatsapp ?? "");
    setBroadcastRadius(b.broadcastRadius ?? 5);
  }, [b]);


  const cats = categories ?? [];
  const valid = name.trim().length > 1 && city.trim().length > 0;

  async function save() {
    if (!valid) return;
    setSaving(true);
    await businessService.update(id, { name, description: desc, addressLine1: address, city, pincode, phone, whatsapp, broadcastRadius });
    showToast("Profile saved");
    setSaving(false);
  }


  const parentCat = cats.find((c) => c.id === cat || c.children?.some((ch) => ch.id === cat));

  if (loading) {
    return (
      <div className="screen">
        <AppBar title="Edit profile" />
        <div className="page-pad col gap-12" style={{ marginTop: 12 }}>
          <Skeleton h={130} mb={0} />
          <Skeleton h={44} mb={0} />
          <Skeleton h={80} mb={0} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="Edit profile" subtitle={b?.name} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        {/* Live preview */}
        <div className="card" style={{ overflow: "hidden" }}>
          <SafeImg src={b?.coverImage} style={{ width: "100%", height: 110, objectFit: "cover" }} />
          <div style={{ padding: 12 }}>
            <div className="bold">{name || "Business name"}</div>
            <div className="tiny muted">{parentCat?.name} • {city}</div>
          </div>
        </div>

        <div className="field"><label>Business name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Description</label><textarea className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div className="field">
          <label>Category</label>
          <div className="row wrap gap-8">
            {cats.map((c) => (
              <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} onClick={() => setCat(c.id)}>{c.icon} {c.name.split(" ")[0]}</button>
            ))}
          </div>
        </div>
        <div className="field"><label>Address</label><textarea className="input" style={{ minHeight: 64 }} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="row gap-10">
          <div className="field grow"><label>City</label><input className="input" value={city} onChange={(e) => setCity(e.target.value)} /></div>
          <div className="field grow"><label>Pincode</label><input className="input" inputMode="numeric" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} /></div>
        </div>

        {/* Business location — map pin, changed only via the full-map picker
            below and only after admin approval. */}
        <div className="field">
          <label>Business location</label>
          {b?.lat && b?.lng ? (
            <MiniMap lat={b.lat} lng={b.lng} pinColor="var(--orange-500)" height={150} label={b.city || b.addressLine1 || undefined} />
          ) : (
            <div className="card tiny muted" style={{ padding: 12 }}>No map location set yet.</div>
          )}
          {locationPending ? (
            <div className="card row gap-8" style={{ padding: 10, marginTop: 8, background: "var(--ink-50)", alignItems: "center" }}>
              <MapPin size={15} color="var(--ink-500)" />
              <span className="tiny muted">Location change pending admin review — you'll be notified once it's approved.</span>
            </div>
          ) : (
            <button type="button" className="btn btn-outline btn-block row center gap-8" style={{ marginTop: 8 }} onClick={openLocationPicker}>
              <MapPin size={16} /> Request location change
            </button>
          )}
          <span className="tiny muted" style={{ marginTop: 6, display: "block", lineHeight: 1.5 }}>
            Moving your shop needs admin approval. Your current location stays live until the change is approved.
          </span>
        </div>

        <div className="field"><label>Phone</label><input className="input" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="field"><label>WhatsApp</label><input className="input" inputMode="numeric" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></div>
        <div className="field">
          <RadiusSelector
            value={broadcastRadius}
            onChange={setBroadcastRadius}
            accentColor="var(--brand-600)"
            label="Broadcast radius"
            description="Specify how far you want to announce your business."
          />
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        <button className="btn btn-primary btn-block" disabled={saving || !valid} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
      </div>

      {locModalOpen && (
        <div className="overlay" style={{ zIndex: 1100 }} onClick={() => setLocModalOpen(false)}>
          <div
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", maxHeight: "95vh", display: "flex", flexDirection: "column", borderRadius: "24px 24px 0 0", padding: "20px 16px calc(24px + var(--safe-area-bottom))" }}
          >
            <div className="sheet-grab" style={{ background: "var(--ink-200)" }} />
            <div className="row between" style={{ marginBottom: 12 }}>
              <div className="row gap-8">
                <MapPin size={20} color="var(--brand-700)" />
                <h3 className="bold h2">Set business location</h3>
              </div>
              <button
                onClick={() => setLocModalOpen(false)}
                style={{ background: "var(--ink-100)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--ink-700)" }}
              >
                <X size={16} />
              </button>
            </div>
            <p className="tiny muted" style={{ marginBottom: 12, lineHeight: 1.5 }}>
              Tap the map or drag the pin to your shop's exact spot. This is submitted for admin review — your live location won't change until it's approved.
            </p>
            <LocationPicker
              lat={pickLat}
              lng={pickLng}
              storedLat={b?.lat ?? undefined}
              storedLng={b?.lng ?? undefined}
              pinColor="var(--orange-500)"
              height={320}
              onChange={(newLat, newLng) => { setPickLat(newLat); setPickLng(newLng); }}
              onError={(msg) => showToast(msg)}
            />
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 14 }}
              disabled={requestingLoc || pickLat == null || pickLng == null}
              onClick={submitLocationChange}
            >
              {requestingLoc ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
