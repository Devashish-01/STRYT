import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Skeleton, ErrorView } from "@/components/states";
import { providerService, catalogService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { X, Plus } from "@/components/Icons";
import RadiusSelector from "@/components/RadiusSelector";


export default function ProviderProfileEditor() {
  const { id = "" } = useParams();
  const { data: p, loading } = useQuery(() => providerService.get(id), [id], `provider:${id}`);
  // Same top-level-only category source ProviderOnboard.tsx uses — a
  // provider was never given a way to change this after onboarding at all
  // (Business's own ProfileEditor.tsx at least had the chip picker, even
  // though — separately fixed — it wasn't actually being saved).
  const { data: categoriesData } = useQuery(() => catalogService.byKind("SERVICE"), [], "categories:SERVICE");
  const cats = categoriesData ?? [];
  const { showToast } = useApp();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [price, setPrice] = useState("");
  const [radius, setRadius] = useState(5);
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!p) return;
    setDisplayName(p.displayName ?? "");
    setBio(p.bio);
    setPrice(p.startingPrice?.toString() ?? "");
    setRadius(p.serviceRadiusKm);
    setSkills(p.skills);
    setCat(p.categoryId);
  }, [p]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Edit profile" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  async function save() {
    if (displayName.trim().length < 2) {
      showToast("Enter a display name");
      return;
    }
    setSaving(true);
    try {
      const newCat = cats.find((c) => c.id === cat);
      await providerService.update(id, {
        displayName: displayName.trim(),
        bio, startingPrice: Number(price), serviceRadiusKm: radius, skills,
        categoryId: cat ?? undefined,
        // Business Packages resolves from categoryName — without this, a
        // provider could never correct a wrong package suggestion short of
        // re-onboarding.
        categoryName: newCat?.name ?? p?.categoryName,
      });
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
      <AppBar title="Edit profile" subtitle={displayName || p?.displayName} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        <div className="field"><label>Display name</label><input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} placeholder="What customers see" /></div>
        <div className="field"><label>Short bio</label><textarea className="input" value={bio} onChange={(e) => setBio(e.target.value)} /></div>

        <div className="field">
          <label>Category</label>
          <div className="row wrap gap-8">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${cat === c.id ? "active" : ""}`}
                style={cat === c.id ? { background: "var(--green-500)", borderColor: "var(--green-500)" } : undefined}
                onClick={() => setCat(c.id)}
              >
                {c.icon} {c.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>

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
            accentColor="var(--green-500)"
            label="Service radius"
            description="How far you'll travel to serve, and how far your posts and stories reach nearby customers."
          />
        </div>

        <p className="tiny muted" style={{ lineHeight: 1.5 }}>
          Working days & hours are set separately in <span className="semi" style={{ color: "var(--green-600)" }}>Profile → Schedule</span>.
        </p>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        <button className="btn btn-green btn-block" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </div>
  );
}
