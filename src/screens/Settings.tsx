import { useState, useEffect } from "react";
import { AppBar } from "@/components/common";
import { Moon, Volume2, Globe, Shield, Eye } from "lucide-react";
import { useApp } from "@/store";
import { userService } from "@/services";
import { useI18n, LANG_LABELS, type Lang } from "@/lib/i18n";

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 46,
        height: 28,
        borderRadius: 999,
        background: on ? "var(--brand-600)" : "var(--ink-200)",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

export default function Settings() {
  const { user, showToast } = useApp();
  const [silent, setSilent] = useState(() => localStorage.getItem("settings_silent") !== "false");
  const [quiet, setQuiet] = useState(() => localStorage.getItem("settings_quiet") !== "false");
  const [newBiz, setNewBiz] = useState(() => localStorage.getItem("settings_new_biz") !== "false");
  const [newProv, setNewProv] = useState(() => localStorage.getItem("settings_new_prov") === "true");
  const [reqs, setReqs] = useState(() => localStorage.getItem("settings_reqs") !== "false");
  const [offers, setOffers] = useState(() => localStorage.getItem("settings_offers") !== "false");
  const [approx, setApprox] = useState(() => localStorage.getItem("settings_approx") !== "false");
  const [radius, setRadius] = useState(() => {
    const saved = localStorage.getItem("settings_radius");
    return saved ? Number(saved) : (user.notificationRadiusKm || 5);
  });

  useEffect(() => {
    localStorage.setItem("settings_silent", String(silent));
  }, [silent]);

  useEffect(() => {
    localStorage.setItem("settings_quiet", String(quiet));
  }, [quiet]);

  useEffect(() => {
    localStorage.setItem("settings_new_biz", String(newBiz));
  }, [newBiz]);

  useEffect(() => {
    localStorage.setItem("settings_new_prov", String(newProv));
  }, [newProv]);

  useEffect(() => {
    localStorage.setItem("settings_reqs", String(reqs));
  }, [reqs]);

  useEffect(() => {
    localStorage.setItem("settings_offers", String(offers));
  }, [offers]);

  useEffect(() => {
    localStorage.setItem("settings_approx", String(approx));
  }, [approx]);

  useEffect(() => {
    localStorage.setItem("settings_radius", String(radius));
    if (user.id && radius !== user.notificationRadiusKm) {
      void userService.update({ notificationRadiusKm: radius }).catch(() => {});
    }
  }, [radius, user.id, user.notificationRadiusKm]);

  const { lang, setLang } = useI18n();
  const langs = Object.entries(LANG_LABELS) as [Lang, string][];

  return (
    <div className="screen">
      <AppBar title="Settings" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 40 }}>
        {/* Notification Radius */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Notification radius</div>
          <div className="card" style={{ padding: 14 }}>
            <div className="row between small semi">
              <span>Radius</span>
              <span style={{ color: "var(--brand-700)" }}>{radius} km</span>
            </div>
            <input type="range" min={1} max={15} value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--brand-600)", marginTop: 8 }} />
          </div>
        </div>

        {/* Notifications */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Notifications</div>
          <div className="card">
            <Row icon={<Moon size={18} color="#6366f1" />} label="Silent notifications" hint="Badge only, no sound" on={silent} set={setSilent} />
            <Row icon={<Volume2 size={18} color="#f59e0b" />} label="Quiet hours (10 PM–7 AM)" on={quiet} set={setQuiet} />
            <div className="divider" style={{ margin: 0 }} />
            <Row label="New businesses nearby" on={newBiz} set={setNewBiz} />
            <Row label="New providers nearby" on={newProv} set={setNewProv} />
            <Row label="Nearby requests" on={reqs} set={setReqs} />
            <Row label="Offers & deals" on={offers} set={setOffers} last />
          </div>
        </div>

        {/* Privacy */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Privacy & safety</div>
          <div className="card">
            <Row icon={<Eye size={18} color="#16a34a" />} label="Show approximate location" hint="Exact only after agreement" on={approx} set={setApprox} last />
          </div>
        </div>

        {/* Language */}
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><Globe size={14} /> Language</div>
          <div className="row gap-8">
            {langs.map(([code, label]) => (
              <button
                key={code}
                className={`chip ${lang === code ? "active" : ""}`}
                onClick={() => { setLang(code as Lang); showToast(`Language set to ${label}`); }}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 14, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
          <div className="row gap-8 small" style={{ color: "var(--brand-700)" }}>
            <Shield size={18} />
            <span>Your data is yours. We store only your last location, never a trail. Request deletion anytime.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, hint, on, set, last }: { icon?: React.ReactNode; label: string; hint?: string; on: boolean; set: (v: boolean) => void; last?: boolean }) {
  return (
    <div className="row gap-12" style={{ padding: "13px 14px", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      {icon}
      <div className="grow">
        <div className="semi small">{label}</div>
        {hint && <div className="tiny muted">{hint}</div>}
      </div>
      <Toggle on={on} onChange={set} />
    </div>
  );
}
