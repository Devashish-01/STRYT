import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Skeleton } from "@/components/states";
import { providerService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { X, Plus } from "lucide-react";
import RadiusSelector from "@/components/RadiusSelector";
import HoursSelector from "@/components/HoursSelector";


export default function ProviderProfileEditor() {
  const { id = "p1" } = useParams();
  const { data: p, loading } = useQuery(() => providerService.get(id), [id]);
  const { showToast } = useApp();
  const [bio, setBio] = useState("");
  const [price, setPrice] = useState("");
  const [radius, setRadius] = useState(5);
  const [avail, setAvail] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!p) return;
    setBio(p.bio);
    setPrice(p.startingPrice?.toString() ?? "");
    setRadius(p.serviceRadiusKm);
    setAvail(p.availabilityNote);
    setSkills(p.skills);
  }, [p]);

  async function save() {
    setSaving(true);
    try {
      await providerService.update(id, { bio, startingPrice: Number(price), serviceRadiusKm: radius, availabilityNote: avail, skills });
      showToast("Profile saved");
    } catch {
      showToast("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

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
      <AppBar title="Edit profile" subtitle={p?.displayName} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        <div className="field"><label>Short bio</label><textarea className="input" value={bio} onChange={(e) => setBio(e.target.value)} /></div>

        <div className="field">
          <label>Skills</label>
          <div className="row wrap gap-8">
            {skills.map((s) => (
              <span key={s} className="chip active" style={{ paddingRight: 6 }}>
                {s}
                <button onClick={() => setSkills((p) => p.filter((x) => x !== s))} style={{ color: "#fff", marginLeft: 4 }}><X size={13} /></button>
              </span>
            ))}
          </div>
          <div className="row gap-8" style={{ marginTop: 8 }}>
            <input className="input grow" placeholder="Add a skill" value={newSkill} onChange={(e) => setNewSkill(e.target.value)} />
            <button className="btn btn-ghost btn-sm" disabled={!newSkill.trim()} onClick={() => { setSkills((p) => [...p, newSkill.trim()]); setNewSkill(""); }}><Plus size={16} /></button>
          </div>
        </div>

        <div className="field">
          <label>Starting price (₹)</label>
          <input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
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
            value={avail}
            onChange={setAvail}
            accentColor="#16a34a"
            label="Availability timing"
            description="Specify when you are available for customer bookings"
          />
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        <button className="btn btn-green btn-block" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </div>
  );
}
