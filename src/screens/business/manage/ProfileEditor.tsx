import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { Skeleton, ErrorView } from "@/components/states";
import { catalogService, businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import RadiusSelector from "@/components/RadiusSelector";


export default function ProfileEditor() {
  const { id = "" } = useParams();
  const { data: b, loading } = useQuery(() => businessService.get(id), [id]);
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
    </div>
  );
}
