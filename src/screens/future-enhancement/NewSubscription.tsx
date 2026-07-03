import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { subscriptionService } from "@/services/subscriptionService";
import { useApp } from "@/store";

const FREQ_OPTIONS = [
  { id: "DAILY", label: "Daily", desc: "Every day (maid, milk, newspaper)" },
  { id: "WEEKLY", label: "Weekly", desc: "Once a week (cleaning, laundry)" },
  { id: "MONTHLY", label: "Monthly", desc: "Once a month (maintenance, etc.)" },
] as const;

export default function NewSubscription() {
  const nav = useNavigate();
  const { showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    providerName: "",
    providerPhone: "",
    frequency: "DAILY" as "DAILY" | "WEEKLY" | "MONTHLY",
    pricePerPeriod: "",
  });

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function save() {
    setBusy(true);
    try {
      const sub = await subscriptionService.create({
        providerUserId: form.providerPhone || "manual",
        providerName: form.providerName,
        providerAvatar: "",
        title: form.title,
        description: form.description,
        frequency: form.frequency,
        pricePerPeriod: Number(form.pricePerPeriod) || 0,
        startDate: new Date().toISOString().split("T")[0],
      });
      showToast("Subscription created ✓");
      nav(`/subscriptions/${sub.id}`, { replace: true });
    } catch (e: any) {
      showToast(e.message || "Failed to create");
    } finally { setBusy(false); }
  }

  const valid = form.title.trim() && form.providerName.trim();

  return (
    <div className="screen">
      <AppBar title="Add recurring service" />
      <div className="screen-scroll page-pad col gap-14" style={{ paddingTop: 16, paddingBottom: 100 }}>
        <div className="field">
          <label className="tiny semi muted">Service name</label>
          <input className="input" placeholder="e.g. Maid, Milk delivery, Cook" value={form.title}
            onChange={(e) => set("title", e.target.value)} style={{ marginTop: 4 }} />
        </div>
        <div className="field">
          <label className="tiny semi muted">Provider name</label>
          <input className="input" placeholder="e.g. Sunita bai, Aarav Dairy" value={form.providerName}
            onChange={(e) => set("providerName", e.target.value)} style={{ marginTop: 4 }} />
        </div>
        <div className="field">
          <label className="tiny semi muted">Provider phone (optional — to link their STRYT account)</label>
          <input className="input" placeholder="10-digit number" inputMode="numeric" maxLength={10} value={form.providerPhone}
            onChange={(e) => set("providerPhone", e.target.value.replace(/\D/g, ""))} style={{ marginTop: 4 }} />
        </div>

        <div>
          <label className="tiny semi muted" style={{ marginBottom: 8, display: "block" }}>Frequency</label>
          <div className="col gap-8">
            {FREQ_OPTIONS.map((f) => (
              <button key={f.id} onClick={() => set("frequency", f.id)}
                className="card row gap-12"
                style={{ padding: "12px 14px", border: form.frequency === f.id ? "2px solid var(--brand-600)" : "1px solid var(--line)", background: form.frequency === f.id ? "var(--brand-50)" : "#fff", textAlign: "left" }}>
                <div className="grow">
                  <div className="semi small">{f.label}</div>
                  <div className="tiny muted">{f.desc}</div>
                </div>
                {form.frequency === f.id && <div style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--brand-600)", flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="tiny semi muted">Price per {form.frequency === "DAILY" ? "day" : form.frequency === "WEEKLY" ? "week" : "month"} (₹)</label>
          <input className="input" placeholder="e.g. 500" inputMode="numeric" value={form.pricePerPeriod}
            onChange={(e) => set("pricePerPeriod", e.target.value.replace(/\D/g, ""))} style={{ marginTop: 4 }} />
        </div>

        <div className="field">
          <label className="tiny semi muted">Notes (optional)</label>
          <input className="input" placeholder="Any special instructions" value={form.description}
            onChange={(e) => set("description", e.target.value)} style={{ marginTop: 4 }} />
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 12, background: "#fff", borderTop: "1px solid var(--line)" }}>
        <button className="btn btn-primary btn-block" disabled={!valid || busy} onClick={save}>
          {busy ? "Saving…" : "Start tracking"}
        </button>
      </div>
    </div>
  );
}
