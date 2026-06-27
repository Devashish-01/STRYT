import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Phone, MapPin, ChevronRight } from "lucide-react";
import { useApp } from "@/store";
import { userService } from "@/services/userService";

/**
 * UserOnboard — shown once after first login (or when name is still "New user").
 * Name is required. Everything else is optional and can be filled later in Profile.
 * No phone verification — we just record the number as contact info.
 */
export default function UserOnboard() {
  const nav = useNavigate();
  const { user, refreshUser, showToast } = useApp();

  const [name, setName] = useState(
    user.name && user.name !== "New user" ? user.name : ""
  );
  const [phone, setPhone] = useState(user.phone ?? "");
  const [area, setArea] = useState(user.area ?? "");
  const [saving, setSaving] = useState(false);

  const nameOk = name.trim().length >= 2;

  async function handleSave() {
    if (!nameOk) { showToast("Please enter your name (at least 2 characters)"); return; }
    setSaving(true);
    try {
      await userService.update({
        name: name.trim(),
        ...(phone.replace(/\D/g, "").length === 10 ? { phone: phone.replace(/\D/g, "") } : {}),
        ...(area.trim() ? { area: area.trim() } : {}),
      });
      await refreshUser();
      showToast(`Welcome, ${name.trim().split(" ")[0]}! 👋`);
      // Go to location prompt if no coords yet, else home
      const locationSeen = localStorage.getItem("locationPromptShown") === "true";
      nav(!user.lat && !locationSeen ? "/auth/location" : "/home", { replace: true });
    } catch {
      showToast("Couldn't save profile — please try again");
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    // Still need at least a placeholder name so FK constraints don't block queries
    if (!user.name || user.name === "New user") {
      try { await userService.update({ name: "Neighbor" }); } catch { /* soft */ }
      await refreshUser().catch(() => {});
    }
    const locationSeen = localStorage.getItem("locationPromptShown") === "true";
    nav(!user.lat && !locationSeen ? "/auth/location" : "/home", { replace: true });
  }

  return (
    <div className="screen" style={{ background: "var(--ink-50)" }}>
      <div className="screen-scroll page-pad col" style={{ paddingTop: 48, paddingBottom: 48, gap: 0 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: "linear-gradient(135deg, #8b47f5, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
          }}>
            <User size={32} color="#fff" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>
            Set up your profile
          </h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 15, lineHeight: 1.5 }}>
            Tell your neighbors who you are.{"\n"}You can always edit this later.
          </p>
        </div>

        {/* Name — required */}
        <div className="field" style={{ marginBottom: 16 }}>
          <label className="row gap-8" style={{ alignItems: "center", marginBottom: 6 }}>
            <User size={14} color="var(--ink-500)" />
            <span>Your name <span style={{ color: "#ef4444", fontSize: 12 }}>required</span></span>
          </label>
          <input
            className="input"
            placeholder="e.g. Priya Sharma"
            value={name}
            maxLength={60}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          {name.length > 0 && !nameOk && (
            <p className="tiny" style={{ color: "#ef4444", marginTop: 4 }}>
              At least 2 characters needed
            </p>
          )}
        </div>

        {/* Phone — optional (no verification) */}
        <div className="field" style={{ marginBottom: 16 }}>
          <label className="row gap-8" style={{ alignItems: "center", marginBottom: 6 }}>
            <Phone size={14} color="var(--ink-500)" />
            <span>Phone number <span className="tiny muted">(optional)</span></span>
          </label>
          <div className="row" style={{
            border: "1.5px solid var(--ink-200)", borderRadius: "var(--radius-sm)",
            overflow: "hidden", background: "#fff",
          }}>
            <span className="row gap-6 semi tiny" style={{
              padding: "12px 14px", borderRight: "1.5px solid var(--ink-200)",
              background: "var(--ink-50)", flexShrink: 0,
            }}>
              🇮🇳 +91
            </span>
            <input
              className="input"
              style={{ border: "none", flex: 1, padding: "12px 14px", fontSize: 16 }}
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit mobile"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <p className="tiny muted" style={{ marginTop: 4 }}>
            Used only so neighbours can reach you — no verification needed.
          </p>
        </div>

        {/* Area — optional */}
        <div className="field" style={{ marginBottom: 32 }}>
          <label className="row gap-8" style={{ alignItems: "center", marginBottom: 6 }}>
            <MapPin size={14} color="var(--ink-500)" />
            <span>Neighbourhood <span className="tiny muted">(optional)</span></span>
          </label>
          <input
            className="input"
            placeholder="e.g. Aundh, Pune"
            value={area}
            maxLength={80}
            onChange={(e) => setArea(e.target.value)}
          />
        </div>

        {/* CTA */}
        <button
          className="btn btn-primary btn-block"
          disabled={!nameOk || saving}
          onClick={handleSave}
          style={{ borderRadius: "var(--radius)", padding: "14px", fontSize: 16, fontWeight: 700 }}
        >
          {saving ? "Saving…" : "Save & Continue"}
          {!saving && <ChevronRight size={18} style={{ marginLeft: 4 }} />}
        </button>

        <button
          className="btn btn-ghost btn-block"
          onClick={handleSkip}
          disabled={saving}
          style={{ marginTop: 12, color: "var(--ink-400)", fontSize: 14 }}
        >
          Skip for now
        </button>

        <p className="tiny muted" style={{ textAlign: "center", marginTop: 16 }}>
          Your info is only shared with people you interact with on Stryt.
        </p>
      </div>
    </div>
  );
}
