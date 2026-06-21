import { useState } from "react";
import { AppBar } from "@/components/common";
import { MapPin, Moon, Volume2, Globe, Shield, Eye, Navigation, Loader, HeartPulse, Search } from "lucide-react";
import { useApp } from "@/store";
import { userService } from "@/services";
import { useI18n, LANG_LABELS, type Lang } from "@/lib/i18n";
import { reverseGeocode, forwardGeocode, type GeoPlace } from "@/lib/geocode";

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
  const { area, setArea, showToast, refreshUser, user } = useApp();
  const [locating, setLocating] = useState(false);
  const [areaInput, setAreaInput] = useState(area);
  const [aliasInput, setAliasInput] = useState(user.alias ?? "");

  async function saveAlias() {
    const a = aliasInput.trim();
    if (!a || a === user.alias) return;
    try {
      await userService.update({ alias: a });
      await refreshUser();
      showToast("Public handle saved");
    } catch {
      showToast("Couldn't save handle");
    }
  }
  const [silent, setSilent] = useState(true);
  const [ecName, setEcName] = useState(user.emergencyContactName ?? "");
  const [ecPhone, setEcPhone] = useState(user.emergencyContact ?? "");

  // Remote / custom location search (#1)
  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);

  async function searchPlaces(q: string) {
    setLocQuery(q);
    if (q.trim().length < 2) { setLocResults([]); return; }
    setSearching(true);
    try {
      setLocResults(await forwardGeocode(q));
    } finally {
      setSearching(false);
    }
  }

  async function pickPlace(p: GeoPlace) {
    try {
      await userService.setLocation(p.lat, p.lng, p.area);
      await refreshUser();
      setArea(p.area);
      setAreaInput(p.area);
      setLocQuery("");
      setLocResults([]);
      showToast(`Location set — ${p.area}`);
    } catch {
      showToast("Couldn't set that location");
    }
  }

  async function refreshGPS() {
    if (!navigator.geolocation) {
      showToast("Geolocation not available on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // Auto-name the area from the fix; keep the typed name only if lookup fails.
        const areaName = (await reverseGeocode(latitude, longitude)) || areaInput || area;
        try {
          await userService.setLocation(latitude, longitude, areaName);
          await refreshUser();
          setArea(areaName);
          setAreaInput(areaName);
          showToast(`Location updated — ${areaName} ✓`);
        } catch {
          showToast("Couldn't update location");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        showToast("Location access denied");
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  async function saveEc() {
    if (!ecName.trim() && !ecPhone.trim()) return;
    try {
      await userService.update({ emergencyContactName: ecName.trim(), emergencyContact: ecPhone.trim() });
      showToast("Emergency contact saved");
    } catch {
      showToast("Couldn't save. Try again.");
    }
  }

  async function saveArea() {
    if (!areaInput.trim()) return;
    try {
      await userService.setLocation(user.lat || 0, user.lng || 0, areaInput.trim());
      setArea(areaInput.trim());
      showToast("Area name saved");
    } catch {
      showToast("Couldn't save area name");
    }
  }
  const [quiet, setQuiet] = useState(true);
  const [newBiz, setNewBiz] = useState(true);
  const [newProv, setNewProv] = useState(false);
  const [reqs, setReqs] = useState(true);
  const [offers, setOffers] = useState(true);
  const [approx, setApprox] = useState(true);
  const [radius, setRadius] = useState(5);
  const { lang, setLang } = useI18n();
  const langs = Object.entries(LANG_LABELS) as [Lang, string][];

  return (
    <div className="screen">
      <AppBar title="Settings" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 40 }}>
        {/* Public handle / alias (#6) */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Public handle</div>
          <div className="card" style={{ padding: 14 }}>
            <input
              className="input"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onBlur={saveAlias}
              placeholder="e.g. SunnyResident"
            />
            <div className="tiny muted" style={{ marginTop: 8, lineHeight: 1.4 }}>
              This is the name neighbours see on your posts, comments and requests. Your real
              name stays private until you accept or agree to a request.
            </div>
          </div>
        </div>

        {/* Location */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Location</div>
          <div className="card" style={{ padding: 14 }}>
            <div className="row gap-10">
              <MapPin size={20} color="var(--brand-700)" style={{ flexShrink: 0 }} />
              <div className="grow">
                <input
                  className="input"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                  onBlur={saveArea}
                  style={{ border: "none", padding: 0, fontWeight: 600, width: "100%" }}
                  placeholder="Your neighbourhood"
                />
                {user.lat && user.lng ? (
                  <span className="tiny muted">
                    {user.lat.toFixed(4)}°, {user.lng.toFixed(4)}°
                  </span>
                ) : (
                  <span className="tiny" style={{ color: "#f26a00" }}>No coordinates — tap below to set GPS</span>
                )}
              </div>
            </div>
            <div className="divider" />
            <button
              className="btn btn-outline btn-block btn-sm row center gap-8"
              disabled={locating}
              onClick={refreshGPS}
            >
              {locating ? <Loader size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Navigation size={15} />}
              {locating ? "Getting location…" : "Use my current GPS location"}
            </button>
            <div className="tiny muted" style={{ marginTop: 8, textAlign: "center" }}>
              Updating GPS coordinates refreshes your local feed and map.
            </div>

            <div className="divider" />

            {/* Set a different / remote location (#1) */}
            <div className="small semi" style={{ marginBottom: 8 }}>Browse a different area</div>
            <div className="row gap-8" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 10px", background: "#fff" }}>
              <Search size={16} color="var(--ink-400)" />
              <input
                className="input"
                style={{ border: "none", padding: "10px 0" }}
                placeholder="Search any area, e.g. Marathahalli"
                value={locQuery}
                onChange={(e) => void searchPlaces(e.target.value)}
              />
              {searching && <Loader size={14} style={{ animation: "spin 1s linear infinite", color: "var(--ink-400)" }} />}
            </div>
            {locResults.length > 0 && (
              <div className="col" style={{ marginTop: 8, border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                {locResults.map((p, i) => (
                  <button
                    key={`${p.lat},${p.lng}`}
                    className="row gap-8"
                    style={{ padding: "10px 12px", textAlign: "left", borderBottom: i < locResults.length - 1 ? "1px solid var(--line)" : "none", background: "#fff" }}
                    onClick={() => void pickPlace(p)}
                  >
                    <MapPin size={15} color="var(--brand-600)" style={{ flexShrink: 0 }} />
                    <div className="grow">
                      <div className="semi small">{p.area}</div>
                      <div className="tiny muted ellipsis">{p.full}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="tiny muted" style={{ marginTop: 8 }}>
              Sets your feed & map to that area until you switch back to GPS.
            </div>

            <div className="divider" />
            <div className="row between small semi">
              <span>Notification radius</span>
              <span style={{ color: "var(--brand-700)" }}>{radius} km</span>
            </div>
            <input type="range" min={1} max={15} value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--brand-600)", marginTop: 8 }} />
          </div>
        </div>

        {/* Emergency contact */}
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}>
            <HeartPulse size={14} /> Emergency contact
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="field" style={{ marginBottom: 10 }}>
              <label className="tiny semi muted">Contact name</label>
              <input
                className="input"
                placeholder="e.g. Mom, Dad, Partner"
                value={ecName}
                onChange={(e) => setEcName(e.target.value)}
                onBlur={saveEc}
                style={{ marginTop: 4 }}
              />
            </div>
            <div className="field">
              <label className="tiny semi muted">Mobile number</label>
              <input
                className="input"
                placeholder="10-digit number"
                inputMode="numeric"
                maxLength={10}
                value={ecPhone}
                onChange={(e) => setEcPhone(e.target.value.replace(/\D/g, ""))}
                onBlur={saveEc}
                style={{ marginTop: 4 }}
              />
            </div>
            <div className="tiny muted" style={{ marginTop: 8, lineHeight: 1.4 }}>
              Used only if you trigger SOS during an active job. Never shared otherwise.
            </div>
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
