import { useState, useEffect } from "react";
import { AppBar } from "@/components/common";
import { Moon, Volume2, Globe, Shield, Eye, Pencil } from "lucide-react";
import { useApp } from "@/store";
import { userService } from "@/services";
import { useI18n, LANG_LABELS, type Lang } from "@/lib/i18n";

const RADIUS_OPTIONS = [
  { label: "500m", km: 0.5 },
  { label: "2 km", km: 2 },
  { label: "5 km", km: 5 },
  { label: "10 km", km: 10 },
  { label: "25 km", km: 25 },
  { label: "World", km: 5000 },
];

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
  const { user, refreshUser, showToast } = useApp();
  const [silent, setSilent] = useState(() => localStorage.getItem("settings_silent") !== "false");
  const [quiet, setQuiet] = useState(() => localStorage.getItem("settings_quiet") !== "false");
  const [newBiz, setNewBiz] = useState(() => localStorage.getItem("settings_new_biz") !== "false");
  const [newProv, setNewProv] = useState(() => localStorage.getItem("settings_new_prov") !== "false");
  const [reqs, setReqs] = useState(() => localStorage.getItem("settings_reqs") !== "false");
  const [offers, setOffers] = useState(() => localStorage.getItem("settings_offers") !== "false");
  const [approx, setApprox] = useState(() => localStorage.getItem("settings_approx") !== "false");
  const [showPosts, setShowPosts] = useState(() => {
    const saved = localStorage.getItem("settings_show_posts");
    return saved !== null ? saved === "true" : (user.showPostsPublicly ?? true);
  });
  const [showAsks, setShowAsks] = useState(() => {
    const saved = localStorage.getItem("settings_show_asks");
    return saved !== null ? saved === "true" : (user.showAsksPublicly ?? true);
  });
  const [showBadges, setShowBadges] = useState(() => {
    const saved = localStorage.getItem("settings_show_badges");
    return saved !== null ? saved === "true" : (user.showBadgesPublicly ?? true);
  });
  const [radius, setRadius] = useState(() => {
    const saved = localStorage.getItem("settings_radius");
    return saved ? Number(saved) : (user.notificationRadiusKm || 5);
  });

  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const presetKms = new Set<number>(RADIUS_OPTIONS.map((o) => o.km));
  const isCustomActive = !presetKms.has(radius);

  function handlePresetClick(km: number) {
    setRadius(km);
    setShowCustom(false);
  }

  function handleCustomApply() {
    const n = parseFloat(customVal);
    if (!isNaN(n) && n > 0) {
      const rounded = Math.round(n * 10) / 10;
      setRadius(rounded);
    }
    setShowCustom(false);
  }

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

  function handleTogglePosts(v: boolean) {
    setShowPosts(v);
    localStorage.setItem("settings_show_posts", String(v));
    showToast(v ? "Posts are now visible on public profile" : "Posts hidden on public profile");
    void userService.update({ showPostsPublicly: v }).catch(() => {});
  }

  function handleToggleAsks(v: boolean) {
    setShowAsks(v);
    localStorage.setItem("settings_show_asks", String(v));
    showToast(v ? "Service requests visible on public profile" : "Service requests hidden on public profile");
    void userService.update({ showAsksPublicly: v }).catch(() => {});
  }

  function handleToggleBadges(v: boolean) {
    setShowBadges(v);
    localStorage.setItem("settings_show_badges", String(v));
    showToast(v ? "Badges visible on public profile" : "Badges hidden on public profile");
    void userService.update({ showBadgesPublicly: v }).catch(() => {});
  }

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
            <div className="row between small semi" style={{ marginBottom: 12 }}>
              <span>Radius</span>
              <span style={{ color: "var(--brand-700)" }}>{radius >= 5000 ? "World" : `${radius} km`}</span>
            </div>

            {showCustom ? (
              <div className="row gap-8">
                <input
                  type="number"
                  step="0.1"
                  className="input grow"
                  style={{ padding: "8px 12px", fontSize: 13, height: 36 }}
                  placeholder="Radius in km..."
                  value={customVal}
                  onChange={(e) => setCustomVal(e.target.value)}
                  autoFocus
                />
                <button
                  className="btn btn-primary btn-sm"
                  style={{ height: 36, padding: "0 12px" }}
                  onClick={handleCustomApply}
                >
                  Apply
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ height: 36, padding: "0 12px" }}
                  onClick={() => setShowCustom(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{
                display: "flex",
                gap: 4,
                overflowX: "auto",
                scrollbarWidth: "none",
                padding: "2px 0",
              }}>
                {RADIUS_OPTIONS.map((opt) => {
                  const active = radius === opt.km;
                  return (
                    <button
                      key={opt.km}
                      onClick={() => handlePresetClick(opt.km)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 16,
                        border: "none",
                        background: active ? "var(--brand-600)" : "var(--ink-100)",
                        color: active ? "#fff" : "var(--ink-700)",
                        fontWeight: active ? 700 : 500,
                        fontSize: 12.5,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        transition: "background 0.15s, color 0.15s",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    setCustomVal(isCustomActive ? String(radius) : "");
                    setShowCustom(true);
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 16,
                    border: "none",
                    background: isCustomActive ? "var(--brand-600)" : "var(--ink-100)",
                    color: isCustomActive ? "#fff" : "var(--ink-700)",
                    fontWeight: isCustomActive ? 700 : 500,
                    fontSize: 12.5,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  <Pencil size={11} strokeWidth={2.5} />
                  {isCustomActive ? `${radius} km` : "Custom"}
                </button>
              </div>
            )}
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
            <Row label="Show nearby providers" hint="Hide providers from your discovery feeds & map (They can still see and quote your requests)" on={newProv} set={setNewProv} />
            <Row label="Nearby requests" on={reqs} set={setReqs} />
            <Row label="Offers & deals" on={offers} set={setOffers} last />
          </div>
        </div>

        {/* Privacy */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Privacy & safety</div>
          <div className="card">
            <Row icon={<Eye size={18} color="#16a34a" />} label="Show approximate location" hint="Exact only after agreement" on={approx} set={setApprox} />
            <div className="divider" style={{ margin: 0 }} />
            <Row label="Show Posts publicly" hint="Allow neighbors to see your community posts on your profile" on={showPosts} set={handleTogglePosts} />
            <Row label="Show Service Requests publicly" hint="Allow neighbors to see your open & past asks" on={showAsks} set={handleToggleAsks} />
            <Row label="Show Badges publicly" hint="Show trust badges & verifications on your profile" on={showBadges} set={handleToggleBadges} last />
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
