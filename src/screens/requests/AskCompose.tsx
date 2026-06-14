import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Camera, MapPin, IndianRupee, Calendar, Sparkles, X, Flame, Repeat, EyeOff, Mic } from "lucide-react";
import { catalogService, requestService, aiService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";

interface Template {
  label: string;
  emoji: string;
  title: string;
  catSlug: string; // resolved against loaded categories by slug, not hardcoded id
  fields: { key: string; label: string; options?: string[]; placeholder?: string }[];
}

const templates: Template[] = [
  { label: "Birthday cake", emoji: "🎂", title: "Need a custom birthday cake", catSlug: "food-beverage", fields: [
    { key: "flavour", label: "Flavour", options: ["Chocolate", "Red Velvet", "Vanilla", "Butterscotch"] },
    { key: "weight", label: "Weight", options: ["0.5 kg", "1 kg", "2 kg"] },
    { key: "eggless", label: "Eggless?", options: ["Yes", "No"] },
  ]},
  { label: "Plumber", emoji: "🚰", title: "Need a plumber", catSlug: "home-repair", fields: [
    { key: "issue", label: "Issue", options: ["Leak", "Blockage", "Fitting", "Geyser"] },
    { key: "urgent", label: "Urgent today?", options: ["Yes", "No"] },
  ]},
  { label: "AC service", emoji: "❄️", title: "Need AC service", catSlug: "home-repair", fields: [
    { key: "type", label: "AC type", options: ["Split", "Window"] },
    { key: "work", label: "Work", options: ["Service", "Gas refill", "Install", "Repair"] },
  ]},
  { label: "Daily tiffin", emoji: "🍱", title: "Need a daily tiffin", catSlug: "food-beverage", fields: [
    { key: "diet", label: "Diet", options: ["Veg", "Non-veg", "Jain"] },
    { key: "meals", label: "Meals", options: ["Lunch", "Dinner", "Both"] },
  ]},
];

export default function AskCompose() {
  const nav = useNavigate();
  const { area, user, showToast } = useApp();
  const { data: categories } = useQuery(() => catalogService.getCategories(), []);
  const [template, setTemplate] = useState<Template | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [fieldVals, setFieldVals] = useState<Record<string, string>>({});
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [deadline, setDeadline] = useState("");
  const [radius, setRadius] = useState(3);
  const [photos, setPhotos] = useState<number[]>([]);
  const [urgent, setUrgent] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [anon, setAnon] = useState(false);
  const [posting, setPosting] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast("Voice not supported in this browser"); return; }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "hi-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    rec.onresult = (e: any) => {
      const transcript: string = e.results[0][0].transcript;
      setDesc((d) => (d ? d + " " + transcript : transcript));
      if (!title.trim()) setTitle(transcript.slice(0, 80));
      // Fire AI auto-categorize in background; populate fields if Gemini responds
      void aiService.categorize(transcript).then((result) => {
        if (!result) return;
        if (result.title && !title.trim()) setTitle(result.title.slice(0, 80));
        if (result.urgency) setUrgent(true);
        if (result.budget_hint && !budgetMax) setBudgetMax(String(result.budget_hint));
        if (result.category && (categories ?? []).length > 0) {
          const matched = (categories ?? []).find(
            (c) => c.slug === result.category || c.name.toLowerCase().includes(result.category ?? "")
          );
          if (matched) setCat(matched.id);
        }
      });
    };
    rec.onerror = () => { showToast("Voice error. Try again."); setListening(false); };
    rec.onend = () => setListening(false);

    rec.start();
    setListening(true);
  }

  // Description is optional — only title + category are required to post.
  const canPost = title.trim().length > 3 && !!cat && !posting;
  const missing = !title.trim() ? "title" : !cat ? "category" : null;

  const stockPhotos = ["photo-1578985545062-69928b1d9587", "photo-1530103862676-de8c9debad1d", "photo-1556911220-bff31c812dba"];

  function applyTemplate(t: Template) {
    setTemplate(t);
    setTitle(t.title);
    // Resolve category by slug — categories may still be loading, handled by useEffect below.
    const matched = (categories ?? []).find((c) => c.slug === t.catSlug);
    setCat(matched?.id ?? null);
    setFieldVals({});
  }

  // Re-resolve template category when categories finish loading (handles the race where
  // the user taps a template before the category list arrives from the DB).
  useEffect(() => {
    if (template && (categories ?? []).length > 0 && !cat) {
      const matched = categories!.find((c) => c.slug === template.catSlug);
      if (matched) setCat(matched.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  async function post() {
    setPosting(true);
    try {
      // Prefer stored user coordinates; fall back to browser geolocation.
      let lat = user.lat;
      let lng = user.lng;
      if (!lat && !lng && navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
            () => resolve(),
            { timeout: 4000 }
          );
        });
      }
      const selectedCategory = (categories ?? []).find((c) => c.id === cat);
      await requestService.create({
        title,
        description: desc,
        categoryId: cat,
        categoryName: selectedCategory?.name,
        budgetMin: budgetMin ? Number(budgetMin) : undefined,
        budgetMax: budgetMax ? Number(budgetMax) : undefined,
        deadline,
        radiusKm: radius,
        isUrgent: urgent,
        isRecurring: recurring,
        isAnonymous: anon,
        area,
        lat: lat || 0,
        lng: lng || 0,
      });
      showToast("Request posted! Notifying nearby providers…");
      setTimeout(() => nav("/requests"), 600);
    } catch {
      showToast("Couldn't post. Try again.");
      setPosting(false);
    }
  }

  return (
    <div className="screen">
      <AppBar title="Post a request" subtitle="Tell the neighborhood what you need" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        <div className="card row gap-10" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
          <Sparkles size={20} color="#6b21cc" />
          <span className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.4 }}>
            Nearby people, shops & providers will see this and send you offers. You pick the best one.
          </span>
        </div>

        {/* Templates */}
        <div className="field">
          <label>Quick start</label>
          <div className="hscroll" style={{ padding: 0, marginLeft: -2 }}>
            {templates.map((t) => (
              <button key={t.label} className={`chip ${template?.label === t.label ? "active" : ""}`} onClick={() => applyTemplate(t)}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>What do you need? *</label>
          <input className="input" placeholder="e.g. Need a custom birthday cake" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </div>

        {/* Smart fields from template */}
        {template && template.fields.length > 0 && (
          <div className="card col gap-12" style={{ padding: 14 }}>
            <div className="tiny semi muted">Help responders quote accurately</div>
            {template.fields.map((f) => (
              <div key={f.key} className="field">
                <label style={{ fontSize: 12 }}>{f.label}</label>
                {f.options ? (
                  <div className="row wrap gap-8">
                    {f.options.map((o) => (
                      <button
                        key={o}
                        className={`chip ${fieldVals[f.key] === o ? "active" : ""}`}
                        style={{ padding: "6px 12px", fontSize: 12.5 }}
                        onClick={() => {
                          setFieldVals((v) => ({ ...v, [f.key]: o }));
                          if (f.key === "urgent" && o === "Yes") setUrgent(true);
                        }}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input className="input" placeholder={f.placeholder} value={fieldVals[f.key] ?? ""} onChange={(e) => setFieldVals((v) => ({ ...v, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <label>Category *</label>
          {(categories ?? []).length === 0 ? (
            <div className="tiny muted">Loading categories…</div>
          ) : (
            <div className="row wrap gap-8">
              {(categories ?? []).map((c) => (
                <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} onClick={() => setCat(c.id)}>
                  {c.icon} {c.name.split(" ")[0]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <label>Details <span className="tiny muted">(optional)</span></label>
          <div style={{ position: "relative" }}>
            <textarea className="input" placeholder="Describe size, flavour, timing, location details…" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <button className="icon-btn" style={{ position: "absolute", bottom: 8, right: 8, background: listening ? "#fee2e2" : "var(--brand-50)", color: listening ? "#dc2626" : "var(--brand-700)" }} onClick={toggleVoice}>
              <Mic size={18} />
            </button>
          </div>
        </div>

        <div className="field">
          <label>Photos (optional)</label>
          <div className="row gap-8 wrap">
            {photos.map((idx) => (
              <div key={idx} style={{ position: "relative" }}>
                <img src={`https://images.unsplash.com/${stockPhotos[idx]}?auto=format&fit=crop&w=200&q=70`} className="thumb" style={{ width: 76, height: 76, borderRadius: 12 }} />
                <button className="icon-btn" style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24, background: "#ef4444", color: "#fff" }} onClick={() => setPhotos((p) => p.filter((x) => x !== idx))}>
                  <X size={14} />
                </button>
              </div>
            ))}
            {photos.length < stockPhotos.length && (
              <button className="col center" style={{ width: 76, height: 76, borderRadius: 12, border: "2px dashed var(--ink-300)", color: "var(--ink-500)", gap: 2 }} onClick={() => setPhotos((p) => [...p, p.length])}>
                <Camera size={20} />
                <span className="tiny">Add</span>
              </button>
            )}
          </div>
        </div>

        <div className="field">
          <label>Budget (₹)</label>
          <div className="row gap-10">
            <div className="row grow" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 10px", background: "#fff" }}>
              <IndianRupee size={16} color="var(--ink-400)" />
              <input className="input" style={{ border: "none" }} inputMode="numeric" placeholder="Min" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="row grow" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 10px", background: "#fff" }}>
              <IndianRupee size={16} color="var(--ink-400)" />
              <input className="input" style={{ border: "none" }} inputMode="numeric" placeholder="Max" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
        </div>

        <div className="field">
          <label>Needed by</label>
          <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 12px", background: "#fff" }}>
            <Calendar size={16} color="var(--ink-400)" />
            <input className="input" style={{ border: "none" }} placeholder="e.g. Saturday evening" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>

        {/* Toggles */}
        <div className="col gap-8">
          <ToggleRow icon={<Flame size={18} color="#ef4444" />} label="Mark as urgent" hint="Pushes to providers faster" on={urgent} set={setUrgent} />
          <ToggleRow icon={<Repeat size={18} color="#3b82f6" />} label="Recurring need" hint="e.g. every weekday / weekly" on={recurring} set={setRecurring} />
          <ToggleRow icon={<EyeOff size={18} color="#6b21cc" />} label="Post anonymously" hint="Name hidden until you agree" on={anon} set={setAnon} />
        </div>

        <div className="field">
          <label className="row between"><span className="row gap-4"><MapPin size={14} /> Visible within</span><span style={{ color: "var(--brand-700)" }}>{radius} km of {area}</span></label>
          <input type="range" min={1} max={15} value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ width: "100%", accentColor: "#6b21cc" }} />
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: "8px 12px 12px" }}>
        {missing && (
          <p className="tiny muted" style={{ textAlign: "center", marginBottom: 6 }}>
            {missing === "title" ? "Add a title to continue" : "Select a category to continue"}
          </p>
        )}
        <button
          className="btn btn-primary btn-block"
          disabled={!canPost}
          onClick={() => void post()}
        >
          {posting ? "Posting…" : "Post request"}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({ icon, label, hint, on, set }: { icon: React.ReactNode; label: string; hint: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button className="card row gap-12" style={{ padding: 12, textAlign: "left", border: on ? "1.5px solid var(--brand-400)" : "1px solid var(--line)" }} onClick={() => set(!on)}>
      {icon}
      <div className="grow">
        <div className="semi small">{label}</div>
        <div className="tiny muted">{hint}</div>
      </div>
      <span style={{ width: 44, height: 26, borderRadius: 999, background: on ? "var(--brand-600)" : "var(--ink-200)", position: "relative", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
      </span>
    </button>
  );
}
