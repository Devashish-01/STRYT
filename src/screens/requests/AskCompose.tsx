import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Camera, MapPin, IndianRupee, Sparkles, X, Flame, Repeat, EyeOff, Mic, Clock } from "lucide-react";
import { catalogService, requestService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";

interface Template {
  label: string;
  emoji: string;
  title: string;
  catSlug: string;
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

// ── Date helpers ──────────────────────────────────────────────

function getDateChips(): { label: string; sub: string; iso: string }[] {
  const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    return {
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAY[d.getDay()],
      sub: `${d.getDate()} ${MON[d.getMonth()]}`,
      iso: d.toISOString().split("T")[0],
    };
  });
}

const SLOTS = [
  { key: "morning",   label: "Morning",   emoji: "🌅", hours: [6,7,8,9,10,11] },
  { key: "afternoon", label: "Afternoon", emoji: "☀️", hours: [12,13,14,15] },
  { key: "evening",   label: "Evening",   emoji: "🌆", hours: [16,17,18,19] },
  { key: "night",     label: "Night",     emoji: "🌙", hours: [20,21,22,23] },
] as const;

function fmtHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

const DURATIONS = ["1 hr", "2 hrs", "3 hrs", "4 hrs", "Half day", "Full day"];

// ─────────────────────────────────────────────────────────────

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
  const [paymentMode, setPaymentMode] = useState<"" | "fixed" | "hourly">("");
  const [schedDate, setSchedDate] = useState("");
  const [schedSlot, setSchedSlot] = useState("");
  const [schedHour, setSchedHour] = useState<number | null>(null);
  const [schedDuration, setSchedDuration] = useState("");
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
      if (!title.trim()) setTitle(transcript.slice(0, 150));
      if ((categories ?? []).length > 0) {
        const lower = transcript.toLowerCase();
        const matched = (categories ?? []).find(
          (c) => lower.includes(c.name.toLowerCase()) || lower.includes((c.slug ?? "").toLowerCase())
        );
        if (matched) setCat(matched.id);
      }
    };
    rec.onerror = () => { showToast("Voice error. Try again."); setListening(false); };
    rec.onend = () => setListening(false);

    rec.start();
    setListening(true);
  }

  // Build human-readable deadline string for the API
  function buildDeadline(): string {
    const parts: string[] = [];
    if (paymentMode === "hourly") parts.push("Hourly");
    else if (paymentMode === "fixed") parts.push("Fixed price");

    if (schedDate) {
      const chips = getDateChips();
      const chip = chips.find((c) => c.iso === schedDate);
      parts.push(chip ? (chip.label === "Today" || chip.label === "Tomorrow" ? chip.label : `${chip.label} ${chip.sub}`) : schedDate);
    }
    if (schedSlot) {
      const slot = SLOTS.find((s) => s.key === schedSlot);
      if (slot) parts.push(slot.label);
    }
    if (schedHour !== null) parts.push(`${fmtHour(schedHour)}${schedDuration ? ` · ${schedDuration}` : ""}`);
    else if (schedDuration) parts.push(schedDuration);

    return parts.join(" · ");
  }

  const canPost = title.trim().length > 3 && !!cat && !posting;
  const missing = !title.trim() ? "title" : !cat ? "category" : null;

  const stockPhotos = ["photo-1578985545062-69928b1d9587", "photo-1530103862676-de8c9debad1d", "photo-1556911220-bff31c812dba"];

  function applyTemplate(t: Template) {
    setTemplate(t);
    setTitle(t.title);
    const matched = (categories ?? []).find((c) => c.slug === t.catSlug);
    setCat(matched?.id ?? null);
    setFieldVals({});
  }

  useEffect(() => {
    if (template && (categories ?? []).length > 0 && !cat) {
      const matched = categories!.find((c) => c.slug === template.catSlug);
      if (matched) setCat(matched.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  // Reset time/duration when slot changes
  useEffect(() => {
    setSchedHour(null);
    setSchedDuration("");
  }, [schedSlot]);

  async function post() {
    setPosting(true);
    try {
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
        deadline: buildDeadline(),
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

  const activeSlot = SLOTS.find((s) => s.key === schedSlot);
  const budgetLabel = paymentMode === "hourly" ? "Rate per hour (₹)" : "Budget (₹)";
  const budgetMinPlaceholder = paymentMode === "hourly" ? "Min/hr" : "Min";
  const budgetMaxPlaceholder = paymentMode === "hourly" ? "Max/hr" : "Max";

  return (
    <div className="screen">
      <AppBar title="Post a request" subtitle="Tell your street what you need" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        <div className="card row gap-10" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
          <Sparkles size={20} color="var(--brand-600)" />
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

        {/* Title — increased limit to 150 */}
        <div className="field">
          <label className="row between">
            <span>What do you need? *</span>
            <span className="tiny muted">{title.length}/150</span>
          </label>
          <input
            className="input"
            placeholder="e.g. Need a custom birthday cake for Sunday"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
          />
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

        {/* Category */}
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

        {/* Details */}
        <div className="field">
          <label>Details <span className="tiny muted">(optional)</span></label>
          <div style={{ position: "relative" }}>
            <textarea
              className="input"
              style={{ minHeight: 100 }}
              placeholder="Describe size, colour, materials, any special requirements…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={500}
            />
            <button
              className="icon-btn"
              style={{ position: "absolute", bottom: 8, right: 8, background: listening ? "#fee2e2" : "var(--brand-50)", color: listening ? "#dc2626" : "var(--brand-700)" }}
              onClick={toggleVoice}
            >
              <Mic size={18} />
            </button>
          </div>
          {desc.length > 400 && (
            <span className="tiny muted" style={{ textAlign: "right" }}>{desc.length}/500</span>
          )}
        </div>

        {/* Photos */}
        <div className="field">
          <label>Photos <span className="tiny muted">(optional)</span></label>
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

        {/* ── Payment mode + budget ── */}
        <div className="field">
          <label>Payment type</label>
          <div className="row gap-10" style={{ marginBottom: 12 }}>
            <button
              className={`chip grow center ${paymentMode === "fixed" ? "active" : ""}`}
              style={{ gap: 6 }}
              onClick={() => setPaymentMode(paymentMode === "fixed" ? "" : "fixed")}
            >
              <IndianRupee size={14} /> Full amount
            </button>
            <button
              className={`chip grow center ${paymentMode === "hourly" ? "active" : ""}`}
              style={{ gap: 6 }}
              onClick={() => setPaymentMode(paymentMode === "hourly" ? "" : "hourly")}
            >
              <Clock size={14} /> Hourly rate
            </button>
          </div>

          <label>{budgetLabel} <span className="tiny muted">(optional)</span></label>
          <div className="row gap-10">
            <div className="row grow" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 10px", background: "#fff" }}>
              <IndianRupee size={16} color="var(--ink-400)" />
              <input className="input" style={{ border: "none" }} inputMode="numeric" placeholder={budgetMinPlaceholder} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="row grow" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 10px", background: "#fff" }}>
              <IndianRupee size={16} color="var(--ink-400)" />
              <input className="input" style={{ border: "none" }} inputMode="numeric" placeholder={budgetMaxPlaceholder} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
        </div>

        {/* ── When do you need it ── */}
        <div className="field">
          <label>When do you need it? <span className="tiny muted">(optional)</span></label>

          {/* Date strip */}
          <div className="hscroll" style={{ padding: "0 0 4px", marginLeft: -2 }}>
            {getDateChips().map((chip) => (
              <button
                key={chip.iso}
                onClick={() => setSchedDate(schedDate === chip.iso ? "" : chip.iso)}
                className={`chip col center ${schedDate === chip.iso ? "active" : ""}`}
                style={{ gap: 1, padding: "8px 14px", minWidth: 64 }}
              >
                <span style={{ fontSize: 12, fontWeight: 700 }}>{chip.label}</span>
                <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 500 }}>{chip.sub}</span>
              </button>
            ))}
          </div>

          {/* Time slot */}
          <div className="row gap-8 wrap" style={{ marginTop: 10 }}>
            {SLOTS.map((s) => (
              <button
                key={s.key}
                className={`chip ${schedSlot === s.key ? "active" : ""}`}
                style={{ gap: 5 }}
                onClick={() => setSchedSlot(schedSlot === s.key ? "" : s.key)}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>

          {/* Hour blocks — shown when a slot is selected */}
          {activeSlot && (
            <div className="col gap-8" style={{ marginTop: 10 }}>
              <div className="tiny semi muted" style={{ marginBottom: 2 }}>Pick a start time</div>
              <div className="row wrap gap-8">
                {activeSlot.hours.map((h) => (
                  <button
                    key={h}
                    className={`chip ${schedHour === h ? "active" : ""}`}
                    style={{ padding: "6px 12px", fontSize: 12.5 }}
                    onClick={() => setSchedHour(schedHour === h ? null : h)}
                  >
                    {fmtHour(h)}
                  </button>
                ))}
              </div>

              {/* Duration — shown when a start time is picked */}
              {schedHour !== null && (
                <>
                  <div className="tiny semi muted" style={{ marginTop: 4, marginBottom: 2 }}>How long?</div>
                  <div className="row wrap gap-8">
                    {DURATIONS.map((d) => (
                      <button
                        key={d}
                        className={`chip ${schedDuration === d ? "active" : ""}`}
                        style={{ padding: "6px 12px", fontSize: 12.5 }}
                        onClick={() => setSchedDuration(schedDuration === d ? "" : d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Preview */}
          {buildDeadline() && (
            <div className="row gap-8" style={{ marginTop: 10, padding: "9px 12px", background: "var(--brand-50)", borderRadius: 10, border: "1px solid var(--brand-100)" }}>
              <Clock size={14} color="var(--brand-600)" />
              <span className="tiny semi" style={{ color: "var(--brand-700)" }}>{buildDeadline()}</span>
            </div>
          )}
        </div>

        {/* Toggles */}
        <div className="col gap-8">
          <ToggleRow icon={<Flame size={18} color="#ef4444" />} label="Mark as urgent" hint="Pushes to providers faster" on={urgent} set={setUrgent} />
          <ToggleRow icon={<Repeat size={18} color="#3b82f6" />} label="Recurring need" hint="e.g. every weekday / weekly" on={recurring} set={setRecurring} />
          <ToggleRow icon={<EyeOff size={18} color="var(--brand-600)" />} label="Post anonymously" hint="Name hidden until you agree" on={anon} set={setAnon} />
        </div>

        <div className="field">
          <label className="row between">
            <span className="row gap-4"><MapPin size={14} /> Visible within</span>
            <span style={{ color: "var(--brand-700)" }}>{radius} km of {area}</span>
          </label>
          <input type="range" min={1} max={15} value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--brand-600)" }} />
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
